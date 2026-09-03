import type { ReactNode } from 'react';

import { cn } from './cn.ts';

/**
 * Etiqueta de status.
 *
 * Texto colorido sobre fundo suave, nunca preenchimento saturado com texto
 * branco: empilhadas em uma lista de conversas, etiquetas saturadas viram
 * semáforo e a falha de verdade deixa de saltar.
 */

type Tom = 'neutro' | 'marca' | 'ok' | 'atencao' | 'falha';

const TONS: Record<Tom, string> = {
  neutro: 'bg-superficie-2 text-texto-2',
  marca: 'bg-marca-suave text-marca',
  ok: 'bg-ok-suave text-ok',
  atencao: 'bg-atencao-suave text-atencao',
  falha: 'bg-falha-suave text-falha',
};

const PONTOS: Record<Tom, string> = {
  neutro: 'bg-texto-3',
  marca: 'bg-marca',
  ok: 'bg-ok',
  atencao: 'bg-atencao',
  falha: 'bg-falha',
};

export interface EtiquetaProps {
  tom?: Tom;
  /** Ponto colorido à esquerda. Ajuda quem não distingue as cores. */
  ponto?: boolean;
  children: ReactNode;
  className?: string;
}

export function Etiqueta({ tom = 'neutro', ponto = false, children, className }: EtiquetaProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xs px-1.5 py-0.5',
        'text-2xs font-medium whitespace-nowrap',
        TONS[tom],
        className,
      )}
    >
      {ponto && <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', PONTOS[tom])} />}
      {children}
    </span>
  );
}
