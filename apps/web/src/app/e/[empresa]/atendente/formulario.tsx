'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw } from 'lucide-react';
import { Botao, Campo, cn, Etiqueta, tempoRelativo } from '@otto/ui';

import type { ConfiguracaoAgente, Personalidade } from '@otto/core/ai';
import { acaoPublicar, acaoReverter, acaoSalvar } from './acoes.ts';

/**
 * Controles de comportamento.
 *
 * Cada controle tem os extremos nomeados e uma frase que descreve o efeito na
 * conversa — não um número. "35" não significa nada para quem toca um mercado;
 * "natural, educado sem cerimônia" significa.
 *
 * O rascunho salva sozinho depois de uma pausa na digitação. Publicar é
 * separado, explícito e é o único momento em que o cliente sente a mudança.
 */

const DESCRICAO_FORMALIDADE = ['Bem à vontade', 'Natural', 'Mais formal'];
const DESCRICAO_CALOR = ['Cordial e direto', 'Acolhedor', 'Muito atencioso'];
const DESCRICAO_DETALHE = ['Direto ao ponto', 'Completo sem alongar', 'Explica com calma'];

export function FormularioAgente({
  empresaSlug,
  configuracao,
  podeEditar,
  podePublicar,
}: {
  empresaSlug: string;
  configuracao: ConfiguracaoAgente;
  podeEditar: boolean;
  podePublicar: boolean;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Personalidade>(configuracao.rascunho);
  const [estado, setEstado] = useState<'limpo' | 'salvando' | 'salvo' | 'erro'>('limpo');
  const [erro, setErro] = useState<string | null>(null);
  const [publicando, iniciarPublicacao] = useTransition();
  const primeiraRenderizacao = useRef(true);

  // Salva o rascunho depois de uma pausa. Sem debounce, cada tecla viraria uma
  // gravação; sem salvamento automático, a pessoa perderia o ajuste ao navegar.
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }

    setEstado('salvando');
    const temporizador = setTimeout(async () => {
      const r = await acaoSalvar(empresaSlug, valores);
      if (r.ok) {
        setEstado('salvo');
        setErro(null);
      } else {
        setEstado('erro');
        setErro(r.erro ?? 'Não foi possível salvar.');
      }
    }, 700);

    return () => clearTimeout(temporizador);
  }, [valores, empresaSlug]);

  function alterar<K extends keyof Personalidade>(campo: K, valor: Personalidade[K]) {
    setValores((v) => ({ ...v, [campo]: valor }));
  }

  function publicar() {
    setErro(null);
    iniciarPublicacao(async () => {
      const r = await acaoPublicar(empresaSlug);
      if (!r.ok) setErro(r.erro ?? 'Não foi possível publicar.');
      else router.refresh();
    });
  }

  const naoPublicado =
    configuracao.publicada === null ||
    JSON.stringify(valores) !== JSON.stringify(configuracao.publicada);

  return (
    <div className="grid gap-7">
      <section className="grid gap-4">
        <Campo
          rotulo="Nome do atendente"
          value={valores.nome}
          required
          disabled={!podeEditar}
          ajuda="É como ele se apresenta ao cliente. Um nome de pessoa funciona melhor que “Atendimento”."
          onChange={(e) => alterar('nome', e.target.value)}
        />
      </section>

      <section className="grid gap-5">
        <h2 className="text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
          Jeito de conversar
        </h2>

        <Escala
          rotulo="Formalidade"
          valor={valores.formalidade}
          descricoes={DESCRICAO_FORMALIDADE}
          desabilitado={!podeEditar}
          onChange={(v) => alterar('formalidade', v)}
        />
        <Escala
          rotulo="Acolhimento"
          valor={valores.calor}
          descricoes={DESCRICAO_CALOR}
          desabilitado={!podeEditar}
          onChange={(v) => alterar('calor', v)}
        />
        <Escala
          rotulo="Tamanho das respostas"
          valor={valores.detalhamento}
          descricoes={DESCRICAO_DETALHE}
          desabilitado={!podeEditar}
          onChange={(v) => alterar('detalhamento', v)}
        />

        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-texto-2">Emojis</span>
          <div className="flex gap-1.5">
            {(
              [
                ['nunca', 'Nunca'],
                ['raramente', 'Com moderação'],
                ['a_vontade', 'À vontade'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                disabled={!podeEditar}
                aria-pressed={valores.emojis === valor}
                onClick={() => alterar('emojis', valor)}
                className={cn(
                  'rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors duration-[120ms]',
                  'max-md:min-h-11 max-md:px-3 disabled:opacity-50',
                  valores.emojis === valor
                    ? 'border-marca bg-marca-suave text-marca'
                    : 'border-linha-firme bg-superficie text-texto-2 hover:bg-superficie-2',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
          Quando chamar uma pessoa
        </h2>

        <div className="grid gap-1.5">
          <label htmlFor="assuntos-humanos" className="text-xs font-medium text-texto-2">
            Assuntos que sempre vão para a equipe
          </label>
          <textarea
            id="assuntos-humanos"
            rows={3}
            disabled={!podeEditar}
            value={valores.assuntosHumanos.join('\n')}
            onChange={(e) =>
              alterar(
                'assuntosHumanos',
                e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20),
              )
            }
            placeholder={'reclamação grave\nproblema com pagamento já feito'}
            className="resize-y rounded-sm border border-linha-firme bg-superficie px-2.5 py-2 text-sm text-texto placeholder:text-texto-3 focus:border-marca focus:outline-none focus-visible:ring-2 focus-visible:ring-marca/25 disabled:opacity-60"
          />
          <p className="text-2xs text-texto-3">
            Um assunto por linha. Nesses casos o atendente não tenta resolver: avisa que vai chamar
            alguém da equipe.
          </p>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="observacoes" className="text-xs font-medium text-texto-2">
            Orientações da empresa
            <span className="ml-1.5 font-normal text-texto-3">opcional</span>
          </label>
          <textarea
            id="observacoes"
            rows={3}
            disabled={!podeEditar}
            value={valores.observacoes}
            onChange={(e) => alterar('observacoes', e.target.value.slice(0, 1000))}
            placeholder="Ex.: quando perguntarem de encomenda de bolo, peça o telefone e diga que a padaria retorna."
            className="resize-y rounded-sm border border-linha-firme bg-superficie px-2.5 py-2 text-sm text-texto placeholder:text-texto-3 focus:border-marca focus:outline-none focus-visible:ring-2 focus-visible:ring-marca/25 disabled:opacity-60"
          />
          <p className="text-2xs text-texto-3">
            Orientações de comportamento. Não substituem o Conhecimento: o atendente continua sem
            inventar informação que não está cadastrada.
          </p>
        </div>
      </section>

      {erro && (
        <p
          role="alert"
          className="rounded-sm border border-falha/25 bg-falha-suave px-3 py-2 text-xs text-falha"
        >
          {erro}
        </p>
      )}

      {/* Barra de publicação. Fixa no rodapé: a decisão de publicar precisa estar
          sempre à mão enquanto a pessoa ajusta os controles. */}
      <div className="area-segura-base sticky bottom-0 -mx-4 border-t border-linha bg-superficie/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            {configuracao.publicada === null ? (
              <span className="text-texto-3">Ainda não publicado. Os clientes veem o padrão.</span>
            ) : naoPublicado ? (
              <Etiqueta tom="atencao" ponto>
                Alterações não publicadas
              </Etiqueta>
            ) : (
              <span className="text-texto-3">
                Versão {configuracao.versaoAtual} no ar
                {configuracao.publicadaEm && ` · publicada ${tempoRelativo(configuracao.publicadaEm)}`}
              </span>
            )}
            <span className="ml-2 text-texto-3">
              {estado === 'salvando' && 'salvando…'}
              {estado === 'salvo' && 'rascunho salvo'}
            </span>
          </div>

          {podePublicar && (
            <Botao
              variante="primaria"
              tamanho="sm"
              carregando={publicando}
              disabled={!naoPublicado}
              onClick={publicar}
              icone={<Check strokeWidth={1.5} />}
            >
              Publicar comportamento
            </Botao>
          )}
        </div>
      </div>

      {configuracao.historico.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
            Histórico
          </h2>
          <ul className="overflow-hidden rounded-md border border-linha bg-superficie">
            {configuracao.historico.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center gap-2 border-b border-linha px-3 py-2 last:border-0"
              >
                <span className="text-sm text-texto">Versão {v.versao}</span>
                {v.ativa && <Etiqueta tom="ok">No ar</Etiqueta>}
                <span className="text-2xs text-texto-3">
                  {tempoRelativo(v.publicadaEm)}
                  {v.autor && ` · ${v.autor}`}
                </span>
                {podePublicar && !v.ativa && (
                  <button
                    type="button"
                    onClick={() =>
                      iniciarPublicacao(async () => {
                        const r = await acaoReverter(empresaSlug, v.id);
                        if (!r.ok) setErro(r.erro ?? 'Não foi possível voltar para esta versão.');
                        else router.refresh();
                      })
                    }
                    className="ml-auto inline-flex items-center gap-1 text-2xs text-texto-3 hover:text-marca"
                  >
                    <RotateCcw aria-hidden strokeWidth={1.5} className="size-3" />
                    Voltar para esta
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Escala de três posições.
 *
 * Um controle deslizante de 0 a 100 daria a impressão de precisão que não
 * existe: a diferença entre 40 e 45 não muda nada na conversa. Três posições
 * nomeadas dizem exatamente o que muda.
 */
function Escala({
  rotulo,
  valor,
  descricoes,
  desabilitado,
  onChange,
}: {
  rotulo: string;
  valor: number;
  descricoes: string[];
  desabilitado: boolean;
  onChange: (valor: number) => void;
}) {
  const posicoes = [20, 50, 80];
  const atual = valor <= 33 ? 0 : valor <= 66 ? 1 : 2;

  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-texto-2">{rotulo}</span>
      <div
        role="radiogroup"
        aria-label={rotulo}
        className="flex gap-1.5"
      >
        {posicoes.map((posicao, i) => (
          <button
            key={posicao}
            type="button"
            role="radio"
            aria-checked={atual === i}
            disabled={desabilitado}
            onClick={() => onChange(posicao)}
            className={cn(
              'flex-1 rounded-sm border px-2 py-1.5 text-xs font-medium transition-colors duration-[120ms]',
              'max-md:min-h-11 disabled:opacity-50',
              atual === i
                ? 'border-marca bg-marca-suave text-marca'
                : 'border-linha-firme bg-superficie text-texto-2 hover:bg-superficie-2',
            )}
          >
            {descricoes[i]}
          </button>
        ))}
      </div>
    </div>
  );
}
