import { cn } from '@otto/ui';

/**
 * Série diária em barras.
 *
 * SVG inline, sem biblioteca de gráficos. Para uma série de trinta pontos, uma
 * dependência de 50 KB carregaria mais peso do que o gráfico inteiro vale — e o
 * produto precisa parecer rápido em conexão móvel do interior do Pará.
 *
 * Barras e não linha: a série é contagem por dia, que é discreta. Uma linha
 * ligando os pontos sugeriria continuidade entre um dia e outro, que não existe.
 */
export function GraficoBarras({
  pontos,
  rotulo,
  formatar = (v) => String(v),
}: {
  pontos: { data: string; valor: number }[];
  rotulo: string;
  formatar?: (valor: number) => string;
}) {
  const maximo = Math.max(...pontos.map((p) => p.valor), 1);
  const total = pontos.reduce((s, p) => s + p.valor, 0);

  if (total === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-linha bg-superficie">
        <p className="text-xs text-texto-3">Sem movimento no período.</p>
      </div>
    );
  }

  const largura = 100 / pontos.length;

  return (
    <figure className="rounded-md border border-linha bg-superficie p-3">
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="text-xs text-texto-2">{rotulo}</span>
        <span data-numerico className="text-xs tabular-nums text-texto-3">
          {formatar(total)} no total
        </span>
      </figcaption>

      <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={rotulo}>
        {pontos.map((p) => {
          const altura = (p.valor / maximo) * 100;
          const dia = new Date(`${p.data}T12:00:00`);
          return (
            <div
              key={p.data}
              className="group relative flex flex-1 items-end"
              style={{ minWidth: `${Math.max(largura, 2)}%` }}
            >
              <div
                className={cn(
                  'w-full rounded-t-[2px] transition-colors duration-[120ms]',
                  p.valor > 0 ? 'bg-marca/70 group-hover:bg-marca' : 'bg-superficie-3',
                )}
                // Altura mínima visível para o dia com movimento não sumir.
                style={{ height: p.valor > 0 ? `${Math.max(altura, 4)}%` : '2px' }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded-sm border border-linha-firme bg-superficie px-1.5 py-0.5 text-2xs whitespace-nowrap text-texto shadow-[var(--shadow-suspensa)] group-hover:block">
                {dia.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} ·{' '}
                {formatar(p.valor)}
              </span>
            </div>
          );
        })}
      </div>

      {pontos.length > 1 && (
        <div className="mt-1.5 flex justify-between text-2xs text-texto-3">
          <span>{rotuloData(pontos[0]!.data)}</span>
          <span>{rotuloData(pontos.at(-1)!.data)}</span>
        </div>
      )}
    </figure>
  );
}

function rotuloData(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}
