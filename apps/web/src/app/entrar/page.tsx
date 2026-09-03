import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { marca, SeletorTema } from '@otto/ui';

import { Assinatura } from '@/componentes/assinatura.tsx';
import { sessaoAtual } from '@/servidor/sessao.ts';
import { FormularioEntrada } from './formulario.tsx';

export const metadata: Metadata = { title: 'Entrar' };

/**
 * Tela de acesso.
 *
 * A única superfície onde o produto respira e se apresenta — e ainda assim
 * sóbria. Sem ilustração, sem coluna lateral decorativa, sem promessa de
 * marketing: quem chega aqui quer entrar. O que ela ganha em relação ao resto é
 * folga e um cartão com presença, centrado, para não ser um formulário perdido
 * no meio da tela.
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
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-fundo px-6 py-12">
      <div className="entra w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Assinatura tamanho="md" />
          <p className="mt-2 text-xs whitespace-nowrap text-texto-3">{marca.descricao}</p>
        </div>

        <div className="rounded-lg border border-linha-firme bg-superficie p-6 shadow-[var(--shadow-camada)] md:p-7">
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-texto">Entrar</h1>
          <p className="mt-1 mb-6 text-sm text-texto-2">
            Acesse o painel de atendimento da sua empresa.
          </p>

          <FormularioEntrada proximo={proximo} />
        </div>

        <p className="mx-auto mt-5 max-w-[40ch] text-center text-2xs text-texto-3">
          Não tem acesso ou esqueceu a senha? Fale com quem administra a conta da sua empresa.
        </p>
      </div>

      <div className="area-segura-base absolute right-6 bottom-6">
        <SeletorTema />
      </div>
    </main>
  );
}
