import type { ReactNode } from 'react';

import { cn } from './cn.ts';

/**
 * Anel de proporção.
 *
 * Um único número que é uma fração de 100 — "resolvidas pela IA", "base
 * coberta". Não é decoração: o anel comunica "quanto falta para o todo" de
 * relance, coisa que o número sozinho não faz. SVG inline, sem biblioteca.
 *
 * Um anel por tela, no máximo. Vários anéis lado a lado viram painel de carro.
 */
export function Anel({
  valor,
  rotulo,
  apoio,
  tom = 'marca',
  tamanho = 132,
}: {
  /** 0–100. `null` quando não há base para o cálculo. */
  valor: number | null;
  rotulo: string;
  apoio?: ReactNode;
  tom?: 'marca' | 'ok' | 'atencao';
  tamanho?: number;
}) {
  const traco = 8;
  const raio = (tamanho - traco) / 2;
  const volta = 2 * Math.PI * raio;
  const preenchido = valor === null ? 0 : Math.max(0, Math.min(100, valor));
  const corTraco =
    tom === 'ok' ? 'var(--cor-ok)' : tom === 'atencao' ? 'var(--cor-atencao)' : 'var(--cor-marca)';

  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: tamanho, height: tamanho }}>
        <svg
          width={tamanho}
          height={tamanho}
          viewBox={`0 0 ${tamanho} ${tamanho}`}
          className="-rotate-90"
          role="img"
          aria-label={valor === null ? `${rotulo}: sem dados` : `${rotulo}: ${preenchido}%`}
        >
          <circle
            cx={tamanho / 2}
            cy={tamanho / 2}
            r={raio}
            fill="none"
            stroke="var(--cor-superficie-2)"
            strokeWidth={traco}
          />
          {valor !== null && (
            <circle
              cx={tamanho / 2}
              cy={tamanho / 2}
              r={raio}
              fill="none"
              stroke={corTraco}
              strokeWidth={traco}
              strokeLinecap="round"
              strokeDasharray={volta}
              strokeDashoffset={volta - (preenchido / 100) * volta}
              className="[transition:stroke-dashoffset_var(--dur-camada)_var(--ease-saida)] motion-reduce:transition-none"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            data-numerico
            className={cn(
              'font-semibold tracking-[-0.02em] tabular-nums text-texto',
              tamanho >= 120 ? 'text-2xl' : 'text-xl',
            )}
          >
            {valor === null ? '—' : `${Math.round(preenchido)}%`}
          </span>
        </div>
      </div>
      <figcaption className="text-center">
        <p className="text-xs font-medium text-texto-2">{rotulo}</p>
        {apoio && <p className="mt-0.5 text-2xs text-texto-3">{apoio}</p>}
      </figcaption>
    </figure>
  );
}
