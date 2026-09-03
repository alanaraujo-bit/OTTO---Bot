'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Check, MessageSquare } from 'lucide-react';
import { Botao, Etiqueta, tempoRelativo } from '@otto/ui';

import type { SugestaoListada } from '@otto/core/aprendizado';
import { acaoAceitar, acaoRecusar } from '@/app/e/[empresa]/melhorias/acoes.ts';

/**
 * Uma sugestão de melhoria.
 *
 * O ponto central: aceitar **exige** que a pessoa escreva a resposta. O sistema
 * aponta a lacuna — quantos clientes perguntaram, quando, em quais conversas —
 * mas o texto que a empresa passa a responder é escrito por alguém da empresa.
 *
 * Gerar o texto automaticamente e pedir só um "aprovar" pareceria mais moderno e
 * seria exatamente a autocontaminação que o produto existe para impedir: o
 * revisor confirmaria sem ler, e a IA acabaria ensinando a si mesma.
 */
export function CartaoSugestao({
  sugestao,
  empresaSlug,
  podeRevisar,
}: {
  sugestao: SugestaoListada;
  empresaSlug: string;
  podeRevisar: boolean;
}) {
  const router = useRouter();
  const [respondendo, setRespondendo] = useState(false);
  const [titulo, setTitulo] = useState(tituloSugerido(sugestao.titulo));
  const [corpo, setCorpo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const revisada = sugestao.status !== 'aberta' && sugestao.status !== 'em_analise';
  const muitoFrequente = sugestao.ocorrencias >= 10;

  function aceitar() {
    if (!corpo.trim()) {
      setErro('Escreva a resposta que a Bia deve dar.');
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await acaoAceitar(empresaSlug, sugestao.id, titulo, corpo);
      if (!r.ok) setErro(r.erro ?? 'Não foi possível publicar.');
      else {
        setRespondendo(false);
        router.refresh();
      }
    });
  }

  function recusar() {
    setErro(null);
    iniciar(async () => {
      const r = await acaoRecusar(empresaSlug, sugestao.id);
      if (!r.ok) setErro(r.erro ?? 'Não foi possível recusar.');
      else router.refresh();
    });
  }

  return (
    <article className="entra rounded-md border border-linha bg-superficie">
      <div
        className={`flex items-start gap-3 px-4 pt-3.5 ${
          podeRevisar && !revisada ? 'pb-2.5' : 'pb-3.5'
        }`}
      >
        {!revisada && (
          <span
            aria-hidden
            className={`flex shrink-0 flex-col items-center rounded-sm px-2 py-1.5 ${
              muitoFrequente ? 'bg-atencao-suave text-atencao' : 'bg-superficie-2 text-texto-2'
            }`}
          >
            <span data-numerico className="text-base font-semibold tabular-nums">
              {sugestao.ocorrencias}
            </span>
            <span className="text-2xs">{sugestao.ocorrencias === 1 ? 'vez' : 'vezes'}</span>
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="min-w-0 flex-1 text-sm font-medium text-texto">{sugestao.titulo}</h2>
            {revisada && (
              <Etiqueta tom={sugestao.status === 'aceita' ? 'ok' : 'neutro'}>
                {sugestao.status === 'aceita' ? 'Virou conhecimento' : 'Recusada'}
              </Etiqueta>
            )}
          </div>

          <p className="mt-1.5 text-sm whitespace-pre-line text-texto-2">
            {sugestao.razao.split('\n\n')[0]}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-texto-3">
            <span>Vista pela última vez {tempoRelativo(sugestao.vistaPorUltimoEm)}</span>
            {sugestao.evidencia.length > 0 && (
              <Link
                href={`/e/${empresaSlug}/conversas/${sugestao.evidencia[0]}`}
                className="inline-flex items-center gap-1 text-texto-3 transition-colors hover:text-marca"
              >
                <MessageSquare aria-hidden strokeWidth={1.5} className="size-3" />
                {sugestao.evidencia.length}{' '}
                {sugestao.evidencia.length === 1 ? 'conversa' : 'conversas'}
              </Link>
            )}
            {sugestao.revisadaPor && <span>revisada por {sugestao.revisadaPor}</span>}
            {revisada && sugestao.itemGerado && (
              <Link
                href={`/e/${empresaSlug}/conhecimento/${sugestao.itemGerado}`}
                className="inline-flex items-center gap-1 text-marca hover:underline"
              >
                Ver o item <ArrowRight aria-hidden strokeWidth={1.5} className="size-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {erro && (
        <p role="alert" className="border-t border-falha/25 bg-falha-suave px-4 py-2 text-xs text-falha">
          {erro}
        </p>
      )}

      {podeRevisar && !revisada && (
        <div className={`px-4 ${respondendo ? 'pb-4' : 'pb-3.5'}`}>
          {respondendo ? (
            <div className="grid gap-2.5">
              <div className="grid gap-1.5">
                <label htmlFor={`titulo-${sugestao.id}`} className="text-xs font-medium text-texto-2">
                  Nome do item de conhecimento
                </label>
                <input
                  id={`titulo-${sugestao.id}`}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="h-9 rounded-sm border border-linha-firme bg-superficie px-2.5 text-sm text-texto focus:border-marca focus:outline-none focus-visible:ring-2 focus-visible:ring-marca/25 max-md:h-11"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor={`corpo-${sugestao.id}`} className="text-xs font-medium text-texto-2">
                  Como a empresa responde
                </label>
                <textarea
                  id={`corpo-${sugestao.id}`}
                  value={corpo}
                  onChange={(e) => setCorpo(e.target.value)}
                  rows={4}
                  placeholder="Escreva a resposta com as suas palavras. É este texto que a Bia vai usar — ela não inventa o conteúdo."
                  className="resize-y rounded-sm border border-linha-firme bg-superficie px-2.5 py-2 text-sm text-texto placeholder:text-texto-3 focus:border-marca focus:outline-none focus-visible:ring-2 focus-visible:ring-marca/25"
                />
                <p className="text-2xs text-texto-3">
                  Ao publicar, a Bia passa a responder com este texto a partir da próxima conversa.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Botao
                  variante="primaria"
                  tamanho="sm"
                  carregando={pendente}
                  onClick={aceitar}
                  icone={<Check strokeWidth={1.5} />}
                >
                  Publicar conhecimento
                </Botao>
                <Botao
                  variante="sutil"
                  tamanho="sm"
                  disabled={pendente}
                  onClick={() => setRespondendo(false)}
                >
                  Cancelar
                </Botao>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Botao variante="primaria" tamanho="sm" onClick={() => setRespondendo(true)}>
                Escrever resposta
              </Botao>
              <Botao
                variante="sutil"
                tamanho="sm"
                disabled={pendente}
                onClick={recusar}
              >
                Não é necessário
              </Botao>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** Converte "Clientes perguntam: «X»" em um nome de item de conhecimento. */
function tituloSugerido(titulo: string): string {
  const pergunta = /"([^"]+)"/.exec(titulo)?.[1];
  if (!pergunta) return titulo.slice(0, 120);
  return pergunta.charAt(0).toUpperCase() + pergunta.slice(1).replace(/\?+$/, '');
}
