import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MessageSquareDashed } from 'lucide-react';
import { Etiqueta, Vazio } from '@otto/ui';

import { formatarCusto, formatarDuracao, indicadoresHome } from '@otto/core/metricas';
import { pode } from '@otto/core/auth';
import { withTenant, tenants, eq } from '@otto/db';

import { Indicador } from '@/componentes/indicador.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Início' };

/**
 * Home operacional.
 *
 * Responde a uma pergunta só: **o que precisa de mim agora?** Por isso a fila
 * vem primeiro e o resto é contexto. Nada aqui é métrica de vaidade — cada
 * número muda o que alguém faria a seguir, ou não estaria na tela.
 */
export default async function PaginaInicio({
  params,
}: {
  params: Promise<{ empresa: string }>;
}) {
  const { empresa: slug } = await params;
  const acesso = await exigirAcesso(slug);

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-7">
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">
          {acesso.empresa.nome}
        </h1>
        <p className="mt-0.5 text-sm text-texto-2">O que está acontecendo no atendimento agora.</p>
      </header>

      <Suspense fallback={<EsqueletoIndicadores />}>
        <Indicadores empresaId={acesso.empresa.id} slug={slug} podeVerCusto={pode(acesso, 'custo.ver')} />
      </Suspense>
    </div>
  );
}

async function Indicadores({
  empresaId,
  slug,
  podeVerCusto,
}: {
  empresaId: string;
  slug: string;
  podeVerCusto: boolean;
}) {
  const [empresa] = await withTenant(empresaId, (tx) =>
    tx.select({ fuso: tenants.timezone }).from(tenants).where(eq(tenants.id, empresaId)),
  );

  const m = await indicadoresHome(empresaId, empresa?.fuso ?? 'America/Sao_Paulo');
  const semMovimento = m.conversasHoje === 0 && m.emAndamento === 0 && m.aguardandoHumano === 0;

  if (semMovimento) {
    return (
      <div className="rounded-md border border-linha bg-superficie">
        <Vazio
          icone={<MessageSquareDashed />}
          titulo="Nenhuma conversa ainda"
          descricao="Assim que um cliente mandar a primeira mensagem, ela aparece aqui e no painel de conversas. Conecte um canal em Configurações para começar a receber."
        />
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      {/* Fila — o que interrompe alguém. Vem primeiro por isso. */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
          Agora
          {m.aguardandoHumano > 0 && (
            <Etiqueta tom="atencao" ponto>
              {m.aguardandoHumano} esperando
            </Etiqueta>
          )}
        </h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Indicador
            rotulo="Aguardando atendimento humano"
            valor={m.aguardandoHumano}
            apoio={m.aguardandoHumano === 0 ? 'Nada parado' : 'A IA pediu ajuda ou o cliente pediu'}
            href={`/e/${slug}/conversas?status=aguardando_humano`}
            destaque
            atencao
          />
          <Indicador
            rotulo="Conversas em andamento"
            valor={m.emAndamento}
            apoio="Abertas ou aguardando o cliente"
            href={`/e/${slug}/conversas`}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">Hoje</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
          <Indicador rotulo="Conversas" valor={m.conversasHoje} apoio="Iniciadas hoje" />
          <Indicador rotulo="Mensagens" valor={m.mensagensHoje} apoio="Recebidas e enviadas" />
          <Indicador
            rotulo="Resolvidas pela IA"
            valor={m.resolucaoAutomatica === null ? '—' : `${m.resolucaoAutomatica}%`}
            apoio={
              m.resolucaoAutomatica === null
                ? 'Sem conversas encerradas hoje'
                : 'Encerradas sem humano'
            }
          />
          <Indicador
            rotulo="Primeira resposta"
            valor={formatarDuracao(m.tempoPrimeiraResposta)}
            apoio="Mediana"
          />
        </div>
      </section>

      {(podeVerCusto || m.semFundamentoHoje > 0) && (
        <section>
          <h2 className="mb-3 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
            Atenção
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            {m.semFundamentoHoje > 0 && (
              <Indicador
                rotulo="Perguntas sem resposta na base"
                valor={m.semFundamentoHoje}
                apoio="A IA não encontrou fundamento"
                href={`/e/${slug}/melhorias`}
                atencao
              />
            )}
            {podeVerCusto && (
              <Indicador
                rotulo="Custo de IA hoje"
                valor={formatarCusto(m.custoHojeMicroUsd)}
                apoio="Estimativa em reais"
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function EsqueletoIndicadores() {
  return (
    <div className="grid gap-8" aria-busy aria-label="Carregando indicadores">
      {[3, 4].map((colunas, secao) => (
        <div key={secao}>
          <div className="mb-3 h-3 w-16 rounded-xs bg-superficie-2" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: colunas }).map((_, i) => (
              <div key={i}>
                <div className="h-3 w-24 rounded-xs bg-superficie-2" />
                <div className="mt-2 h-6 w-12 rounded-xs bg-superficie-2" />
                <div className="mt-1.5 h-2.5 w-20 rounded-xs bg-superficie-2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
