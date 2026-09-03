'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { cn, Etiqueta, Vazio, tempoRelativo } from '@otto/ui';

import type { ItemListado, StatusItem } from '@otto/core/knowledge';
import { CartaoRolavel } from '@/componentes/pagina.tsx';

/**
 * Lista do Centro de Conhecimento.
 *
 * Responde às quatro perguntas do produto: o que a Bia sabe, de onde veio,
 * quando mudou, quem mudou. Por isso a linha carrega status, versão e uso real —
 * não só o título.
 */

const TOM_STATUS: Record<
  StatusItem,
  { tom: 'ok' | 'atencao' | 'neutro' | 'marca'; rotulo: string }
> = {
  publicado: { tom: 'ok', rotulo: 'Publicado' },
  rascunho: { tom: 'neutro', rotulo: 'Rascunho' },
  em_aprovacao: { tom: 'atencao', rotulo: 'Aguardando aprovação' },
  desatualizado: { tom: 'atencao', rotulo: 'Desatualizado' },
  arquivado: { tom: 'neutro', rotulo: 'Arquivado' },
};

const ROTULO_TIPO: Record<string, string> = {
  fato: 'Fato',
  pergunta_frequente: 'Pergunta frequente',
  politica: 'Política',
  procedimento: 'Procedimento',
  servico: 'Serviço',
  horario: 'Horário',
  localizacao: 'Localização',
  documento: 'Documento',
};

const FILTROS: { valor: string; rotulo: string }[] = [
  { valor: 'tudo', rotulo: 'Tudo' },
  { valor: 'em_aprovacao', rotulo: 'Aguardando' },
  { valor: 'publicado', rotulo: 'Publicados' },
  { valor: 'desatualizado', rotulo: 'Desatualizados' },
];

export function ListaConhecimento({
  itens,
  empresaSlug,
  filtroAtual,
  buscaAtual,
}: {
  itens: ItemListado[];
  empresaSlug: string;
  filtroAtual: string;
  buscaAtual?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [busca, setBusca] = useState(buscaAtual ?? '');
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const t = setTimeout(() => {
      const novos = new URLSearchParams(params.toString());
      if (busca.trim()) novos.set('busca', busca.trim());
      else novos.delete('busca');
      router.replace(`${pathname}?${novos.toString()}`, { scroll: false });
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function trocarFiltro(valor: string) {
    const novos = new URLSearchParams(params.toString());
    if (valor === 'tudo') novos.delete('status');
    else novos.set('status', valor);
    router.push(`${pathname}?${novos.toString()}`, { scroll: false });
  }

  return (
    <>
      <div className="mb-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden
            strokeWidth={1.5}
            className="text-texto-3 pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no conhecimento"
            aria-label="Buscar no conhecimento"
            className={cn(
              'border-linha-firme bg-superficie text-texto h-9 w-full rounded-sm border px-8 text-sm',
              'placeholder:text-texto-3 transition-colors duration-[var(--dur-controle)]',
              'focus-visible:border-marca focus-visible:ring-marca/20 focus:outline-none focus-visible:ring-2',
              'max-md:h-11',
            )}
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="text-texto-3 hover:text-texto-2 absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-xs"
            >
              <X aria-hidden strokeWidth={1.5} className="size-3.5" />
            </button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Filtrar por situação"
          className="border-linha bg-superficie-2 flex gap-0.5 overflow-x-auto rounded-sm border p-0.5"
        >
          {FILTROS.map((f) => {
            const ativo = filtroAtual === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => trocarFiltro(f.valor)}
                className={cn(
                  'shrink-0 rounded-xs px-2.5 py-1 text-xs font-medium whitespace-nowrap',
                  'transition-colors duration-[var(--dur-controle)]',
                  'max-md:min-h-9',
                  ativo
                    ? 'bg-superficie text-texto shadow-[var(--shadow-suspensa)]'
                    : 'text-texto-3 hover:text-texto-2',
                )}
              >
                {f.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="border-linha bg-superficie rounded-md border">
          <Vazio
            icone={<BookOpen />}
            titulo={
              buscaAtual || filtroAtual !== 'tudo'
                ? 'Nada aqui com esse filtro'
                : 'Nenhum conhecimento cadastrado'
            }
            descricao={
              buscaAtual || filtroAtual !== 'tudo'
                ? 'Tente outra palavra ou volte para "Tudo".'
                : 'A Bia só responde o que estiver aqui. Comece pelo que os clientes mais perguntam: horário, formas de pagamento, entrega e serviços da loja.'
            }
          />
        </div>
      ) : (
        <CartaoRolavel
          fixo={
            /* Cabeçalho da tabela — só no desktop. Fica preso enquanto as linhas correm. */
            <div className="text-2xs text-texto-3 hidden px-4 py-2 font-medium tracking-[0.03em] uppercase md:grid md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_10rem_5rem_7rem] md:gap-4">
              <span>Item</span>
              <span>Resposta</span>
              <span>Situação</span>
              <span className="text-right">Usos</span>
              <span className="text-right">Atualizado</span>
            </div>
          }
        >
          <ul className="divide-linha divide-y">
            {itens.map((item) => {
              const st = TOM_STATUS[item.status];
              return (
                <li key={item.id}>
                  <Link
                    href={`/e/${empresaSlug}/conhecimento/${item.id}`}
                    prefetch={false}
                    className="hover:bg-superficie-2 block px-4 py-2.5 transition-colors duration-[var(--dur-controle)] md:grid md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_10rem_5rem_7rem] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-texto truncate text-sm font-medium">{item.titulo}</p>
                      <p className="text-2xs text-texto-3 mt-0.5 truncate">
                        {ROTULO_TIPO[item.tipo] ?? item.tipo}
                        {item.categoria && ` · ${item.categoria}`}
                        {item.status === 'publicado' && ` · versão ${item.versao}`}
                      </p>
                    </div>

                    {/* O que a Bia responde. Só no desktop: no celular a linha
                        já carrega título, tipo e situação, e uma quarta
                        informação empurraria a lista para longe do polegar. */}
                    <p className="text-texto-3 hidden truncate text-xs md:block">{item.resumo}</p>

                    <div className="mt-2 flex items-center gap-2 md:mt-0">
                      <Etiqueta tom={st.tom} ponto={item.status !== 'publicado'}>
                        {st.rotulo}
                      </Etiqueta>
                      <span className="text-2xs text-texto-3 md:hidden">
                        {item.usos > 0 && (
                          <>
                            <span data-numerico className="tabular-nums">
                              usada {item.usos}×
                            </span>
                            {' · '}
                          </>
                        )}
                        {tempoRelativo(item.atualizadoEm)}
                      </span>
                    </div>

                    <p
                      data-numerico
                      className="text-texto-2 hidden text-xs tabular-nums md:block md:text-right"
                    >
                      {item.usos > 0 ? `${item.usos}×` : '—'}
                    </p>

                    <p className="text-2xs text-texto-3 hidden md:block md:text-right">
                      {tempoRelativo(item.atualizadoEm)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CartaoRolavel>
      )}
    </>
  );
}
