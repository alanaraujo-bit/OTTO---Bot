'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Eraser, Send } from 'lucide-react';
import { Botao, cn, Etiqueta } from '@otto/ui';

/**
 * Conversa simulada.
 *
 * O painel de diagnóstico ao lado de cada resposta é o que torna esta tela útil
 * para configurar o atendimento: mostra se a IA respondeu ou encaminhou, e por
 * quê. Sem isso, o administrador veria a resposta e não saberia se ela veio da
 * base, do cadastro da unidade, ou se a conversa foi para a fila humana.
 */

interface Fala {
  de: 'cliente' | 'atendente' | 'sistema';
  texto: string;
  situacao?: 'respondida' | 'encaminhada' | 'repetida';
  motivo?: string | null;
  conversaId?: string;
}

export function Simulador({ canalId, empresaSlug }: { canalId: string; empresaSlug: string }) {
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [remetente] = useState(() => `sim${Date.now().toString().slice(-9)}`);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [falas.length]);

  async function enviar() {
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;

    setTexto('');
    setEnviando(true);
    setFalas((f) => [...f, { de: 'cliente', texto: mensagem }]);

    try {
      const resposta = await fetch('/api/webhooks/simulador', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channelId: canalId,
          de: remetente,
          nome: 'Cliente de teste',
          texto: mensagem,
        }),
      });

      const dados = (await resposta.json()) as {
        situacao?: string;
        handoff?: string | null;
        conversaId?: string;
        erro?: string;
      };

      if (!resposta.ok) {
        setFalas((f) => [
          ...f,
          { de: 'sistema', texto: dados.erro ?? 'Não foi possível processar a mensagem.' },
        ]);
        return;
      }

      // A resposta do agente é gravada no banco; buscamos para mostrar o texto
      // exato que o cliente receberia, e não uma reconstrução.
      const conversa = dados.conversaId
        ? await fetch(`/api/simulador/conversa/${dados.conversaId}`).then((r) =>
            r.ok ? (r.json() as Promise<{ ultimaResposta: string | null }>) : null,
          )
        : null;

      setFalas((f) => [
        ...f,
        {
          de: 'atendente',
          texto:
            conversa?.ultimaResposta ??
            (dados.situacao === 'encaminhada'
              ? 'Encaminhado para atendimento humano — nenhuma resposta foi enviada ao cliente.'
              : '—'),
          situacao: dados.situacao as Fala['situacao'],
          motivo: dados.handoff ?? null,
          conversaId: dados.conversaId,
        },
      ]);
    } catch {
      setFalas((f) => [
        ...f,
        { de: 'sistema', texto: 'Falha de conexão. A mensagem pode não ter sido processada.' },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-linha bg-superficie">
      <div className="rolagem min-h-0 flex-1 p-3">
        {falas.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-texto-2">
              Escreva uma pergunta como um cliente escreveria.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {[
                'que horas vocês abrem?',
                'vocês aceitam pix?',
                'tem açougue?',
                'fazem entrega?',
              ].map((sugestao) => (
                <button
                  key={sugestao}
                  type="button"
                  onClick={() => setTexto(sugestao)}
                  className="rounded-sm border border-linha-firme px-2 py-1 text-xs text-texto-2 transition-colors hover:bg-superficie-2 hover:text-texto max-md:min-h-9"
                >
                  {sugestao}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end gap-2">
            {falas.map((fala, i) => (
              <div
                key={i}
                className={cn(
                  'flex',
                  fala.de === 'cliente'
                    ? 'justify-end'
                    : fala.de === 'sistema'
                      ? 'justify-center'
                      : 'justify-start',
                )}
              >
                {fala.de === 'sistema' ? (
                  <p className="rounded-sm bg-falha-suave px-2.5 py-1.5 text-xs text-falha">
                    {fala.texto}
                  </p>
                ) : (
                  <div className="max-w-[85%]">
                    <div
                      className={cn(
                        'rounded-md px-3 py-2 text-md leading-relaxed',
                        fala.de === 'cliente'
                          ? 'rounded-tr-xs bg-marca text-marca-contraste'
                          : fala.situacao === 'encaminhada'
                            ? 'rounded-tl-xs border border-dashed border-linha-firme bg-superficie-2 text-texto-2 italic'
                            : 'rounded-tl-xs bg-superficie-2 text-texto',
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{fala.texto}</p>
                    </div>

                    {fala.de === 'atendente' && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {fala.situacao === 'encaminhada' ? (
                          <Etiqueta tom="atencao" ponto>
                            {fala.motivo === 'sem_conhecimento'
                              ? 'Sem resposta na base'
                              : fala.motivo === 'cliente_pediu'
                                ? 'Cliente pediu uma pessoa'
                                : fala.motivo === 'confianca_baixa'
                                  ? 'Confiança baixa'
                                  : 'Encaminhado'}
                          </Etiqueta>
                        ) : (
                          <Etiqueta tom="ok">Respondido pela IA</Etiqueta>
                        )}

                        {fala.conversaId && (
                          <Link
                            href={`/e/${empresaSlug}/conversas/${fala.conversaId}`}
                            className="inline-flex items-center gap-1 text-2xs text-texto-3 hover:text-marca"
                          >
                            Ver na Inbox
                            <ArrowRight aria-hidden strokeWidth={1.5} className="size-3" />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {enviando && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-md rounded-tl-xs bg-superficie-2 px-3 py-2.5">
                  <span className="size-1.5 animate-[pulso-ponto_1.2s_ease-in-out_infinite] rounded-full bg-texto-3" />
                  <span className="size-1.5 animate-[pulso-ponto_1.2s_ease-in-out_0.15s_infinite] rounded-full bg-texto-3" />
                  <span className="size-1.5 animate-[pulso-ponto_1.2s_ease-in-out_0.3s_infinite] rounded-full bg-texto-3" />
                </div>
              </div>
            )}
            <div ref={fim} />
          </div>
        )}
      </div>

      <div className="area-segura-base flex items-end gap-2 border-t border-linha p-2.5">
        {falas.length > 0 && (
          <Botao
            variante="sutil"
            aria-label="Limpar conversa"
            title="Limpar a conversa desta tela"
            onClick={() => setFalas([])}
            className="size-9 shrink-0 px-0 text-texto-3 max-md:size-11"
            icone={<Eraser strokeWidth={1.5} />}
          />
        )}

        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder="Escreva como um cliente…"
          aria-label="Mensagem do cliente simulado"
          className="h-9 flex-1 rounded-sm border border-linha-firme bg-superficie px-2.5 text-md text-texto placeholder:text-texto-3 focus:border-marca focus:outline-none focus-visible:ring-2 focus-visible:ring-marca/25 max-md:h-11"
        />

        <Botao
          variante="primaria"
          aria-label="Enviar"
          carregando={enviando}
          disabled={!texto.trim()}
          onClick={() => void enviar()}
          className="size-9 shrink-0 px-0 max-md:size-11"
          icone={enviando ? undefined : <Send strokeWidth={1.5} />}
        />
      </div>
    </div>
  );
}
