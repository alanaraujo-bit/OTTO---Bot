import type { CSSProperties, ReactNode } from 'react';

import { cn } from './cn.ts';

/**
 * Painel de conteúdo.
 *
 * O produto recusa "dezenas de cards sem propósito", então este componente não
 * é para agrupar qualquer coisa: é para uma unidade de leitura que tem título,
 * ocupa uma região da tela e às vezes carrega uma ação própria. Separação vem de
 * linha e de superfície — sem sombra, sem faixa colorida na lateral.
 *
 * `plano` tira a borda para quando o painel já está dentro de outra superfície.
 */
export interface CartaoProps {
  titulo?: ReactNode;
  /** Frase curta abaixo do título. */
  descricao?: ReactNode;
  /** Canto superior direito — filtro, link "ver tudo", período. */
  acao?: ReactNode;
  plano?: boolean;
  /** Remove o respiro interno para conteúdo que desenha as próprias bordas (tabela, lista). */
  semPreenchimento?: boolean;
  className?: string;
  /** Classe do corpo — para distribuir o conteúdo na altura (`flex`, `justify-between`). */
  corpoClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function Cartao({
  titulo,
  descricao,
  acao,
  plano = false,
  semPreenchimento = false,
  className,
  corpoClassName,
  style,
  children,
}: CartaoProps) {
  return (
    <section
      style={style}
      className={cn(
        'flex flex-col rounded-md bg-superficie',
        !plano && 'border border-linha',
        className,
      )}
    >
      {(titulo || acao) && (
        <header
          className={cn(
            'flex items-start justify-between gap-3',
            semPreenchimento ? 'px-3.5 pt-3.5 pb-2.5 md:px-4' : 'px-3.5 pt-3.5 md:px-5 md:pt-4',
          )}
        >
          <div className="min-w-0">
            {titulo && (
              <h2 className="text-xs font-medium tracking-[0.03em] text-texto-2 uppercase">
                {titulo}
              </h2>
            )}
            {descricao && <p className="mt-1 text-xs text-texto-3">{descricao}</p>}
          </div>
          {acao && <div className="shrink-0">{acao}</div>}
        </header>
      )}
      <div
        className={cn(
          'flex-1',
          !semPreenchimento && (titulo || acao)
            ? 'px-3.5 pb-3.5 pt-3 md:px-5 md:pb-5'
            : !semPreenchimento && 'p-3.5 md:p-5',
          corpoClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
