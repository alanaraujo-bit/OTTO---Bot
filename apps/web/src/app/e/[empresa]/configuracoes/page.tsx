import type { Metadata } from 'next';
import { AtSign, MapPin, MessageCircle, FlaskConical } from 'lucide-react';
import { Cartao, Etiqueta, formatarTelefone, tempoRelativo } from '@otto/ui';

import { ROTULO_PAPEL, pode } from '@otto/core/auth';
import {
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
import { Pagina } from '@/componentes/pagina.tsx';

export const metadata: Metadata = { title: 'Configurações' };

const CANAL = {
  whatsapp: { rotulo: 'WhatsApp', Icone: MessageCircle },
  instagram: { rotulo: 'Instagram Direct', Icone: AtSign },
  simulador: { rotulo: 'Canal de teste', Icone: FlaskConical },
} as const;

const TOM_CANAL: Record<string, 'ok' | 'atencao' | 'falha' | 'neutro'> = {
  conectado: 'ok',
  degradado: 'atencao',
  pausado: 'atencao',
  desconectado: 'falha',
  nao_conectado: 'neutro',
};

const STATUS_CANAL: Record<string, string> = {
  conectado: 'Conectado',
  degradado: 'Instável',
  pausado: 'Pausado',
  desconectado: 'Desconectado',
  nao_conectado: 'Não conectado',
};

/** `America/Belem` → `Belém (GMT-3)`. IANA cru é jargão para quem toca uma loja. */
function fusoAmigavel(iana: string | null | undefined): string {
  if (!iana) return '—';
  const cidade = iana.split('/').at(-1)?.replace(/_/g, ' ') ?? iana;
  const nomes: Record<string, string> = {
    Belem: 'Belém',
    Sao_Paulo: 'São Paulo',
    Fortaleza: 'Fortaleza',
    Manaus: 'Manaus',
    Recife: 'Recife',
    Cuiaba: 'Cuiabá',
  };
  const chave = iana.split('/').at(-1) ?? '';
  const offsets: Record<string, string> = {
    'America/Belem': 'GMT-3',
    'America/Fortaleza': 'GMT-3',
    'America/Recife': 'GMT-3',
    'America/Sao_Paulo': 'GMT-3',
    'America/Manaus': 'GMT-4',
    'America/Cuiaba': 'GMT-4',
  };
  const nome = nomes[chave] ?? cidade;
  const off = offsets[iana];
  return off ? `${nome} (${off})` : nome;
}

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
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.isActive, true))
      .orderBy(asc(users.name));

    return { empresa, unidades, canais, equipe };
  });

  const podeConvidar = pode(acesso, 'usuario.convidar');

  return (
    <Pagina largura="padrao">
      <header className="entra mb-5">
        <h1 className="text-texto text-xl font-semibold tracking-[-0.015em]">Configurações</h1>
        <p className="text-texto-2 mt-0.5 text-sm">Dados da empresa, unidades, canais e equipe.</p>
      </header>

      {/*
        Quatro assuntos independentes, nenhum longo. Empilhados numa coluna de
        leitura sobrava tela dos dois lados e obrigava a rolar por algo que cabe
        de uma vez; lado a lado, a tela inteira é a página. `items-start` impede
        que o cartão curto herde a altura do vizinho.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Cartao
          titulo="Empresa"
          className="entra"
          style={{ '--atraso': '40ms' } as React.CSSProperties}
        >
          <dl className="grid gap-0">
            <Linha rotulo="Nome" valor={dados.empresa?.nome ?? '—'} />
            {dados.empresa?.razaoSocial && (
              <Linha rotulo="Razão social" valor={dados.empresa.razaoSocial} />
            )}
            <Linha rotulo="Fuso horário" valor={fusoAmigavel(dados.empresa?.fuso)} />
            <Linha
              rotulo="Situação"
              valor={
                <Etiqueta tom={dados.empresa?.status === 'ativo' ? 'ok' : 'atencao'}>
                  {dados.empresa?.status === 'ativo' ? 'Ativa' : 'Suspensa'}
                </Etiqueta>
              }
            />
          </dl>
        </Cartao>

        <Cartao
          titulo="Unidades"
          descricao="Endereço e horário saem daqui — é o que a Bia responde quando perguntam onde fica e que horas abre."
          className="entra"
          style={{ '--atraso': '80ms' } as React.CSSProperties}
          semPreenchimento
        >
          {dados.unidades.length === 0 ? (
            <Aviso
              icone={<MapPin />}
              texto="Nenhuma unidade cadastrada. Sem isso, a Bia não informa endereço nem horário, e encaminha essas perguntas para a equipe."
            />
          ) : (
            <ul className="divide-linha divide-y">
              {dados.unidades.map((u) => (
                <li key={u.id} className="flex items-start gap-3 px-4 py-2.5">
                  <MapPin
                    aria-hidden
                    strokeWidth={1.5}
                    className={`mt-0.5 size-4 shrink-0 ${u.principal ? 'text-marca' : 'text-texto-3'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-texto flex items-center gap-2 text-sm font-medium">
                      {u.nome}
                      {u.principal && <Etiqueta tom="marca">Principal</Etiqueta>}
                    </p>
                    <p className="text-2xs text-texto-3 mt-0.5">
                      {[
                        u.rua && u.numero ? `${u.rua}, ${u.numero}` : u.rua,
                        u.bairro,
                        u.cidade && u.uf ? `${u.cidade}/${u.uf}` : u.cidade,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'endereço não informado'}
                      {u.telefone && ` · ${formatarTelefone(u.telefone)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao
          titulo="Canais"
          descricao="Por onde as mensagens dos clientes chegam."
          className="entra"
          style={{ '--atraso': '120ms' } as React.CSSProperties}
          semPreenchimento
        >
          {dados.canais.length === 0 ? (
            <Aviso
              icone={<MessageCircle />}
              texto="Nenhum canal conectado. Sem um canal, nenhuma mensagem chega ao produto."
            />
          ) : (
            <ul className="divide-linha divide-y">
              {dados.canais.map((c) => {
                const info = CANAL[c.tipo as keyof typeof CANAL] ?? {
                  rotulo: c.tipo,
                  Icone: MessageCircle,
                };
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="bg-superficie-2 text-texto-3 flex size-8 shrink-0 items-center justify-center rounded-full">
                      <info.Icone aria-hidden strokeWidth={1.5} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-texto text-sm font-medium">{c.nome}</p>
                      <p className="text-2xs text-texto-3 mt-0.5">
                        {info.rotulo}
                        {c.identificador && ` · ${c.identificador}`}
                        {c.ultimoEvento && ` · ativo ${tempoRelativo(c.ultimoEvento)}`}
                      </p>
                    </div>
                    <Etiqueta tom={TOM_CANAL[c.status] ?? 'neutro'} ponto>
                      {STATUS_CANAL[c.status] ?? c.status}
                    </Etiqueta>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        <Cartao
          titulo="Equipe"
          descricao={`${dados.equipe.length} ${dados.equipe.length === 1 ? 'pessoa com acesso' : 'pessoas com acesso'} ao painel.`}
          className="entra"
          style={{ '--atraso': '160ms' } as React.CSSProperties}
          semPreenchimento
        >
          <ul className="divide-linha divide-y">
            {dados.equipe.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  aria-hidden
                  className="bg-superficie-3 text-texto-2 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                >
                  {p.nome.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-texto truncate text-sm font-medium">{p.nome}</p>
                  <p className="text-2xs text-texto-3 truncate">{p.email}</p>
                </div>
                <Etiqueta tom={p.papel === 'proprietario' ? 'marca' : 'neutro'}>
                  {ROTULO_PAPEL[p.papel].nome}
                </Etiqueta>
              </li>
            ))}
          </ul>

          {podeConvidar && (
            <p className="border-linha text-2xs text-texto-3 border-t px-4 py-3">
              O convite de novas pessoas por e-mail entra junto com o envio de e-mails
              transacionais. Até lá, o acesso é criado por nós.
            </p>
          )}
        </Cartao>
      </div>
    </Pagina>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="border-linha grid gap-x-4 gap-y-0.5 border-b py-2 first:pt-0 last:border-0 last:pb-0 sm:grid-cols-[10rem_1fr] sm:items-center">
      <dt className="text-texto-3 sm:text-texto-2 text-xs">{rotulo}</dt>
      <dd className="text-texto text-sm">{valor}</dd>
    </div>
  );
}

function Aviso({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3.5">
      <span aria-hidden className="text-texto-3 mt-0.5 [&>svg]:size-4 [&>svg]:stroke-[1.5]">
        {icone}
      </span>
      <p className="text-texto-2 max-w-[64ch] text-xs">{texto}</p>
    </div>
  );
}
