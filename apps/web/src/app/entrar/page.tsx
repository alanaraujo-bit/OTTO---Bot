import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SeletorTema } from '@otto/ui';

import { Assinatura } from '@/componentes/assinatura.tsx';
import { ProdutoAionix } from '@/componentes/aionix.tsx';
import { sessaoAtual } from '@/servidor/sessao.ts';
import { ApresentacaoEntrada } from './apresentacao.tsx';
import { FormularioEntrada } from './formulario.tsx';

export const metadata: Metadata = { title: 'Entrar' };

const WHATSAPP_SUPORTE =
  'https://wa.me/5594991205078?text=Ol%C3%A1%21%20Preciso%20de%20ajuda%20para%20acessar%20minha%20conta.';

/**
 * Tela de acesso.
 *
 * No desktop, apresentação e acesso dividem a tela. O lado esquerdo explica o
 * mecanismo do produto sem métricas inventadas; o direito mantém o formulário
 * como tarefa principal. No celular, a explicação se condensa para a entrada
 * continuar rápida e confortável.
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
    <main className="bg-fundo min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(25rem,0.72fr)]">
      <ApresentacaoEntrada />

      <section className="relative flex min-h-dvh flex-col px-6 py-6 sm:px-10 lg:px-12 xl:px-16">
        <div className="area-segura-topo flex items-center justify-between">
          <Assinatura className="lg:hidden" tamanho="sm" />
          <div className="ml-auto">
            <SeletorTema />
          </div>
        </div>

        <div className="assenta my-auto w-full max-w-[23rem] self-center py-12">
          <div className="mb-10 lg:hidden">
            <h1 className="text-texto max-w-[12ch] text-xl font-semibold tracking-[-0.025em] text-balance">
              Cada conversa segue o caminho certo.
            </h1>
            <p className="text-texto-2 mt-3 text-sm leading-relaxed">
              Atendimento centralizado, respostas com fundamento e sua equipe no controle.
            </p>
          </div>

          <h2 className="text-texto text-xl font-semibold tracking-[-0.025em]">
            Entre na operação.
          </h2>
          <p className="text-texto-2 mt-2 mb-7 text-sm leading-relaxed">
            Acompanhe conversas, respostas e tudo que precisa da sua atenção.
          </p>

          <FormularioEntrada proximo={proximo} />

          <div className="border-linha mt-7 border-t pt-5">
            <p className="text-texto-3 text-xs leading-relaxed">
              Sem acesso ou esqueceu a senha?{' '}
              <a
                href={WHATSAPP_SUPORTE}
                target="_blank"
                rel="noreferrer"
                className="text-texto-2 decoration-linha-firme hover:text-marca focus-visible:outline-marca font-medium underline underline-offset-4 transition-colors focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-3"
              >
                Fale comigo pelo WhatsApp.
              </a>
            </p>
          </div>
        </div>

        <ProdutoAionix className="area-segura-base self-center lg:self-start" />
      </section>
    </main>
  );
}
