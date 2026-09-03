'use client';

import { useId, useState } from 'react';
import { cn } from '@otto/ui';

/**
 * Movimento por dia.
 *
 * Barras, não linha: a série é contagem por dia, que é discreta — ligar os
 * pontos sugeriria um fluxo contínuo entre segunda e terça que não existe.
 * Fim de semana entra com barra mais clara, porque "sábado sempre enche" é
 * exatamente o tipo de padrão que o dono quer enxergar de relance.
 *
 * SVG e estado de hover próprios, sem biblioteca de gráfico: trinta pontos não
 * pagam 50 KB de dependência, e a página precisa parecer leve em 3G no interior.
 */
export function GraficoAtividade({
  pontos,
  insight,
  unidade = 'conversa',
  className,
}: {
  pontos: { data: string; conversas: number }[];
  /** Frase curta sobre o padrão da série, abaixo do gráfico. */
  insight?: string | null;
  /** Rótulo do que a barra conta, no singular. */
  unidade?: string;
  className?: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const rotuloId = useId();

  const maximo = Math.max(...pontos.map((p) => p.conversas), 1);
  const indicePico = pontos.reduce(
    (melhor, p, i) => (p.conversas > pontos[melhor]!.conversas ? i : melhor),
    0,
  );
  const hojeIndice = pontos.length - 1;
  const selecionado = ativo ?? hojeIndice;
  const ponto = pontos[selecionado]!;
  const dataPonto = new Date(`${ponto.data}T12:00:00`);

  return (
    <div className={cn('flex flex-col select-none', className)}>
      <p className="text-texto-2 mb-3 text-xs" id={rotuloId}>
        <span className="text-texto-3">{ativo === null ? 'Hoje' : rotuloDataLonga(dataPonto)}</span>
        {' — '}
        <span data-numerico className="text-texto font-medium tabular-nums">
          {ponto.conversas} {ponto.conversas === 1 ? unidade : `${unidade}s`}
        </span>
      </p>

      {/*
        Série curta não estica.

        Sete pontos espalhados por um painel de mil pixels deixam de ser um
        gráfico: viram sete retângulos isolados. A régua abaixo acompanha a mesma
        largura, senão o rótulo "hoje" descola da última barra.
      */}
      <div
        className="flex min-h-[8rem] flex-1 items-end gap-[3px]"
        style={pontos.length <= 10 ? { maxWidth: `${pontos.length * 5.5}rem` } : undefined}
        role="img"
        aria-labelledby={rotuloId}
        aria-label="Conversas por dia nas últimas duas semanas"
      >
        {pontos.map((p, i) => {
          const altura = (p.conversas / maximo) * 100;
          const ehHoje = i === hojeIndice;
          const emFoco = i === selecionado;
          return (
            <button
              key={p.data}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
              aria-hidden
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <span
                className={cn(
                  'w-full rounded-t-[2px] transition-[height,background-color] duration-[var(--dur-estado)] ease-[var(--ease-saida)]',
                  ehHoje ? 'bg-marca' : emFoco ? 'bg-marca/75' : 'bg-marca/40',
                )}
                style={{ height: `${Math.max(altura, p.conversas > 0 ? 6 : 2)}%` }}
              />
              {i === indicePico && !ehHoje && (
                <span
                  aria-hidden
                  className="bg-marca absolute -top-1 left-1/2 size-1 -translate-x-1/2 rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        className="text-2xs text-texto-3 mt-2 flex justify-between"
        style={pontos.length <= 10 ? { maxWidth: `${pontos.length * 5.5}rem` } : undefined}
      >
        <span>{rotuloDataCurta(new Date(`${pontos[0]!.data}T12:00:00`))}</span>
        {pontos.length > 7 && (
          <span>
            {rotuloDataCurta(new Date(`${pontos[Math.floor(pontos.length / 2)]!.data}T12:00:00`))}
          </span>
        )}
        <span>hoje</span>
      </div>

      {insight && <p className="border-linha text-texto-2 mt-3 border-t pt-3 text-xs">{insight}</p>}
    </div>
  );
}

function rotuloDataLonga(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function rotuloDataCurta(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
