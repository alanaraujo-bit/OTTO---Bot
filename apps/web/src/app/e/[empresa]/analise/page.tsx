import type { Metadata } from 'next';
import Link from 'next/link';
import { cn, Etiqueta } from '@otto/ui';

import {
  assuntosFrequentes,
  formatarCusto,
  formatarDuracao,
  resumo,
  serieDiaria,
  type Periodo,
} from '@otto/core/metricas';
import { pode } from '@otto/core/auth';
import { eq, tenants, withTenant } from '@otto/db';

import { GraficoBarras } from '@/componentes/grafico-barras.tsx';
import { Indicador } from '@/componentes/indicador.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Análise' };

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7dias', rotulo: '7 dias' },
  { valor: '30dias', rotulo: '30 dias' },
];

export default async function PaginaAnalise({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { empresa: slug } = await params;
  const { periodo: bruto } = await searchParams;
  const acesso = await exigirAcesso(slug);

  const periodo: Periodo = PERIODOS.some((p) => p.valor === bruto)
    ? (bruto as Periodo)
    : '7dias';

  const [empresa] = await withTenant(acesso.empresa.id, (tx) =>
    tx
      .select({ fuso: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, acesso.empresa.id)),
  );
  const fuso = empresa?.fuso ?? 'America/Sao_Paulo';

  const [dados, serie, assuntos] = await Promise.all([
    resumo(acesso.empresa.id, periodo, fuso),
    serieDiaria(acesso.empresa.id, periodo, fuso),
    assuntosFrequentes(acesso.empresa.id, periodo, fuso),
  ]);

  const podeVerCusto = pode(acesso, 'custo.ver');

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Análise</h1>
          <p className="mt-0.5 text-sm text-texto-2">
            Como o atendimento está funcionando e quanto está custando.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Período"
          className="flex gap-0.5 rounded-sm border border-linha bg-superficie-2 p-0.5"
        >
          {PERIODOS.map((p) => (
            <Link
              key={p.valor}
              href={`/e/${slug}/analise?periodo=${p.valor}`}
              role="tab"
              aria-selected={periodo === p.valor}
              className={cn(
                'rounded-xs px-2.5 py-1 text-xs font-medium transition-colors duration-[120ms]',
                'max-md:min-h-9 max-md:px-3 max-md:leading-7',
                periodo === p.valor
                  ? 'bg-superficie text-texto shadow-[var(--shadow-suspensa)]'
                  : 'text-texto-3 hover:text-texto-2',
              )}
            >
              {p.rotulo}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid gap-8">
        <section>
          <h2 className="mb-3 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
            Atendimento
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            <Indicador
              rotulo="Conversas"
              valor={dados.conversas}
              apoio={variacao(dados.conversas, dados.conversasAnterior)}
              href={`/e/${slug}/conversas?status=todas`}
            />
            <Indicador rotulo="Clientes atendidos" valor={dados.clientesUnicos} apoio="Pessoas diferentes" />
            <Indicador
              rotulo="Resolvidas pela IA"
              valor={dados.resolucaoAutomatica === null ? '—' : `${dados.resolucaoAutomatica}%`}
              apoio={
                dados.resolucaoAutomatica === null
                  ? 'Sem conversas encerradas'
                  : variacaoPontos(dados.resolucaoAutomatica, dados.resolucaoAnterior)
              }
            />
            <Indicador
              rotulo="Passaram para humano"
              valor={dados.handoffs}
              apoio="Transferências"
              href={`/e/${slug}/conversas?status=aguardando_humano`}
            />
            <Indicador
              rotulo="Primeira resposta"
              valor={formatarDuracao(dados.tempoPrimeiraResposta)}
              apoio="Mediana"
            />
            <Indicador
              rotulo="Mensagens recebidas"
              valor={dados.mensagensRecebidas}
              apoio={`${dados.mensagensEnviadas} enviadas`}
            />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <GraficoBarras
            rotulo="Conversas por dia"
            pontos={serie.map((p) => ({ data: p.data, valor: p.conversas }))}
          />
          <GraficoBarras
            rotulo="Mensagens por dia"
            pontos={serie.map((p) => ({ data: p.data, valor: p.mensagens }))}
          />
        </section>

        {podeVerCusto && (
          <section>
            <h2 className="mb-3 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
              Custo
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <Indicador
                rotulo="Custo de IA"
                valor={formatarCusto(dados.custoMicroUsd)}
                apoio={variacaoCusto(dados.custoMicroUsd, dados.custoAnteriorMicroUsd)}
              />
              <Indicador
                rotulo="Custo por conversa"
                valor={
                  dados.custoPorConversaMicroUsd === null
                    ? '—'
                    : formatarCusto(dados.custoPorConversaMicroUsd)
                }
                apoio="Média no período"
              />
              <Indicador
                rotulo="Sem resposta na base"
                valor={dados.semFundamento}
                apoio="Viram sugestão de melhoria"
                href={`/e/${slug}/melhorias`}
                atencao
              />
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
            Assuntos mais buscados
          </h2>

          {assuntos.length === 0 ? (
            <p className="rounded-md border border-linha bg-superficie px-4 py-6 text-center text-sm text-texto-3">
              Ainda não há atendimentos suficientes para identificar assuntos.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-md border border-linha bg-superficie">
              {assuntos.map((a) => (
                <li
                  key={a.assunto}
                  className="flex items-center gap-3 border-b border-linha px-3 py-2.5 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-texto">{a.assunto}</span>
                  {a.semResposta > 0 && (
                    <Etiqueta tom="atencao">{a.semResposta} sem resposta</Etiqueta>
                  )}
                  <span
                    data-numerico
                    className="shrink-0 text-sm tabular-nums text-texto-2"
                  >
                    {a.ocorrencias}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** Comparação com o período anterior. Sem base de comparação, não inventa. */
function variacao(atual: number, anterior: number): string {
  if (anterior === 0) return atual > 0 ? 'sem base de comparação' : 'nenhuma no período';
  const delta = Math.round(((atual - anterior) / anterior) * 100);
  if (delta === 0) return 'igual ao período anterior';
  return `${delta > 0 ? '+' : ''}${delta}% vs. período anterior`;
}

function variacaoPontos(atual: number, anterior: number | null): string {
  if (anterior === null) return 'sem base de comparação';
  const delta = atual - anterior;
  if (delta === 0) return 'igual ao período anterior';
  return `${delta > 0 ? '+' : ''}${delta} pontos vs. anterior`;
}

function variacaoCusto(atual: number, anterior: number): string {
  if (anterior === 0) return atual > 0 ? 'primeiro período com custo' : 'sem custo no período';
  const delta = Math.round(((atual - anterior) / anterior) * 100);
  if (delta === 0) return 'igual ao período anterior';
  return `${delta > 0 ? '+' : ''}${delta}% vs. período anterior`;
}
