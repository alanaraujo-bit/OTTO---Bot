import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Inbox } from 'lucide-react';
import { tempoRelativo } from '@otto/ui';

import { contarConversas, listarConversas, type FiltroStatus } from '@otto/core/conversations';
import { formatarDuracao, resumo } from '@otto/core/metricas';
import { tenants, eq, withTenant } from '@otto/db';

import { ListaConversas } from '@/componentes/inbox/lista.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Conversas' };

const FILTROS_VALIDOS: FiltroStatus[] = ['todas', 'aguardando_humano', 'abertas', 'resolvidas'];

/**
 * Inbox sem conversa aberta.
 *
 * No celular, a lista **é** a tela. No desktop ela divide espaço com um painel
 * de triagem que ocupa a largura toda: os números do momento e, lado a lado,
 * quem está esperando e o que está em andamento — para o próximo clique já cair
 * no lugar certo, sem uma borda vazia no meio.
 */
export default async function PaginaConversas({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ status?: string; busca?: string }>;
}) {
  const { empresa: slug } = await params;
  const { status, busca } = await searchParams;
  const acesso = await exigirAcesso(slug);

  const filtro: FiltroStatus = FILTROS_VALIDOS.includes(status as FiltroStatus)
    ? (status as FiltroStatus)
    : 'abertas';

  const [empresa] = await withTenant(acesso.empresa.id, (tx) =>
    tx.select({ fuso: tenants.timezone }).from(tenants).where(eq(tenants.id, acesso.empresa.id)),
  );
  const fuso = empresa?.fuso ?? 'America/Sao_Paulo';

  const [conversas, contagem, esperando, andamento, hoje] = await Promise.all([
    listarConversas(acesso.empresa.id, { status: filtro, busca }),
    contarConversas(acesso.empresa.id),
    listarConversas(acesso.empresa.id, { status: 'aguardando_humano', limite: 14 }),
    listarConversas(acesso.empresa.id, { status: 'abertas', limite: 24 }),
    resumo(acesso.empresa.id, 'hoje', fuso),
  ]);

  const emAndamento = andamento.filter((c) => c.status !== 'aguardando_humano').slice(0, 14);

  return (
    <div className="flex h-full min-h-0">
      <div className="border-linha flex min-h-0 w-full flex-col border-r md:w-[21rem] md:shrink-0 lg:w-[24rem]">
        <ListaConversas
          conversas={conversas}
          contagem={contagem}
          empresaSlug={slug}
          filtroAtual={filtro}
          buscaAtual={busca}
        />
      </div>

      <div className="bg-fundo hidden min-w-0 flex-1 overflow-y-auto md:block">
        <div className="mx-auto flex min-h-full max-w-[80rem] flex-col px-6 py-6 lg:px-9 lg:py-8">
          <header className="mb-4">
            <h1 className="text-texto text-lg font-semibold tracking-[-0.01em]">
              {esperando.length > 0 ? 'Comece por quem está esperando' : 'Tudo sob controle'}
            </h1>
            <p className="text-texto-2 mt-0.5 text-sm">
              {esperando.length > 0
                ? 'A Bia atende sozinha o resto — estas conversas pediram uma pessoa.'
                : contagem.todas > 0
                  ? 'A Bia está dando conta. Abra qualquer conversa na lista para acompanhar.'
                  : 'Quando um cliente enviar mensagem, o atendimento aparece na lista ao lado.'}
            </p>
          </header>

          <dl className="border-linha bg-superficie mb-4 grid grid-cols-2 overflow-hidden rounded-md border sm:grid-cols-4">
            <Tile rotulo="Esperando você" valor={contagem.aguardando_humano} atencao />
            <Tile
              rotulo="Em andamento"
              valor={contagem.abertas - contagem.aguardando_humano}
              borda
            />
            <Tile rotulo="Não lidas" valor={contagem.naoLidas} borda />
            <Tile
              rotulo="1ª resposta hoje"
              valor={formatarDuracao(hoje.tempoPrimeiraResposta)}
              apoio="mediana"
              borda
            />
          </dl>

          {contagem.todas === 0 ? (
            <div className="border-linha bg-superficie rounded-md border px-6 py-14 text-center">
              <Inbox aria-hidden strokeWidth={1.25} className="text-texto-3 mx-auto mb-3 size-7" />
              <p className="text-texto text-sm font-medium">Nenhuma conversa ainda</p>
              <p className="text-texto-2 mx-auto mt-1 max-w-[42ch] text-sm">
                Conecte um canal em Configurações para começar a receber mensagens.
              </p>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 items-start gap-4 xl:grid-cols-2">
              <Coluna
                titulo="Esperando você"
                contagem={contagem.aguardando_humano}
                tom="atencao"
                slug={slug}
                itens={esperando}
                vazio="Ninguém esperando agora."
              />
              <Coluna
                titulo="Em andamento"
                contagem={contagem.abertas - contagem.aguardando_humano}
                slug={slug}
                itens={emAndamento}
                vazio="Nada em andamento no momento."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Peças ───────────────────────────────────────────────────────────────── */

type ItemLista = Awaited<ReturnType<typeof listarConversas>>[number];

function Coluna({
  titulo,
  contagem,
  tom,
  slug,
  itens,
  vazio,
}: {
  titulo: string;
  contagem: number;
  tom?: 'atencao';
  slug: string;
  itens: ItemLista[];
  vazio: string;
}) {
  return (
    <section className="border-linha bg-superficie overflow-hidden rounded-md border">
      <header className="border-linha flex items-center gap-2 border-b px-3.5 py-2">
        <h2 className="text-texto-2 text-xs font-medium tracking-[0.03em] uppercase">{titulo}</h2>
        {contagem > 0 && (
          <span
            data-numerico
            className={`text-2xs rounded-full px-1.5 tabular-nums ${
              tom === 'atencao' ? 'bg-atencao-suave text-atencao' : 'bg-superficie-3 text-texto-2'
            }`}
          >
            {contagem}
          </span>
        )}
      </header>

      {itens.length === 0 ? (
        <p className="text-texto-3 px-4 py-6 text-center text-xs">{vazio}</p>
      ) : (
        <ul className="divide-linha divide-y">
          {itens.map((c) => (
            <li key={c.id}>
              <Link
                href={`/e/${slug}/conversas/${c.id}`}
                prefetch={false}
                className="group hover:bg-superficie-2 flex items-center gap-2.5 px-3.5 py-2 transition-colors"
              >
                <span
                  aria-hidden
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    tom === 'atencao'
                      ? 'bg-atencao-suave text-atencao'
                      : 'bg-superficie-3 text-texto-2'
                  }`}
                >
                  {c.contatoNome?.trim()?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-texto block truncate text-sm font-medium">
                    {c.contatoNome ?? 'Contato sem nome'}
                  </span>
                  {c.previa && (
                    <span className="text-texto-3 block truncate text-xs">{c.previa}</span>
                  )}
                </span>
                {c.ultimaMensagemEm && (
                  <time
                    dateTime={c.ultimaMensagemEm.toISOString()}
                    className="text-2xs text-texto-3 shrink-0 tabular-nums"
                  >
                    {tempoRelativo(c.ultimaMensagemEm)}
                  </time>
                )}
                <ArrowRight
                  aria-hidden
                  strokeWidth={1.5}
                  className="text-texto-3 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tile({
  rotulo,
  valor,
  apoio,
  atencao = false,
  borda = false,
}: {
  rotulo: string;
  valor: number | string;
  apoio?: string;
  atencao?: boolean;
  borda?: boolean;
}) {
  return (
    <div className={`px-3.5 py-2.5 ${borda ? 'border-linha border-l' : ''}`}>
      <dt className="text-2xs text-texto-3">{rotulo}</dt>
      <dd
        data-numerico
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          atencao && Number(valor) > 0 ? 'text-atencao' : 'text-texto'
        }`}
      >
        {valor}
      </dd>
      {apoio && <p className="text-2xs text-texto-3">{apoio}</p>}
    </div>
  );
}
