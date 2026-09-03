import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SeletorTema } from '@otto/ui';

import { Assinatura } from '@/componentes/assinatura.tsx';
import { sessaoAtual } from '@/servidor/sessao.ts';
import { FormularioEntrada } from './formulario.tsx';

export const metadata: Metadata = { title: 'Entrar' };

/**
 * Tela de acesso.
 *
 * A única superfície onde o produto se apresenta — e ainda assim sóbria. Sem
 * ilustração, sem coluna lateral decorativa, sem promessa de marketing: quem
 * chega aqui quer entrar, não ser convencido.
 */
export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string }>;
}) {
  const { proximo } = await searchParams;

  // Quem já tem sessão não vê o formulário.
  if (await sessaoAtual()) redirect(proximo?.startsWith('/') ? proximo : '/');

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[19.5rem]">
          <Assinatura className="mb-9" />

          <h1 className="text-lg font-semibold tracking-[-0.01em] text-texto">Entrar</h1>
          <p className="mt-1 mb-7 text-sm text-texto-2">
            Acesse o painel de atendimento da sua empresa.
          </p>

          <FormularioEntrada proximo={proximo} />
        </div>
      </div>

      <footer className="area-segura-base flex items-center justify-between gap-4 px-6 pb-6">
        <p className="max-w-[42ch] text-2xs text-texto-3">
          Precisa de acesso? Fale com quem administra a conta da sua empresa.
        </p>
        <SeletorTema />
      </footer>
    </main>
  );
}
