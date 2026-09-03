import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, FlaskConical, Headset, ShieldCheck } from 'lucide-react';
import { Cartao, Vazio } from '@otto/ui';

import { channels, eq, knowledgeItems, sql, withTenant } from '@otto/db';
import { lerConfiguracao } from '@otto/core/ai';
import { pode } from '@otto/core/auth';

import { Simulador } from './simulador.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Simulador' };

const DESCR_FORMALIDADE = ['Bem à vontade', 'Natural', 'Mais formal'];
const DESCR_CALOR = ['Cordial e direto', 'Acolhedor', 'Muito atencioso'];
const DESCR_DETALHE = ['Direto ao ponto', 'Completo sem alongar', 'Explica com calma'];
const nivel = (v: number) => (v <= 33 ? 0 : v <= 66 ? 1 : 2);

/**
 * Simulador de conversa.
 *
 * Permite conversar com a Bia como se fosse um cliente, sem depender da Meta e
 * sem gastar mensagem real. A mensagem passa pelo mesmo webhook, mesma
 * deduplicação, mesmo agente e mesmo registro de custo — o que está sendo
 * testado é o produto, não uma imitação dele.
 */
export default async function PaginaSimulador({
  params,
}: {
  params: Promise<{ empresa: string }>;
}) {
  const { empresa: slug } = await params;
  const acesso = await exigirAcesso(slug);

  if (!pode(acesso, 'agente.ver')) return null;

  const [dados, config] = await Promise.all([
    withTenant(acesso.empresa.id, async (tx) => {
      const [canal] = await tx
        .select({ id: channels.id, nome: channels.name })
        .from(channels)
        .where(eq(channels.kind, 'simulador'))
        .limit(1);
      const [conhecimento] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(knowledgeItems)
        .where(eq(knowledgeItems.status, 'publicado'));
      return { canal, publicados: conhecimento?.n ?? 0 };
    }),
    lerConfiguracao(acesso.empresa.id),
  ]);

  const p = config.publicada ?? config.rascunho;
  const jeito = [
    DESCR_FORMALIDADE[nivel(p.formalidade)],
    DESCR_CALOR[nivel(p.calor)],
    DESCR_DETALHE[nivel(p.detalhamento)],
  ];

  return (
    <div className="mx-auto flex max-w-[var(--w-conteudo,84rem)] flex-col px-4 pt-5 pb-6 md:h-full md:px-8 md:pt-7 md:pb-7">
      <header className="mb-3 shrink-0">
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Simulador</h1>
        <p className="mt-0.5 text-sm text-texto-2">
          Converse como se fosse um cliente. Passa pela mesma Bia e pelo mesmo Conhecimento de um
          canal real — mas não sai para lugar nenhum.
        </p>
      </header>

      {dados.canal ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <div className="flex h-[calc(100dvh-16rem)] min-h-[22rem] flex-col md:h-auto md:min-h-0 md:flex-1">
            <Simulador canalId={dados.canal.id} empresaSlug={slug} />
          </div>

          <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto lg:flex xl:w-80">
            <Cartao titulo="O que está sendo testado" plano className="border border-linha">
              <ul className="grid gap-3 text-xs">
                <li>
                  <p className="flex items-center gap-1.5 font-medium text-texto">
                    <Headset aria-hidden strokeWidth={1.5} className="size-3.5 text-texto-3" />
                    {p.nome}
                  </p>
                  <p className="mt-1 text-texto-3">{jeito.join(' · ')}</p>
                  <Link
                    href={`/e/${slug}/atendente`}
                    className="mt-1 inline-flex items-center gap-1 text-2xs text-texto-3 hover:text-marca"
                  >
                    Ajustar o jeito <ArrowRight aria-hidden strokeWidth={1.5} className="size-3" />
                  </Link>
                </li>
                <li className="border-t border-linha pt-3">
                  <p className="flex items-center gap-1.5 font-medium text-texto">
                    <BookOpen aria-hidden strokeWidth={1.5} className="size-3.5 text-texto-3" />
                    {dados.publicados} {dados.publicados === 1 ? 'item' : 'itens'} de conhecimento
                  </p>
                  <p className="mt-1 text-texto-3">É só sobre isso que a Bia responde.</p>
                  <Link
                    href={`/e/${slug}/conhecimento`}
                    className="mt-1 inline-flex items-center gap-1 text-2xs text-texto-3 hover:text-marca"
                  >
                    Ver o Conhecimento <ArrowRight aria-hidden strokeWidth={1.5} className="size-3" />
                  </Link>
                </li>
              </ul>
            </Cartao>

            <div className="flex items-start gap-2 rounded-md bg-superficie-2/60 px-3 py-2.5 text-2xs text-texto-3">
              <ShieldCheck aria-hidden strokeWidth={1.5} className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Nada aqui chega a um cliente de verdade. Cada teste vira uma conversa no canal de
                teste, que você pode limpar quando quiser.
              </span>
            </div>
          </aside>
        </div>
      ) : (
        <div className="rounded-md border border-linha bg-superficie">
          <Vazio
            icone={<FlaskConical />}
            titulo="Nenhum canal de teste"
            descricao="Esta empresa não tem um canal de teste cadastrado. Fale com o suporte para criar um — ele é necessário para simular conversas antes de conectar o WhatsApp."
          />
        </div>
      )}
    </div>
  );
}
