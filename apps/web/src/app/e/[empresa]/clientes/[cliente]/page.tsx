import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Cartao, Etiqueta, formatarTelefone, tempoRelativo } from '@otto/ui';

import { detalharCliente } from '@otto/core/contatos';

import { exigirAcesso } from '@/servidor/sessao.ts';
import { Pagina } from '@/componentes/pagina.tsx';

export const metadata: Metadata = { title: 'Cliente' };

const ROTULO_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  simulador: 'Canal de teste',
};

const TOM_STATUS: Record<string, { tom: 'ok' | 'atencao' | 'neutro' | 'marca'; rotulo: string }> = {
  aberta: { tom: 'marca', rotulo: 'Aberta' },
  aguardando_cliente: { tom: 'neutro', rotulo: 'Aguardando cliente' },
  aguardando_humano: { tom: 'atencao', rotulo: 'Esperando você' },
  resolvida: { tom: 'ok', rotulo: 'Resolvida' },
  encerrada: { tom: 'neutro', rotulo: 'Encerrada' },
};

/**
 * Ficha do cliente.
 *
 * Só leitura, e de propósito: o que serve ao atendimento é o histórico e o
 * atalho para a conversa. Corrigir nome e anotar observação entram junto com a
 * edição inline do resto do produto.
 */
export default async function PaginaCliente({
  params,
}: {
  params: Promise<{ empresa: string; cliente: string }>;
}) {
  const { empresa: slug, cliente: clienteId } = await params;
  const acesso = await exigirAcesso(slug);

  const cliente = await detalharCliente(acesso.empresa.id, clienteId);
  if (!cliente) notFound();

  const totalMensagens = cliente.historico.reduce((s, h) => s + h.mensagens, 0);

  return (
    <Pagina largura="padrao" className="max-w-[68rem]">
      <Link
        href={`/e/${slug}/clientes`}
        className="entra text-texto-3 hover:text-texto-2 mb-4 inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <ArrowLeft aria-hidden strokeWidth={1.5} className="size-3.5" />
        Clientes
      </Link>

      <header
        className="entra mb-6 flex items-center gap-3"
        style={{ '--atraso': '30ms' } as React.CSSProperties}
      >
        <span
          aria-hidden
          className="bg-superficie-3 text-texto-2 flex size-12 shrink-0 items-center justify-center rounded-full text-base font-medium"
        >
          {cliente.nome?.trim()?.[0]?.toUpperCase() ?? '?'}
        </span>
        <div className="min-w-0">
          <h1 className="text-texto flex items-center gap-2 text-xl font-semibold tracking-[-0.015em]">
            <span className="truncate">{cliente.nome ?? 'Contato sem nome'}</span>
            {cliente.bloqueado && <Etiqueta tom="falha">Bloqueado</Etiqueta>}
          </h1>
          <p className="text-texto-2 mt-0.5 text-sm">
            {cliente.telefone ? formatarTelefone(cliente.telefone) : 'sem telefone'}
          </p>
        </div>
      </header>

      {/*
        Quem é o cliente fica numa coluna fixa à esquerda; o histórico, que é a
        parte que cresce, ocupa o resto. Empilhados numa coluna de leitura, os
        dois somavam uma página alta com meia tela vazia dos lados.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[21rem_1fr]">
        <div className="grid gap-4">
          <Cartao
            titulo="Resumo"
            className="entra"
            style={{ '--atraso': '60ms' } as React.CSSProperties}
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Fato rotulo="Conversas" valor={String(cliente.conversas)} />
              <Fato rotulo="Mensagens" valor={String(totalMensagens)} />
              <Fato
                rotulo="Cliente desde"
                valor={cliente.primeiroContatoEm.toLocaleDateString('pt-BR', {
                  month: 'short',
                  year: 'numeric',
                })}
              />
              <Fato
                rotulo="Último contato"
                valor={cliente.ultimaInteracao ? tempoRelativo(cliente.ultimaInteracao) : '—'}
              />
            </dl>
            {cliente.canais.length > 0 && (
              <div className="border-linha mt-4 flex flex-wrap gap-1.5 border-t pt-4">
                {cliente.canais.map((canal) => (
                  <Etiqueta key={canal} tom="neutro">
                    {ROTULO_CANAL[canal] ?? canal}
                  </Etiqueta>
                ))}
              </div>
            )}
          </Cartao>

          {cliente.observacoes && (
            <Cartao
              titulo="Observações"
              className="entra"
              style={{ '--atraso': '80ms' } as React.CSSProperties}
            >
              <p className="text-texto-2 text-sm whitespace-pre-wrap">{cliente.observacoes}</p>
            </Cartao>
          )}
        </div>

        <Cartao
          titulo="Histórico de conversas"
          className="entra"
          style={{ '--atraso': '100ms' } as React.CSSProperties}
          semPreenchimento
        >
          {cliente.historico.length === 0 ? (
            <p className="text-texto-3 px-4 py-6 text-center text-sm">
              Este contato ainda não tem conversas.
            </p>
          ) : (
            <ul className="divide-linha divide-y">
              {cliente.historico.map((h) => {
                const st = TOM_STATUS[h.status] ?? { tom: 'neutro' as const, rotulo: h.status };
                return (
                  <li key={h.id}>
                    <Link
                      href={`/e/${slug}/conversas/${h.id}`}
                      prefetch={false}
                      className="hover:bg-superficie-2 flex items-center gap-3 px-4 py-3 transition-colors"
                    >
                      <MessageSquare
                        aria-hidden
                        strokeWidth={1.5}
                        className="text-texto-3 size-4 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-texto text-sm">
                          {h.mensagens} {h.mensagens === 1 ? 'mensagem' : 'mensagens'}
                          <span className="text-texto-3">
                            {' · '}
                            {ROTULO_CANAL[h.canal] ?? h.canal}
                          </span>
                        </p>
                        <p className="text-2xs text-texto-3 mt-0.5">
                          {h.iniciadaEm.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {h.ultimaMensagemEm && ` · última ${tempoRelativo(h.ultimaMensagemEm)}`}
                        </p>
                      </div>
                      <Etiqueta tom={st.tom}>{st.rotulo}</Etiqueta>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>
      </div>
    </Pagina>
  );
}

function Fato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-2xs text-texto-3">{rotulo}</dt>
      <dd data-numerico className="text-texto mt-0.5 text-sm font-medium tabular-nums">
        {valor}
      </dd>
    </div>
  );
}
