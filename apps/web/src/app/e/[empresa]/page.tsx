import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { Anel, Cartao, Esqueleto } from '@otto/ui';

import {
  assuntosFrequentes,
  distribuicaoPorHora,
  faixasDePico,
  formatarCusto,
  formatarDuracao,
  indicadoresHome,
  serieUltimosDias,
} from '@otto/core/metricas';
import { listarConversas } from '@otto/core/conversations';
import { pode } from '@otto/core/auth';
import { withTenant, tenants, eq } from '@otto/db';
import { partesLocais, tempoRelativo } from '@otto/shared';

import { GraficoAtividade } from '@/componentes/grafico-atividade.tsx';
import { GraficoHoras } from '@/componentes/grafico-horas.tsx';
import { Pagina } from '@/componentes/pagina.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Início' };

/**
 * Home operacional.
 *
 * Responde a uma pergunta só: **o que precisa de mim agora?** A fila vem
 * primeiro e grande; o resto é contexto que ajuda o dono a decidir se precisa
 * ficar de olho — tendência da semana, horário de pico, assuntos do momento.
 * Nada aqui é métrica de vaidade: cada número muda o que alguém faria a seguir.
 */
export default async function PaginaInicio({ params }: { params: Promise<{ empresa: string }> }) {
  const { empresa: slug } = await params;
  const acesso = await exigirAcesso(slug);

  return (
    <Pagina largura="amplo">
      <Suspense fallback={<EsqueletoPainel />}>
        <Painel
          empresaId={acesso.empresa.id}
          empresaNome={acesso.empresa.nome}
          primeiroNome={acesso.sessao.usuario.nome.split(' ')[0] ?? acesso.sessao.usuario.nome}
          slug={slug}
          podeVerCusto={pode(acesso, 'custo.ver')}
        />
      </Suspense>
    </Pagina>
  );
}

