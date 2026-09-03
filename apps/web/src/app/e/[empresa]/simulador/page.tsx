import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { Vazio } from '@otto/ui';

import { channels, eq, withTenant } from '@otto/db';
import { pode } from '@otto/core/auth';

import { Simulador } from './simulador.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Simulador' };

/**
 * Simulador de conversa.
 *
 * Permite conversar com o atendente virtual como se fosse um cliente, sem
 * depender da Meta e sem gastar mensagem real. A mensagem passa pelo mesmo
 * webhook, mesma deduplicação, mesmo agente e mesmo registro de custo — o que
 * está sendo testado é o produto, não uma imitação dele.
 *
 * Fica fora da navegação principal: é uma ferramenta de configuração e
 * demonstração, não uma tela do dia a dia.
 */
export default async function PaginaSimulador({
  params,
}: {
  params: Promise<{ empresa: string }>;
}) {
  const { empresa: slug } = await params;
  const acesso = await exigirAcesso(slug);

  // Só quem configura o atendimento testa o atendimento.
  if (!pode(acesso, 'agente.ver')) notFound();

  const [canal] = await withTenant(acesso.empresa.id, (tx) =>
    tx
      .select({ id: channels.id, nome: channels.name })
      .from(channels)
      .where(eq(channels.kind, 'simulador'))
      .limit(1),
  );

  return (
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col px-4 py-5 md:h-dvh md:px-8 md:py-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Simulador</h1>
        <p className="mt-0.5 max-w-[64ch] text-sm text-texto-2">
          Converse como se fosse um cliente. A mensagem passa pelo mesmo caminho de um canal real,
          incluindo o registro de custo — mas não sai para lugar nenhum.
        </p>
      </header>

      {canal ? (
        <Simulador canalId={canal.id} empresaSlug={slug} />
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
