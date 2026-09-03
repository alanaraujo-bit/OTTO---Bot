import type { Metadata } from 'next';

import { lerConfiguracao } from '@otto/core/ai';
import { pode } from '@otto/core/auth';

import { FormularioAgente } from './formulario.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Atendente virtual' };

/**
 * Configuração do atendente virtual.
 *
 * Nenhum campo de prompt. O administrador mexe em controles que fazem sentido
 * para quem toca um comércio, e a plataforma compila isso em instrução — o §42
 * da missão. A prévia da instrução existe para quem quiser conferir, mas
 * ninguém precisa entendê-la para usar o produto.
 */
export default async function PaginaAtendente({
  params,
}: {
  params: Promise<{ empresa: string }>;
}) {
  const { empresa: slug } = await params;
  const acesso = await exigirAcesso(slug);
  const config = await lerConfiguracao(acesso.empresa.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Atendente virtual</h1>
        <p className="mt-0.5 max-w-[64ch] text-sm text-texto-2">
          Como o atendimento automático conversa com seus clientes. As mudanças só valem depois de
          publicadas.
        </p>
      </header>

      <FormularioAgente
        empresaSlug={slug}
        configuracao={config}
        podeEditar={pode(acesso, 'agente.editar')}
        podePublicar={pode(acesso, 'agente.publicar')}
      />
    </div>
  );
}
