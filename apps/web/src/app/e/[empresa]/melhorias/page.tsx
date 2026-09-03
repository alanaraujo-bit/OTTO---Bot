import type { Metadata } from 'next';
import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { Vazio } from '@otto/ui';

import { listarSugestoes } from '@otto/core/aprendizado';
import { pode } from '@otto/core/auth';

import { CartaoSugestao } from '@/componentes/sugestao.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';
import { Pagina } from '@/componentes/pagina.tsx';

export const metadata: Metadata = { title: 'Melhorias' };

/**
 * Fila de melhorias.
 *
 * O que a Bia observou no atendimento e acha que vale virar conhecimento —
 * sempre com a evidência ao lado, e sempre esperando a decisão de uma pessoa.
 * Nada entra na base sem alguém escrever a resposta.
 */
export default async function PaginaMelhorias({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ ver?: string }>;
}) {
  const { empresa: slug } = await params;
  const { ver } = await searchParams;
  const acesso = await exigirAcesso(slug);

  const revisadas = ver === 'revisadas';
  const [abertas, todas] = await Promise.all([
    listarSugestoes(acesso.empresa.id, 'aberta'),
    listarSugestoes(acesso.empresa.id, 'todas'),
  ]);
  const jaRevisadas = todas.filter((s) => s.status === 'aceita' || s.status === 'recusada');
  const visiveis = revisadas ? jaRevisadas : abertas;

  return (
    <Pagina largura="padrao">
      <header className="entra mb-4">
        <h1 className="text-texto text-xl font-semibold tracking-[-0.015em]">Melhorias</h1>
        <p className="text-texto-2 mt-0.5 text-sm">
          Perguntas que apareceram várias vezes e a Bia não soube responder. Nada entra na base de
          conhecimento sem alguém escrever a resposta.
        </p>
      </header>

      {(abertas.length > 0 || jaRevisadas.length > 0) && (
        <div
          role="tablist"
          aria-label="Filtrar melhorias"
          className="entra border-linha bg-superficie-2 mb-4 inline-flex gap-0.5 rounded-sm border p-0.5"
          style={{ '--atraso': '30ms' } as React.CSSProperties}
        >
          <Aba href={`/e/${slug}/melhorias`} ativa={!revisadas}>
            Para revisar{abertas.length > 0 && ` · ${abertas.length}`}
          </Aba>
          <Aba href={`/e/${slug}/melhorias?ver=revisadas`} ativa={revisadas}>
            Já revisadas{jaRevisadas.length > 0 && ` · ${jaRevisadas.length}`}
          </Aba>
        </div>
      )}

      {visiveis.length === 0 ? (
        <div
          className="entra border-linha bg-superficie rounded-md border"
          style={{ '--atraso': '60ms' } as React.CSSProperties}
        >
          <Vazio
            icone={<Lightbulb />}
            titulo={revisadas ? 'Nenhuma sugestão revisada ainda' : 'Nada para revisar'}
            descricao={
              revisadas
                ? 'Quando você aceitar ou recusar uma sugestão, ela aparece aqui com o histórico da decisão.'
                : 'Quando a mesma pergunta aparecer várias vezes sem resposta na base, ela vira uma sugestão nesta fila.'
            }
          />
        </div>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {visiveis.map((s, i) => (
            <div key={s.id} style={{ '--atraso': `${60 + i * 30}ms` } as React.CSSProperties}>
              <CartaoSugestao
                sugestao={s}
                empresaSlug={slug}
                podeRevisar={pode(acesso, 'sugestao.revisar')}
              />
            </div>
          ))}
        </div>
      )}
    </Pagina>
  );
}

function Aba({
  href,
  ativa,
  children,
}: {
  href: string;
  ativa: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={ativa}
      className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--dur-controle)] max-md:min-h-9 max-md:leading-7 ${
        ativa
          ? 'bg-superficie text-texto shadow-[var(--shadow-suspensa)]'
          : 'text-texto-3 hover:text-texto-2'
      }`}
    >
      {children}
    </Link>
  );
}
