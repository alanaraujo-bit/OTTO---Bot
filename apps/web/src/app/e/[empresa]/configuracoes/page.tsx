import type { Metadata } from 'next';
import { AlertCircle, MapPin, Users2 } from 'lucide-react';
import { Etiqueta } from '@otto/ui';

import { ROTULO_PAPEL, pode } from '@otto/core/auth';
import {
  and,
  asc,
  channels,
  desc,
  eq,
  memberships,
  tenantLocations,
  tenants,
  users,
  withTenant,
} from '@otto/db';

import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Configurações' };

const ROTULO_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram Direct',
  simulador: 'Canal de teste',
};

const TOM_CANAL: Record<string, 'ok' | 'atencao' | 'falha' | 'neutro'> = {
  conectado: 'ok',
  degradado: 'atencao',
  pausado: 'atencao',
  desconectado: 'falha',
  nao_conectado: 'neutro',
};

const ROTULO_STATUS_CANAL: Record<string, string> = {
  conectado: 'Conectado',
  degradado: 'Instável',
  pausado: 'Pausado',
  desconectado: 'Desconectado',
  nao_conectado: 'Não conectado',
};

export default async function PaginaConfiguracoes({
  params,
}: {
  params: Promise<{ empresa: string }>;
}) {
  const { empresa: slug } = await params;
  const acesso = await exigirAcesso(slug);

  const dados = await withTenant(acesso.empresa.id, async (tx) => {
    const [empresa] = await tx
      .select({
        nome: tenants.displayName,
        razaoSocial: tenants.legalName,
        fuso: tenants.timezone,
        status: tenants.status,
      })
      .from(tenants)
      .where(eq(tenants.id, acesso.empresa.id))
      .limit(1);

    const unidades = await tx
      .select({
        id: tenantLocations.id,
        nome: tenantLocations.name,
        principal: tenantLocations.isPrimary,
        rua: tenantLocations.street,
        numero: tenantLocations.number,
        bairro: tenantLocations.district,
        cidade: tenantLocations.city,
        uf: tenantLocations.state,
        telefone: tenantLocations.phone,
      })
      .from(tenantLocations)
      .where(eq(tenantLocations.isActive, true))
      .orderBy(desc(tenantLocations.isPrimary), asc(tenantLocations.name));

    const canais = await tx
      .select({
        id: channels.id,
        tipo: channels.kind,
        nome: channels.name,
        status: channels.status,
        identificador: channels.externalHandle,
        ultimoEvento: channels.lastEventAt,
      })
      .from(channels)
      .orderBy(asc(channels.name));

    const equipe = await tx
      .select({
        id: users.id,
        nome: users.name,
        email: users.email,
        papel: memberships.role,
        ativo: memberships.isActive,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.isActive, true))
      .orderBy(asc(users.name));

    return { empresa, unidades, canais, equipe };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Configurações</h1>
        <p className="mt-0.5 text-sm text-texto-2">
          Dados da empresa, unidades, canais e equipe.
        </p>
      </header>

      <div className="grid gap-7">
        <Secao titulo="Empresa">
          <dl className="grid gap-0">
            <Linha rotulo="Nome" valor={dados.empresa?.nome ?? '—'} />
            {dados.empresa?.razaoSocial && (
              <Linha rotulo="Razão social" valor={dados.empresa.razaoSocial} />
            )}
            <Linha rotulo="Fuso horário" valor={dados.empresa?.fuso ?? '—'} />
            <Linha
              rotulo="Situação"
              valor={
                <Etiqueta tom={dados.empresa?.status === 'ativo' ? 'ok' : 'atencao'}>
                  {dados.empresa?.status === 'ativo' ? 'Ativa' : 'Suspensa'}
                </Etiqueta>
              }
            />
          </dl>
        </Secao>

        <Secao
          titulo="Unidades"
          descricao="Endereço e horário saem daqui — é o que o atendente virtual responde quando perguntam onde fica e que horas abre."
        >
          {dados.unidades.length === 0 ? (
            <Aviso
              icone={<MapPin />}
              texto="Nenhuma unidade cadastrada. Sem isso, o atendente virtual não consegue informar endereço nem horário, e encaminha essas perguntas para a equipe."
            />
          ) : (
            <ul>
              {dados.unidades.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-start gap-2 border-b border-linha px-3 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-texto">
                      {u.nome}
                      {u.principal && <Etiqueta tom="marca">Principal</Etiqueta>}
                    </p>
                    <p className="mt-0.5 text-2xs text-texto-3">
                      {[
                        u.rua && u.numero ? `${u.rua}, ${u.numero}` : u.rua,
                        u.bairro,
                        u.cidade && u.uf ? `${u.cidade}/${u.uf}` : u.cidade,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'endereço não informado'}
                      {u.telefone && ` · ${u.telefone}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Canais">
          {dados.canais.length === 0 ? (
            <Aviso
              icone={<AlertCircle />}
              texto="Nenhum canal conectado. Sem um canal, nenhuma mensagem chega ao produto."
            />
          ) : (
            <ul>
              {dados.canais.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 border-b border-linha px-3 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-texto">{c.nome}</p>
                    <p className="mt-0.5 text-2xs text-texto-3">
                      {ROTULO_CANAL[c.tipo] ?? c.tipo}
                      {c.identificador && ` · ${c.identificador}`}
                    </p>
                  </div>
                  <Etiqueta tom={TOM_CANAL[c.status] ?? 'neutro'} ponto>
                    {ROTULO_STATUS_CANAL[c.status] ?? c.status}
                  </Etiqueta>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Equipe">
          {dados.equipe.length === 0 ? (
            <Aviso icone={<Users2 />} texto="Nenhuma pessoa com acesso além de você." />
          ) : (
            <ul>
              {dados.equipe.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 border-b border-linha px-3 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-texto">{p.nome}</p>
                    <p className="truncate text-2xs text-texto-3">{p.email}</p>
                  </div>
                  <Etiqueta tom={p.papel === 'proprietario' ? 'marca' : 'neutro'}>
                    {ROTULO_PAPEL[p.papel].nome}
                  </Etiqueta>
                </li>
              ))}
            </ul>
          )}

          {pode(acesso, 'usuario.convidar') && (
            <p className="border-t border-linha px-3 py-2.5 text-2xs text-texto-3">
              O convite de novas pessoas por e-mail entra junto com o envio de e-mails
              transacionais. Até lá, o acesso é criado por nós.
            </p>
          )}
        </Secao>
      </div>
    </div>
  );
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
        {titulo}
      </h2>
      {descricao && <p className="mb-2 max-w-[64ch] text-xs text-texto-3">{descricao}</p>}
      <div className="overflow-hidden rounded-md border border-linha bg-superficie">{children}</div>
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-linha px-3 py-2.5 last:border-0">
      <dt className="text-xs text-texto-2">{rotulo}</dt>
      <dd className="ml-auto text-sm text-texto">{valor}</dd>
    </div>
  );
}

function Aviso({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-3">
      <span aria-hidden className="mt-0.5 text-texto-3 [&>svg]:size-4 [&>svg]:stroke-[1.5]">
        {icone}
      </span>
      <p className="max-w-[64ch] text-xs text-texto-2">{texto}</p>
    </div>
  );
}
