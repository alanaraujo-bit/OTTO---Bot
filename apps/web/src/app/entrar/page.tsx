import type { Metadata } from 'next';

import { FormularioEntrada } from './formulario.tsx';
import { Assinatura } from '@/componentes/assinatura.tsx';
import { SeletorTema } from '@otto/ui';

export const metadata: Metadata = { title: 'Entrar' };

/**
 * Tela de acesso.
 *
 * A única superfície onde o produto pode respirar e se apresentar — e ainda
 * assim sóbria. Sem ilustração, sem promessa de marketing, sem coluna lateral
 * decorativa: quem chega aqui quer entrar, não ser convencido.
 */
export default function PaginaEntrar() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[19.5rem]">
          <Assinatura className="mb-9" />

          <h1 className="text-lg font-semibold tracking-[-0.01em] text-texto">Entrar</h1>
          <p className="mt-1 mb-7 text-sm text-texto-2">
            Acesse o painel de atendimento da sua empresa.
          </p>

          <FormularioEntrada />
        </div>
      </div>

      <footer className="flex items-center justify-between gap-4 px-6 pb-6 area-segura-base">
        <p className="text-2xs text-texto-3">
          Precisa de acesso? Fale com quem administra a conta da sua empresa.
        </p>
        <SeletorTema />
      </footer>
    </main>
  );
}
