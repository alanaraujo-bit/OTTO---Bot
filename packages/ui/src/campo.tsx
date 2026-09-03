import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from './cn.ts';

/**
 * Campo de formulário.
 *
 * O rótulo é obrigatório e sempre visível. Rótulo dentro do campo, que some ao
 * digitar, deixa a pessoa sem saber o que preencheu quando volta para conferir.
 *
 * O erro é anunciado por `aria-describedby` e `aria-invalid`, e ocupa espaço
 * reservado — mensagem que aparece empurrando o formulário faz a pessoa clicar
 * no lugar errado.
 */

export interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  rotulo: string;
  /** Explicação curta abaixo do rótulo. Some quando há erro. */
  ajuda?: string;
  erro?: string;
  /** Ícone ou botão à direita, dentro do campo — revelar senha, limpar. */
  acessorio?: ReactNode;
}

export const Campo = forwardRef<HTMLInputElement, CampoProps>(function Campo(
  { rotulo, ajuda, erro, acessorio, className, required, ...resto },
  ref,
) {
  const id = useId();
  const idAuxiliar = `${id}-aux`;
  const temAuxiliar = Boolean(erro || ajuda);

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-texto-2">
        {rotulo}
        {!required && <span className="ml-1.5 font-normal text-texto-3">opcional</span>}
      </label>

      <div className="relative">
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={erro ? true : undefined}
          aria-describedby={temAuxiliar ? idAuxiliar : undefined}
          className={cn(
            'h-9 w-full rounded-sm border bg-superficie px-2.5 text-sm text-texto',
            'placeholder:text-texto-3',
            'transition-colors duration-[120ms] ease-[var(--ease-padrao)]',
            'focus:outline-none focus-visible:border-marca focus-visible:ring-2 focus-visible:ring-marca/25',
            'disabled:cursor-not-allowed disabled:bg-superficie-2 disabled:text-texto-3',
            erro ? 'border-falha' : 'border-linha-firme hover:border-texto-3',
            acessorio && 'pr-9',
            // Alvo de toque maior no celular.
            'max-md:h-11',
            className,
          )}
          {...resto}
        />
        {acessorio && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">{acessorio}</div>
        )}
      </div>

      {temAuxiliar && (
        <p
          id={idAuxiliar}
          role={erro ? 'alert' : undefined}
          className={cn('text-xs', erro ? 'text-falha' : 'text-texto-3')}
        >
          {erro ?? ajuda}
        </p>
      )}
    </div>
  );
});
