import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

import { cn } from './cn.ts';

/**
 * Botão.
 *
 * Nenhuma ação pode parecer que "não aconteceu": `carregando` troca o rótulo por
 * um indicador e bloqueia o clique, o que também resolve o duplo envio.
 *
 * Um botão sempre nomeia a ação que executa. "Publicar conhecimento", não
 * "Salvar" — está em DESIGN.md e vale para toda chamada deste componente.
 */

type Variante = 'primaria' | 'secundaria' | 'sutil' | 'destrutiva';
type Tamanho = 'sm' | 'md' | 'lg';

const VARIANTES: Record<Variante, string> = {
  primaria:
    'bg-solida text-solida-contraste hover:bg-solida-forte active:bg-solida-forte border border-transparent',
  secundaria:
    'bg-superficie text-texto border border-linha-firme hover:bg-superficie-2 active:bg-superficie-3',
  sutil:
    'bg-transparent text-texto-2 border border-transparent hover:bg-superficie-2 hover:text-texto active:bg-superficie-3',
  destrutiva:
    'bg-transparent text-falha border border-linha-firme hover:bg-falha-suave hover:border-falha active:bg-falha-suave',
};

/* Alvo de toque de 44 px no celular; densidade menor no desktop, onde há mouse. */
const TAMANHOS: Record<Tamanho, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 max-md:h-9',
  md: 'h-8 px-3 text-sm gap-2 max-md:h-11 max-md:px-4',
  lg: 'h-10 px-4 text-base gap-2 max-md:h-12',
};

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  carregando?: boolean;
  /** Ícone à esquerda do rótulo. Escondido enquanto carrega. */
  icone?: ReactNode;
  larguraTotal?: boolean;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    variante = 'secundaria',
    tamanho = 'md',
    carregando = false,
    icone,
    larguraTotal = false,
    className,
    children,
    disabled,
    type = 'button',
    ...resto
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      // Leitor de tela precisa saber que a ação está em curso, não só que o
      // botão desabilitou.
      aria-busy={carregando || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-sm font-medium whitespace-nowrap',
        'transition-colors duration-[120ms] ease-[var(--ease-padrao)]',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        larguraTotal && 'w-full',
        className,
      )}
      {...resto}
    >
      {carregando ? (
        <Loader2 aria-hidden className="size-4 animate-spin" />
      ) : (
        icone && (
          <span aria-hidden className="[&>svg]:size-4 shrink-0">
            {icone}
          </span>
        )
      )}
      {children}
    </button>
  );
});
