import type { Metadata } from 'next';
import { Lightbulb } from 'lucide-react';
import { Vazio } from '@otto/ui';

import { listarSugestoes } from '@otto/core/aprendizado';
import { pode } from '@otto/core/auth';

import { CartaoSugestao } from '@/componentes/sugestao.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Melhorias' };

/**
 * Fila de melhorias.
 *
 * O que o sistema observou no atendimento e acha que vale virar conhecimento —
 * sempre com a evidência ao lado, e sempre esperando a decisão de uma pessoa.
 */
export default async function PaginaMelhorias({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { empresa: slug } = await params;
  const { status } = await searchParams;
  const acesso = await exigirAcesso(slug);

  const filtro = status === 'revisadas' ? 'todas' : 'aberta';
  const sugestoes = await listarSugestoes(acesso.empresa.id, filtro);
  const visiveis =
    filtro === 'todas' ? sugestoes.filter((s) => s.status !== 'aberta') : sugestoes;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Melhorias</h1>
        <p className="mt-0.5 max-w-[64ch] text-sm text-texto-2">
          Perguntas que apareceram várias vezes e o atendente virtual não soube responder. Nada
          entra na base de conhecimento sem alguém escrever a resposta.
        </p>
      </header>

      {visiveis.length === 0 ? (
        <div className="rounded-md border border-linha bg-superficie">
          <Vazio
            icone={<Lightbulb />}
            titulo={filtro === 'todas' ? 'Nenhuma sugestão revisada ainda' : 'Nada para revisar'}
            descricao={
              filtro === 'todas'
                ? 'Quando você aceitar ou recusar uma sugestão, ela aparece aqui com o histórico da decisão.'
                : 'Quando a mesma pergunta aparecer três vezes sem resposta na base, ela vira uma sugestão nesta fila.'
            }
          />
        </div>
      ) : (
        <div className="grid gap-3">
          {visiveis.map((s) => (
            <CartaoSugestao
              key={s.id}
              sugestao={s}
              empresaSlug={slug}
              podeRevisar={pode(acesso, 'sugestao.revisar')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
