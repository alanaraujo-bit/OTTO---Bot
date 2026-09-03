import { cn } from '@otto/ui';

/**
 * Quando os clientes procuram.
 *
 * As 24 horas do dia, somando os últimos 30 dias. Serve a uma decisão concreta
 * do dono: em que horário vale a pena ter alguém pronto para assumir. Por isso
 * a leitura principal não é o gráfico — é a frase acima dele.
 */
export function GraficoHoras({
  horas,
  faixas,
}: {
  horas: { hora: number; conversas: number }[];
  faixas: { inicio: number; fim: number }[];
}) {
  const maximo = Math.max(...horas.map((h) => h.conversas), 1);
  const total = horas.reduce((s, h) => s + h.conversas, 0);
  const dentroDeFaixa = (h: number) => faixas.some((f) => h >= f.inicio && h <= f.fim);

  if (total === 0) {
    return (
      <p className="py-8 text-center text-xs text-texto-3">
        Ainda não há movimento suficiente para identificar os horários de pico.
      </p>
    );
  }

  return (
    <div className="select-none">
      <p className="mb-4 text-sm text-texto-2">{frasePico(faixas)}</p>

      <div
        className="flex h-28 items-end gap-[3px] border-b border-linha md:h-32"
        role="img"
        aria-label={fraseAcessivel(faixas)}
      >
        {horas.map((h) => {
          const altura = (h.conversas / maximo) * 100;
          const emPico = dentroDeFaixa(h.hora);
          return (
            <div key={h.hora} className="group relative flex h-full flex-1 items-end">
              <span
                className={cn(
                  'w-full rounded-t-[2px]',
                  emPico ? 'bg-marca/70' : 'bg-marca/25',
                )}
                style={{ height: `${Math.max(altura, h.conversas > 0 ? 5 : 2)}%` }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded-sm border border-linha-firme bg-superficie px-1.5 py-0.5 text-2xs whitespace-nowrap text-texto shadow-[var(--shadow-suspensa)] group-hover:block">
                {rotuloHora(h.hora)} · {h.conversas}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between text-2xs text-texto-3">
        <span>00h</span>
        <span>06h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  );
}

function rotuloHora(h: number): string {
  return `${String(h).padStart(2, '0')}h`;
}

function frasePico(faixas: { inicio: number; fim: number }[]): string {
  if (faixas.length === 0) return 'O movimento é parecido ao longo do dia — sem um horário que se destaque.';
  const trechos = faixas.map((f) =>
    f.inicio === f.fim ? `por volta das ${rotuloHora(f.inicio)}` : `das ${rotuloHora(f.inicio)} às ${rotuloHora(f.fim + 1)}`,
  );
  const lista =
    trechos.length === 1 ? trechos[0] : `${trechos.slice(0, -1).join(', ')} e ${trechos.at(-1)}`;
  return `O movimento se concentra ${lista}. É quando vale ter alguém pronto para assumir.`;
}

function fraseAcessivel(faixas: { inicio: number; fim: number }[]): string {
  return `Distribuição de conversas por hora do dia. ${frasePico(faixas)}`;
}
