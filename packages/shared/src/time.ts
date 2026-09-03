/**
 * Tempo.
 *
 * O servidor pensa em UTC. A empresa pensa no fuso dela — o Supermercado Campeão
 * fica em Canaã dos Carajás (America/Belem, sem horário de verão), mas o produto
 * atende empresas de qualquer lugar, então nenhum fuso é assumido em código.
 * Toda conversão passa por `partesLocais`, com o fuso do tenant explícito.
 */

export const FUSO_PADRAO = 'America/Sao_Paulo';

export interface PartesLocais {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  /** 0 = domingo, 6 = sábado. */
  diaDaSemana: number;
  /** Minutos desde a meia-noite local. Simplifica comparação de horário de funcionamento. */
  minutosDoDia: number;
  /** `YYYY-MM-DD` no fuso informado. Chave estável para agregação diária. */
  dataISO: string;
}

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });
    formatadores.set(fuso, f);
  }
  return f;
}

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function partesLocais(instante: Date, fuso: string = FUSO_PADRAO): PartesLocais {
  const partes = formatador(fuso).formatToParts(instante);
  const buscar = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? '';

  const ano = Number(buscar('year'));
  const mes = Number(buscar('month'));
  const dia = Number(buscar('day'));
  // Meia-noite volta como "24" em algumas plataformas com hour12: false.
  const hora = Number(buscar('hour')) % 24;
  const minuto = Number(buscar('minute'));

  return {
    ano,
    mes,
    dia,
    hora,
    minuto,
    diaDaSemana: DIAS[buscar('weekday')] ?? 0,
    minutosDoDia: hora * 60 + minuto,
    dataISO: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
  };
}

/** `"7:30"` ou `"21:00"` → minutos desde a meia-noite. Retorna null se malformado. */
export function horaParaMinutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutosParaHora(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24;
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const RELATIVO = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

/** "agora", "há 3 min", "há 2 h", "ontem". Para carimbo de conversa e lista. */
export function tempoRelativo(instante: Date, agora: Date = new Date()): string {
  const segundos = Math.round((instante.getTime() - agora.getTime()) / 1000);
  const abs = Math.abs(segundos);

  if (abs < 45) return 'agora';
  if (abs < 3600) return RELATIVO.format(Math.round(segundos / 60), 'minute');
  if (abs < 86400) return RELATIVO.format(Math.round(segundos / 3600), 'hour');
  if (abs < 604800) return RELATIVO.format(Math.round(segundos / 86400), 'day');
  return RELATIVO.format(Math.round(segundos / 604800), 'week');
}

export const segundos = (n: number) => n * 1000;
export const minutos = (n: number) => n * 60_000;
export const horas = (n: number) => n * 3_600_000;
export const dias = (n: number) => n * 86_400_000;
