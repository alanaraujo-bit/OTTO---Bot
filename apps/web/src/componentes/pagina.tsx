import type { ReactNode } from 'react';
import { cn } from '@otto/ui';

/**
 * Enquadramento das telas do console.
 *
 * No desktop a janela não rola: o `main` do shell trava na altura da tela e cada
 * tela cuida da própria rolagem. Isso é o que separa uma aplicação de um site —
 * o título e a busca ficam parados, e o dedo (ou a roda) mexe só no que é lista.
 *
 * Duas formas, e só duas:
 *
 * · `Pagina` — a tela inteira rola dentro de si. Serve para painel, formulário e
 *   leitura, onde o conteúdo é uma coisa só de cima a baixo.
 * · `PaginaLista` — cabeçalho e controles ficam presos no topo; a região de
 *   conteúdo rola sozinha. Serve para lista longa, onde voltar ao campo de busca
 *   não pode custar uma viagem de volta ao topo da página.
 *
 * No celular as duas viram rolagem normal de documento, que é o gesto que o
 * aparelho já ensina.
 */

/** Larguras nomeadas. O shell publica os valores; recolher a barra aumenta o conteúdo. */
const LARGURA = {
  /** Listas, formulários e telas de trabalho. */
  padrao: 'max-w-[var(--w-conteudo,84rem)]',
  /** Painéis com gráficos, que ganham em ver mais de uma coisa lado a lado. */
  amplo: 'max-w-[var(--w-conteudo-amplo,104rem)]',
  /** Leitura contínua: ficha de detalhe, configuração, texto. */
  leitura: 'max-w-3xl',
} as const;

export type LarguraPagina = keyof typeof LARGURA;

export function Pagina({
  largura = 'padrao',
  className,
  children,
}: {
  largura?: LarguraPagina;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="md:rolagem md:h-full">
      <div className={cn('mx-auto px-4 py-5 md:px-8 md:py-7', LARGURA[largura], className)}>
        {children}
      </div>
    </div>
  );
}

export function PaginaLista({
  largura = 'padrao',
  cabecalho,
  controles,
  children,
}: {
  largura?: LarguraPagina;
  /** Título e resumo. Fica preso no topo. */
  cabecalho: ReactNode;
  /** Busca, abas, filtros. Fica preso logo abaixo do cabeçalho. */
  controles?: ReactNode;
  /** A região que rola. Recebe altura total e é quem tem `overflow`. */
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex h-full flex-col px-4 pt-5 pb-5 md:px-8 md:pt-7 md:pb-7',
        LARGURA[largura],
      )}
    >
      <div className="entra shrink-0">{cabecalho}</div>
      {controles && (
        <div className="entra mt-4 shrink-0" style={{ '--atraso': '30ms' } as React.CSSProperties}>
          {controles}
        </div>
      )}
      <div
        className="entra mt-3 flex min-h-0 flex-1 flex-col"
        style={{ '--atraso': '60ms' } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Moldura de lista com rolagem própria.
 *
 * A borda e o fundo ficam parados; só as linhas correm por dentro. Um cabeçalho
 * de tabela passado em `fixo` gruda no topo da região que rola.
 */
export function CartaoRolavel({
  fixo,
  rodape,
  children,
}: {
  fixo?: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  return (
    // `max-h-full` em vez de `flex-1`: uma lista curta fecha na própria altura
    // em vez de deixar uma moldura vazia até o rodapé; uma longa enche a tela e
    // rola por dentro. O tamanho do cartão diz quanta lista existe.
    <section className="border-linha bg-superficie flex max-h-full min-h-0 flex-col overflow-hidden rounded-md border">
      {fixo && <div className="border-linha shrink-0 border-b">{fixo}</div>}
      <div className="rolagem min-h-0 flex-1">{children}</div>
      {rodape && <div className="border-linha shrink-0 border-t">{rodape}</div>}
    </section>
  );
}
