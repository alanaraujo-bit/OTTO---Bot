import type { ReactNode } from 'react';

import { cn } from './cn.ts';

/**
 * Estado vazio.
 *
 * A regra que este componente existe para impor: um estado vazio diz o próximo
 * passo. "Nenhum item encontrado" não é um estado vazio — é uma constatação
 * inútil. Por isso `acao` e `descricao` não são opcionais por acidente: quem
 * escreve uma tela vazia precisa dizer o que a pessoa faz agora.
 */

export interface VazioProps {
  /** Ícone da Lucide. Discreto — o texto é que orienta. */
  icone?: ReactNode;
  titulo: string;
  descricao: string;
  acao?: ReactNode;
  className?: string;
}

export function Vazio({ icone, titulo, descricao, acao, className }: VazioProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        className,
      )}
    >
      {icone && (
        <span aria-hidden className="mb-3 text-texto-3 [&>svg]:size-6 [&>svg]:stroke-[1.5]">
          {icone}
        </span>
      )}
      <p className="text-base font-medium text-texto">{titulo}</p>
      <p className="mt-1 max-w-[46ch] text-sm text-texto-2">{descricao}</p>
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}
