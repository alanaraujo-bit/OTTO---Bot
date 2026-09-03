import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { Anel, Cartao, cn } from '@otto/ui';

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

import { GraficoAtividade } from '@/componentes/grafico-atividade.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';
import { Pagina } from '@/componentes/pagina.tsx';

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

  const periodo: Periodo = PERIODOS.some((p) => p.valor === bruto) ? (bruto as Periodo) : '7dias';

  const [empresa] = await withTenant(acesso.empresa.id, (tx) =>
    tx.select({ fuso: tenants.timezone }).from(tenants).where(eq(tenants.id, acesso.empresa.id)),
  );
  const fuso = empresa?.fuso ?? 'America/Sao_Paulo';

  const [dados, serie, assuntos] = await Promise.all([
    resumo(acesso.empresa.id, periodo, fuso),
    serieDiaria(acesso.empresa.id, periodo, fuso),
    assuntosFrequentes(acesso.empresa.id, periodo, fuso),
  ]);

  const podeVerCusto = pode(acesso, 'custo.ver');
  const nomePeriodo = periodo === 'hoje' ? 'hoje' : `nos últimos ${periodo === '7dias' ? 7 : 30} dias`;

  return (
    <Pagina largura="amplo">
      <header className="entra mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Análise</h1>
          <p className="mt-0.5 text-sm text-texto-2">
            Como o atendimento está funcionando {nomePeriodo}.
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
                'rounded-xs px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--dur-controle)]',
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* KPIs */}
        <Cartao
          titulo="Atendimento"
          className="entra lg:col-span-8"
          style={{ '--atraso': '40ms' } as React.CSSProperties}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <Kpi
              rotulo="Conversas"
              valor={dados.conversas}
              variacao={variacao(dados.conversas, dados.conversasAnterior)}
              href={`/e/${slug}/conversas?status=todas`}
            />
            <Kpi rotulo="Clientes atendidos" valor={dados.clientesUnicos} apoio="pessoas diferentes" />
            <Kpi
              rotulo="Passaram para humano"
              valor={dados.handoffs}
              apoio="transferências"
              href={`/e/${slug}/conversas?status=aguardando_humano`}
            />
            <Kpi
              rotulo="Primeira resposta"
              valor={formatarDuracao(dados.tempoPrimeiraResposta)}
              apoio="mediana"
            />
            <Kpi
              rotulo="Mensagens recebidas"
              valor={dados.mensagensRecebidas}
              apoio={`${dados.mensagensEnviadas} enviadas`}
            />
            <Kpi
              rotulo="Sem resposta na base"
              valor={dados.semFundamento}
              apoio="a Bia não achou fundamento"
              href={`/e/${slug}/melhorias`}
              atencao
            />
          </dl>
        </Cartao>

        {/* Resolução */}
        <Cartao
          titulo="Resolvidas pela Bia"
          className="entra lg:col-span-4"
          corpoClassName="flex flex-col items-center justify-center gap-4"
          style={{ '--atraso': '80ms' } as React.CSSProperties}
        >
          <Anel
            valor={dados.resolucaoAutomatica}
            rotulo={
              dados.resolucaoAutomatica === null
                ? 'Sem conversas encerradas'
                : variacaoPontos(dados.resolucaoAutomatica, dados.resolucaoAnterior)
            }
            apoio="encerradas sem precisar de gente"
            tamanho={132}
          />
        </Cartao>

        {/* Movimento */}
        <Cartao
          titulo="Movimento por dia"
          descricao={`${dados.conversas} conversas e ${dados.mensagensRecebidas + dados.mensagensEnviadas} mensagens ${nomePeriodo}`}
          className="entra lg:col-span-8"
          corpoClassName="flex flex-col"
          style={{ '--atraso': '120ms' } as React.CSSProperties}
        >
          {serie.length <= 1 ? (
            <p className="py-8 text-center text-xs text-texto-3">
              O período de hoje não tem série para mostrar. Escolha 7 ou 30 dias.
            </p>
          ) : (
            <GraficoAtividade
              className="flex-1"
              pontos={serie.map((p) => ({ data: p.data, conversas: p.conversas }))}
            />
          )}
        </Cartao>

        {/* Custo */}
        {podeVerCusto && (
          <Cartao
            titulo="Custo de IA"
            className="entra lg:col-span-4"
            corpoClassName="flex flex-col justify-center gap-4"
            style={{ '--atraso': '160ms' } as React.CSSProperties}
          >
            <div>
              <p data-numerico className="text-2xl font-semibold tracking-[-0.02em] tabular-nums text-texto">
                {formatarCusto(dados.custoMicroUsd)}
              </p>
              <p className="mt-0.5 text-2xs text-texto-3">
                {variacaoCusto(dados.custoMicroUsd, dados.custoAnteriorMicroUsd)}
              </p>
            </div>
            <dl className="grid grid-cols-2 border-t border-linha pt-3">
              <div className="pr-3">
                <dt className="text-2xs text-texto-3">Por conversa</dt>
                <dd data-numerico className="mt-0.5 text-sm font-medium tabular-nums text-texto">
                  {dados.custoPorConversaMicroUsd === null
                    ? '—'
                    : formatarCusto(dados.custoPorConversaMicroUsd)}
                </dd>
              </div>
              <div className="border-l border-linha pl-3">
                <dt className="text-2xs text-texto-3">Mensagens</dt>
                <dd data-numerico className="mt-0.5 text-sm font-medium tabular-nums text-texto">
                  {dados.mensagensRecebidas + dados.mensagensEnviadas}
                </dd>
              </div>
            </dl>
          </Cartao>
        )}

        {/* Assuntos */}
        <Cartao
          titulo="Assuntos mais buscados"
          descricao={`O que os clientes mais perguntaram ${nomePeriodo}`}
          className={cn('entra', podeVerCusto ? 'lg:col-span-12' : 'lg:col-span-12')}
          style={{ '--atraso': '200ms' } as React.CSSProperties}
          semPreenchimento
        >
          {assuntos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-texto-3">
              Ainda não há atendimentos suficientes para identificar assuntos.
            </p>
          ) : (
            <ul className="divide-y divide-linha">
              {assuntos.map((a) => {
                const maximo = Math.max(...assuntos.map((x) => x.ocorrencias), 1);
                return (
                  <li key={a.assunto} className="flex items-center gap-4 px-4 py-3">
                    <span className="w-40 shrink-0 truncate text-sm text-texto md:w-56">
                      {a.assunto}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-superficie-2">
                      <div
                        className="h-full rounded-full bg-marca/55"
                        style={{ width: `${Math.max((a.ocorrencias / maximo) * 100, 3)}%` }}
                      />
                    </div>
                    {a.semResposta > 0 && (
                      <Link
                        href={`/e/${slug}/melhorias`}
                        className="hidden shrink-0 text-2xs text-atencao hover:underline sm:inline"
                      >
                        {a.semResposta} sem resposta
                      </Link>
                    )}
                    <span
                      data-numerico
                      className="w-10 shrink-0 text-right text-sm tabular-nums text-texto-2"
                    >
                      {a.ocorrencias}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        {dados.semFundamento > 0 && (
          <Link
            href={`/e/${slug}/melhorias`}
            className="entra group flex items-center gap-3 rounded-md border border-atencao/30 bg-atencao-suave/50 px-4 py-3 transition-colors hover:bg-atencao-suave lg:col-span-12"
            style={{ '--atraso': '240ms' } as React.CSSProperties}
          >
            <TriangleAlert aria-hidden strokeWidth={1.5} className="size-4 shrink-0 text-atencao" />
            <p className="min-w-0 flex-1 text-sm text-texto">
              <span className="font-medium">
                {dados.semFundamento}{' '}
                {dados.semFundamento === 1 ? 'vez a Bia não achou' : 'vezes a Bia não achou'} resposta
                na base
              </span>{' '}
              <span className="text-texto-2">
                — quando o mesmo assunto se repete, ele vira uma sugestão em Melhorias.
              </span>
            </p>
            <ArrowRight
              aria-hidden
              strokeWidth={1.5}
              className="size-4 shrink-0 text-texto-3 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        )}
      </div>
    </Pagina>
  );
}

function Kpi({
  rotulo,
  valor,
  apoio,
  variacao,
  href,
  atencao = false,
}: {
  rotulo: string;
  valor: string | number;
  apoio?: string;
  variacao?: string;
  href?: string;
  atencao?: boolean;
}) {
  const conteudo = (
    <>
      <p className="text-xs text-texto-2">{rotulo}</p>
      <p
        data-numerico
        className={cn(
          'mt-1 text-xl font-semibold tracking-[-0.02em] tabular-nums',
          atencao && Number(valor) > 0 ? 'text-atencao' : 'text-texto',
        )}
      >
        {valor}
      </p>
      {(variacao || apoio) && <p className="mt-0.5 text-2xs text-texto-3">{variacao ?? apoio}</p>}
    </>
  );

  if (!href) return <div className="min-w-0">{conteudo}</div>;
  return (
    <Link
      href={href}
      className="group -mx-2 -my-1 min-w-0 rounded-sm px-2 py-1 transition-colors hover:bg-superficie-2"
    >
      {conteudo}
    </Link>
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
