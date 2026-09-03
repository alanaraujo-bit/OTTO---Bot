import type { Metadata } from 'next';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Etiqueta, Vazio, tempoRelativo } from '@otto/ui';

import { listarClientes } from '@otto/core/contatos';

import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Clientes' };

const ROTULO_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  simulador: 'Teste',
};

export default async function PaginaClientes({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ busca?: string }>;
}) {
  const { empresa: slug } = await params;
  const { busca } = await searchParams;
  const acesso = await exigirAcesso(slug);

  const clientes = await listarClientes(acesso.empresa.id, { busca });

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Clientes</h1>
        <p className="mt-0.5 text-sm text-texto-2">
          {clientes.length === 0
            ? 'Quem já entrou em contato com a sua empresa.'
            : `${clientes.length} ${clientes.length === 1 ? 'pessoa' : 'pessoas'} em contato`}
        </p>
      </header>

      {clientes.length === 0 ? (
        <div className="rounded-md border border-linha bg-superficie">
          <Vazio
            icone={<Users />}
            titulo={busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
            descricao={
              busca
                ? 'Tente outro nome ou número de telefone.'
                : 'Cada pessoa que mandar mensagem por um canal conectado aparece aqui, com o histórico completo das conversas.'
            }
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-md border border-linha bg-superficie">
          {clientes.map((c) => (
            <li key={c.id} className="border-b border-linha last:border-0">
              <Link
                href={
                  c.ultimaConversaId
                    ? `/e/${slug}/conversas/${c.ultimaConversaId}`
                    : `/e/${slug}/clientes`
                }
                className="flex items-center gap-3 px-3 py-2.5 transition-colors duration-[120ms] hover:bg-superficie-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-texto">
                    {c.nome ?? 'Contato sem nome'}
                  </p>
                  <p className="mt-0.5 truncate text-2xs text-texto-3">
                    {c.telefone ?? 'sem telefone'}
                    {c.conversas > 0 &&
                      ` · ${c.conversas} ${c.conversas === 1 ? 'conversa' : 'conversas'}`}
                  </p>
                </div>

                <div className="hidden shrink-0 gap-1 sm:flex">
                  {c.canais.map((canal) => (
                    <Etiqueta key={canal} tom="neutro">
                      {ROTULO_CANAL[canal] ?? canal}
                    </Etiqueta>
                  ))}
                </div>

                {c.ultimaInteracao && (
                  <time
                    dateTime={c.ultimaInteracao.toISOString()}
                    className="shrink-0 text-2xs text-texto-3"
                  >
                    {tempoRelativo(c.ultimaInteracao)}
                  </time>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
