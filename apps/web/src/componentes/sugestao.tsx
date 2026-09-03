'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
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

  function aceitar() {
    if (!corpo.trim()) {
      setErro('Escreva a resposta que o atendente virtual deve dar.');
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
    <article className="rounded-md border border-linha bg-superficie p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 text-sm font-medium text-texto">{sugestao.titulo}</h2>
        {revisada ? (
          <Etiqueta tom={sugestao.status === 'aceita' ? 'ok' : 'neutro'}>
            {sugestao.status === 'aceita' ? 'Publicada' : 'Recusada'}
          </Etiqueta>
        ) : (
          <Etiqueta tom={sugestao.ocorrencias >= 10 ? 'atencao' : 'marca'}>
            {sugestao.ocorrencias}{' '}
            {sugestao.ocorrencias === 1 ? 'vez' : 'vezes'}
          </Etiqueta>
        )}
      </div>

      <p className="mt-2 max-w-[68ch] text-sm whitespace-pre-line text-texto-2">
        {sugestao.razao.split('\n\n')[0]}
      </p>

      <p className="mt-2 text-2xs text-texto-3">
        Visto pela última vez {tempoRelativo(sugestao.vistaPorUltimoEm)}
        {sugestao.evidencia.length > 0 &&
          ` · ${sugestao.evidencia.length} ${sugestao.evidencia.length === 1 ? 'conversa' : 'conversas'}`}
        {sugestao.revisadaPor && ` · revisada por ${sugestao.revisadaPor}`}
      </p>

      {erro && (
        <p role="alert" className="mt-3 text-xs text-falha">
          {erro}
        </p>
      )}

      {podeRevisar && !revisada && (
        <div className="mt-3">
          {respondendo ? (
            <div className="grid gap-2.5">
              <div className="grid gap-1.5">
                <label
                  htmlFor={`titulo-${sugestao.id}`}
                  className="text-xs font-medium text-texto-2"
                >
                  Título do item de conhecimento
                </label>
                <input
                  id={`titulo-${sugestao.id}`}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="h-9 rounded-sm border border-linha-firme bg-superficie px-2.5 text-sm text-texto focus:border-marca focus:outline-none focus-visible:ring-2 focus-visible:ring-marca/25 max-md:h-11"
                />
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor={`corpo-${sugestao.id}`}
                  className="text-xs font-medium text-texto-2"
                >
                  Resposta oficial da empresa
                </label>
                <textarea
                  id={`corpo-${sugestao.id}`}
                  value={corpo}
                  onChange={(e) => setCorpo(e.target.value)}
                  rows={4}
                  placeholder="Escreva como a empresa responde a essa pergunta. É este texto que o atendente virtual vai usar."
                  className="resize-y rounded-sm border border-linha-firme bg-superficie px-2.5 py-2 text-sm text-texto placeholder:text-texto-3 focus:border-marca focus:outline-none focus-visible:ring-2 focus-visible:ring-marca/25"
                />
                <p className="text-2xs text-texto-3">
                  Ao publicar, o atendente virtual passa a responder com este texto a partir da
                  próxima conversa.
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
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundaria" tamanho="sm" onClick={() => setRespondendo(true)}>
                Escrever resposta
              </Botao>
              <Botao
                variante="sutil"
                tamanho="sm"
                disabled={pendente}
                onClick={recusar}
                icone={<X strokeWidth={1.5} />}
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

/** Converte "Clientes perguntam: «X»" em um título de item de conhecimento. */
function tituloSugerido(titulo: string): string {
  const pergunta = /"([^"]+)"/.exec(titulo)?.[1];
  if (!pergunta) return titulo.slice(0, 120);
  return pergunta.charAt(0).toUpperCase() + pergunta.slice(1).replace(/\?+$/, '');
}