async function Painel({
  empresaId,
  empresaNome,
  primeiroNome,
  slug,
  podeVerCusto,
}: {
  empresaId: string;
  empresaNome: string;
  primeiroNome: string;
  slug: string;
  podeVerCusto: boolean;
}) {
  const [empresa] = await withTenant(empresaId, (tx) =>
    tx.select({ fuso: tenants.timezone }).from(tenants).where(eq(tenants.id, empresaId)),
  );
  const fuso = empresa?.fuso ?? 'America/Sao_Paulo';

  const [m, serie, serieLonga, horas, assuntos, esperando] = await Promise.all([
    indicadoresHome(empresaId, fuso),
    serieUltimosDias(empresaId, fuso, 14),
    serieUltimosDias(empresaId, fuso, 35),
    distribuicaoPorHora(empresaId, fuso, 30),
    assuntosFrequentes(empresaId, '30dias', fuso),
    listarConversas(empresaId, { status: 'aguardando_humano', limite: 4 }),
  ]);

  const local = partesLocais(new Date(), fuso);
  const faixas = faixasDePico(horas);
  const topAssuntos = assuntos.slice(0, 5);

  const semana = somar(serie.slice(7));
  const semanaAnterior = somar(serie.slice(0, 7));

  const semMovimento =
    m.conversasHoje === 0 && m.emAndamento === 0 && m.aguardandoHumano === 0 && semana === 0;

  return (
    <>
      <header className="entra mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div>
          <h1 className="text-texto text-xl font-semibold tracking-[-0.015em]">
            {saudacao(local.hora)}, {primeiroNome}.
          </h1>
          <p className="text-texto-2 mt-0.5 text-sm">{resumoDoMomento(m, empresaNome)}</p>
        </div>
        <p className="text-2xs text-texto-3 tabular-nums first-letter:uppercase">
          {new Date(Date.UTC(local.ano, local.mes - 1, local.dia)).toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            timeZone: 'UTC',
          })}
        </p>
      </header>

      {semMovimento ? (
        <Cartao className="entra" style={{ '--atraso': '40ms' } as React.CSSProperties}>
          <div className="px-2 py-10 text-center">
            <p className="text-texto text-base font-medium">Tudo pronto, nada chegando ainda</p>
            <p className="text-texto-2 mx-auto mt-1.5 max-w-[46ch] text-sm">
              Assim que um cliente mandar a primeira mensagem, ela aparece aqui e no painel de
              conversas. Conecte um canal em Configurações para começar a receber.
            </p>
            <Link
              href={`/e/${slug}/configuracoes`}
              className="border-linha-firme text-texto hover:bg-superficie-2 mt-5 inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors max-md:min-h-11"
            >
              Conectar um canal
              <ArrowRight aria-hidden strokeWidth={1.5} className="size-3.5" />
            </Link>
          </div>
        </Cartao>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <PainelAgora
            className="entra lg:col-span-8"
            estilo={{ '--atraso': '40ms' } as React.CSSProperties}
            slug={slug}
            aguardando={m.aguardandoHumano}
            emAndamento={m.emAndamento}
            esperando={esperando.map((c) => ({
              id: c.id,
              nome: c.contatoNome,
              previa: c.previa,
              desde: c.ultimaMensagemEm,
            }))}
          />

          <Cartao
            titulo="O dia"
            className="entra lg:col-span-4"
            corpoClassName="flex flex-col justify-between gap-6"
            style={{ '--atraso': '80ms' } as React.CSSProperties}
          >
            <div className="flex justify-center pt-1">
              <Anel
                valor={m.resolucaoAutomatica}
                rotulo="Resolvidas pela Bia hoje"
                apoio={
                  m.resolucaoAutomatica === null
                    ? 'Sem conversas encerradas ainda'
                    : 'Encerradas sem precisar de gente'
                }
                tamanho={148}
              />
            </div>
            <dl className="border-linha grid grid-cols-2 border-t">
              <MiniValor
                rotulo="Primeira resposta"
                valor={formatarDuracao(m.tempoPrimeiraResposta)}
                apoio="mediana hoje"
              />
              <MiniValor
                rotulo="Conversas hoje"
                valor={m.conversasHoje}
                apoio="iniciadas"
                bordaEsquerda
              />
              <MiniValor
                rotulo="Mensagens hoje"
                valor={m.mensagensHoje}
                apoio="nos dois sentidos"
                bordaTopo
              />
              {podeVerCusto && (
                <MiniValor
                  rotulo="Custo de IA hoje"
                  valor={formatarCusto(m.custoHojeMicroUsd)}
                  apoio="estimativa"
                  bordaTopo
                  bordaEsquerda
                />
              )}
            </dl>
          </Cartao>

          <Cartao
            titulo="Movimento"
            descricao={comparativoSemana(semana, semanaAnterior)}
            className="entra lg:col-span-8"
            corpoClassName="flex flex-col"
            style={{ '--atraso': '120ms' } as React.CSSProperties}
          >
            <GraficoAtividade
              className="flex-1"
              pontos={serie.map((d) => ({ data: d.data, conversas: d.conversas }))}
              insight={insightMovimento(serieLonga)}
            />
          </Cartao>

          <Cartao
            titulo="Assuntos"
            descricao="O que os clientes mais perguntaram nos últimos 30 dias"
            className="entra lg:col-span-4"
            style={{ '--atraso': '160ms' } as React.CSSProperties}
            acao={
              <Link
                href={`/e/${slug}/analise`}
                className="text-2xs text-texto-3 hover:text-marca transition-colors"
              >
                Ver análise
              </Link>
            }
          >
            {topAssuntos.length === 0 ? (
              <p className="text-texto-3 py-4 text-xs">
                Ainda não há atendimentos suficientes para identificar assuntos.
              </p>
            ) : (
              <ListaAssuntos assuntos={topAssuntos} slug={slug} />
            )}
          </Cartao>

          <Cartao
            titulo="Horários"
            descricao="Quando os clientes mais procuram, nos últimos 30 dias"
            className="entra lg:col-span-12"
            style={{ '--atraso': '200ms' } as React.CSSProperties}
          >
            <GraficoHoras horas={horas} faixas={faixas} />
          </Cartao>

          {m.semFundamentoHoje > 0 && (
            <Link
              href={`/e/${slug}/melhorias`}
              className="entra group border-atencao/30 bg-atencao-suave/50 hover:bg-atencao-suave flex items-center gap-3 rounded-md border px-4 py-3 transition-colors lg:col-span-12"
              style={{ '--atraso': '240ms' } as React.CSSProperties}
            >
              <TriangleAlert
                aria-hidden
                strokeWidth={1.5}
                className="text-atencao mt-0.5 size-4 shrink-0"
              />
              <p className="text-texto min-w-0 flex-1 text-sm">
                <span className="font-medium">
                  {m.semFundamentoHoje} {m.semFundamentoHoje === 1 ? 'pergunta' : 'perguntas'} sem
                  resposta na base hoje
                </span>{' '}
                <span className="text-texto-2">
                  — a Bia não encontrou o que responder e ofereceu ajuda humana.
                </span>
              </p>
              <ArrowRight
                aria-hidden
                strokeWidth={1.5}
                className="text-texto-3 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/* ── Painel "Agora" ──────────────────────────────────────────────────────── */

function PainelAgora({
  className,
  estilo,
  slug,
  aguardando,
  emAndamento,
  esperando,
}: {
  className?: string;
  estilo?: React.CSSProperties;
  slug: string;
  aguardando: number;
  emAndamento: number;
  esperando: { id: string; nome: string | null; previa: string | null; desde: Date | null }[];
}) {
  const calmo = aguardando === 0;
  const restantes = aguardando - esperando.length;

  return (
    <section
      className={`bg-superficie flex flex-col rounded-md border p-5 md:p-6 ${
        calmo ? 'border-linha' : 'border-atencao/40'
      } ${className ?? ''}`}
      style={estilo}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className={`size-2 rounded-full ${calmo ? 'bg-ok' : 'bg-atencao'}`} />
        <h2 className="text-texto-2 text-xs font-medium tracking-[0.03em] uppercase">Agora</h2>
      </div>

      <p className="text-texto mt-3.5 text-2xl font-semibold tracking-[-0.02em]">
        {calmo ? (
          'Nada esperando você'
        ) : (
          <>
            <span data-numerico className="text-atencao tabular-nums">
              {aguardando}
            </span>{' '}
            {aguardando === 1 ? 'conversa precisa' : 'conversas precisam'} de você
          </>
        )}
      </p>
      <p className="text-texto-2 mt-1.5 max-w-[52ch] text-sm">
        {calmo
          ? 'A Bia está dando conta do atendimento. Você não precisa fazer nada agora.'
          : 'A Bia pediu ajuda, ou o cliente pediu para falar com uma pessoa.'}
      </p>

      {!calmo && esperando.length > 0 && (
        <ul className="divide-linha border-linha mt-4 divide-y border-t">
          {esperando.map((c) => (
            <li key={c.id}>
              <Link
                href={`/e/${slug}/conversas/${c.id}`}
                prefetch={false}
                className="group hover:bg-superficie-2 -mx-2 flex items-center gap-3 rounded-sm px-2 py-2.5 transition-colors"
              >
                <span
                  aria-hidden
                  className="bg-superficie-2 text-texto-2 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                >
                  {inicial(c.nome)}
                </span>
                {/* Nome e prévia dividem a linha no desktop: numa faixa larga,
                    empilhar os dois deixaria metade da linha vazia até o
                    horário. No celular voltam a empilhar, que é onde a largura
                    é escassa. */}
                <span className="grid min-w-0 flex-1 gap-x-3 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:items-baseline">
                  <span className="text-texto truncate text-sm font-medium">
                    {c.nome ?? 'Contato sem nome'}
                  </span>
                  {c.previa && <span className="text-texto-2 truncate text-xs">{c.previa}</span>}
                </span>
                {c.desde && (
                  <time
                    dateTime={c.desde.toISOString()}
                    className={`text-2xs shrink-0 tabular-nums ${
                      Date.now() - c.desde.getTime() > 3_600_000
                        ? 'text-atencao font-medium'
                        : 'text-texto-3'
                    }`}
                  >
                    {tempoRelativo(c.desde)}
                  </time>
                )}
                <ArrowRight
                  aria-hidden
                  strokeWidth={1.5}
                  className="text-texto-3 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div
        className={`mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-4 ${
          !calmo && esperando.length > 0 ? 'border-linha border-t' : ''
        }`}
      >
        <Link
          href={`/e/${slug}/conversas${calmo ? '' : '?status=aguardando_humano'}`}
          className={`inline-flex items-center gap-1.5 rounded-sm px-3.5 text-sm font-medium transition-colors max-md:min-h-11 md:h-9 ${
            calmo
              ? 'border-linha-firme text-texto hover:bg-superficie-2 border'
              : 'bg-solida text-solida-contraste hover:bg-solida-forte'
          }`}
        >
          {calmo
            ? 'Abrir conversas'
            : restantes > 0
              ? `Ver todas as ${aguardando}`
              : 'Abrir na lista de conversas'}
          <ArrowRight aria-hidden strokeWidth={1.5} className="size-3.5" />
        </Link>

        <p className="text-texto-2 text-xs">
          <span data-numerico className="text-texto font-medium tabular-nums">
            {emAndamento}
          </span>{' '}
          {emAndamento === 1 ? 'outra conversa em andamento' : 'outras conversas em andamento'}
        </p>
      </div>
    </section>
  );
}

function inicial(nome: string | null): string {
  return nome?.trim()?.[0]?.toUpperCase() ?? '?';
}

/* ── Peças menores ───────────────────────────────────────────────────────── */

function MiniValor({
  rotulo,
  valor,
  apoio,
  bordaEsquerda = false,
  bordaTopo = false,
}: {
  rotulo: string;
  valor: string | number;
  apoio: string;
  bordaEsquerda?: boolean;
  bordaTopo?: boolean;
}) {
  return (
    <div
      className={`px-3 py-3 ${bordaEsquerda ? 'border-linha border-l' : ''} ${
        bordaTopo ? 'border-linha border-t' : ''
      }`}
    >
      <dt className="text-2xs text-texto-3">{rotulo}</dt>
      <dd data-numerico className="text-texto mt-1 text-base font-semibold tabular-nums">
        {valor}
      </dd>
      <p className="text-2xs text-texto-3">{apoio}</p>
    </div>
  );
}

/** Uma frase curta sobre o padrão da série. Só aparece se disser algo. */
function insightMovimento(serie: { conversas: number; diaSemana: number }[]): string | null {
  const porDia = new Array(7).fill(0).map(() => ({ soma: 0, n: 0 }));
  // Sem o dia de hoje: ele ainda está em curso e distorce a média do seu dia da semana.
  for (const d of serie.slice(0, -1)) {
    porDia[d.diaSemana]!.soma += d.conversas;
    porDia[d.diaSemana]!.n += 1;
  }
  const medias = porDia.map((x) => (x.n ? x.soma / x.n : 0));
  const geral = medias.reduce((s, v) => s + v, 0) / 7;
  if (geral === 0) return null;

  const NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const fortes = medias
    .map((m, i) => ({ m, i }))
    .filter((x) => x.m >= geral * 1.25)
    .sort((a, b) => b.m - a.m)
    .slice(0, 2)
    .map((x) => NOMES[x.i]);

  if (fortes.length === 0) return null;
  return fortes.length === 1
    ? `${cap(fortes[0]!)} costuma ser o dia mais movimentado.`
    : `${cap(fortes[0]!)} e ${fortes[1]} puxam o movimento da semana.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ListaAssuntos({
  assuntos,
  slug,
}: {
  assuntos: { assunto: string; ocorrencias: number; semResposta: number }[];
  slug: string;
}) {
  const maximo = Math.max(...assuntos.map((a) => a.ocorrencias), 1);

  return (
    <ul className="grid gap-3.5">
      {assuntos.map((a) => (
        <li key={a.assunto}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-texto min-w-0 truncate text-xs">{a.assunto}</span>
            <span data-numerico className="text-2xs text-texto-2 shrink-0 tabular-nums">
              {a.ocorrencias}
            </span>
          </div>
          <div className="bg-superficie-2 mt-1.5 h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-marca/55 h-full rounded-full"
              style={{ width: `${Math.max((a.ocorrencias / maximo) * 100, 4)}%` }}
            />
          </div>
          <div className="text-2xs mt-1 h-3.5">
            {a.semResposta > 0 && (
              <Link href={`/e/${slug}/melhorias`} className="text-atencao hover:underline">
                {a.semResposta} {a.semResposta === 1 ? 'ficou' : 'ficaram'} sem resposta
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Texto ───────────────────────────────────────────────────────────────── */

function saudacao(hora: number): string {
  if (hora < 5) return 'Boa madrugada';
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function resumoDoMomento(
  m: { aguardandoHumano: number; emAndamento: number; conversasHoje: number },
  empresaNome: string,
): string {
  if (m.aguardandoHumano > 0) {
    return `${empresaNome} tem gente esperando atendimento neste momento.`;
  }
  if (m.emAndamento > 0 || m.conversasHoje > 0) {
    return `O atendimento de ${empresaNome} está fluindo bem hoje.`;
  }
  return `Veja o que está acontecendo no atendimento de ${empresaNome}.`;
}

function comparativoSemana(atual: number, anterior: number): string {
  if (atual === 0) return 'Últimas duas semanas';
  if (anterior === 0) return `${atual} conversas nos últimos 7 dias`;
  const delta = Math.round(((atual - anterior) / anterior) * 100);
  if (delta === 0) return `${atual} nos últimos 7 dias · estável`;
  return `${atual} nos últimos 7 dias · ${delta > 0 ? '+' : ''}${delta}% vs. a semana anterior`;
}

function somar(dias: { conversas: number }[]): number {
  return dias.reduce((s, d) => s + d.conversas, 0);
}

/* ── Carregamento ────────────────────────────────────────────────────────── */

function EsqueletoPainel() {
  return (
    <div aria-busy aria-label="Carregando o painel">
      <div className="mb-6">
        <Esqueleto className="h-6 w-52" />
        <Esqueleto className="mt-2 h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Esqueleto className="h-44 lg:col-span-8" />
        <Esqueleto className="h-44 lg:col-span-4" />
        <Esqueleto className="h-52 lg:col-span-8" />
        <Esqueleto className="h-52 lg:col-span-4" />
        <Esqueleto className="h-40 lg:col-span-12" />
      </div>
    </div>
  );
}
