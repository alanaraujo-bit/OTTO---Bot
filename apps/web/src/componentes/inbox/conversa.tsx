'use client';

import { Fragment, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  RotateCcw,
  Send,
  UserRound,
} from 'lucide-react';
import { Botao, cn, Etiqueta, formatarTelefone } from '@otto/ui';

import type { DetalheConversa, MensagemDaConversa } from '@otto/core/conversations';
import {
  acaoAssumir,
  acaoDevolver,
  acaoResolver,
  acaoResponder,
  type Resultado,
} from '@/app/e/[empresa]/conversas/acoes.ts';

/**
 * Uma conversa aberta.
 *
 * A conversa é o conteúdo; a interface recua. As bolhas seguem a convenção que o
 * consumidor já conhece do WhatsApp — cliente à esquerda, empresa à direita —
 * porque quem opera também usa WhatsApp e não deveria ter que reaprender o lado.
 */

export interface PermissoesConversa {
  responder: boolean;
  assumir: boolean;
  encerrar: boolean;
}

export function PainelConversa({
  conversa,
  empresaSlug,
  permissoes,
  usuarioId,
}: {
  conversa: DetalheConversa;
  empresaSlug: string;
  permissoes: PermissoesConversa;
  usuarioId: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();

  const minha = conversa.atribuidaA?.id === usuarioId;
  const iaAtiva = conversa.modo === 'automatico' && !conversa.iaPausadaAte;

  function agir(acao: () => Promise<Resultado>) {
    setErro(null);
    iniciarTransicao(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.erro ?? 'Não foi possível concluir a ação.');
      else router.refresh();
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <header className="area-segura-topo flex items-center gap-2.5 border-b border-linha bg-superficie px-3 py-2.5">
        <Link
          href={`/e/${empresaSlug}/conversas`}
          aria-label="Voltar para a lista"
          className="flex size-9 shrink-0 items-center justify-center rounded-sm text-texto-2 active:bg-superficie-2 md:hidden"
        >
          <ArrowLeft aria-hidden strokeWidth={1.5} className="size-4" />
        </Link>

        <span
          aria-hidden
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium',
            conversa.status === 'aguardando_humano'
              ? 'bg-atencao-suave text-atencao'
              : 'bg-superficie-3 text-texto-2',
          )}
        >
          {(conversa.contato.nome ?? '?').trim().charAt(0).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-texto">
            {conversa.contato.nome ?? 'Contato sem nome'}
          </p>
          <p className="truncate text-2xs text-texto-3">
            {conversa.canal.nome}
            {conversa.contato.telefone && ` · ${formatarTelefone(conversa.contato.telefone)}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {conversa.status === 'aguardando_humano' && (
            <Etiqueta tom="atencao" ponto>
              Esperando
            </Etiqueta>
          )}
          {iaAtiva ? (
            <Etiqueta tom="marca" ponto>
              Bia atendendo
            </Etiqueta>
          ) : conversa.atribuidaA ? (
            <Etiqueta tom="neutro">{minha ? 'Você' : conversa.atribuidaA.nome}</Etiqueta>
          ) : null}
        </div>
      </header>

      {/* ── Barra de ações ─────────────────────────────────────────────────── */}
      {(permissoes.assumir || permissoes.encerrar) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-linha bg-superficie-2/50 px-3 py-2">
          {permissoes.assumir &&
            (minha ? (
              <Botao
                tamanho="sm"
                variante="secundaria"
                icone={<RotateCcw strokeWidth={1.5} />}
                disabled={pendente}
                onClick={() => agir(() => acaoDevolver(empresaSlug, conversa.id))}
              >
                Devolver para a Bia
              </Botao>
            ) : (
              <Botao
                tamanho="sm"
                variante="primaria"
                icone={<UserRound strokeWidth={1.5} />}
                disabled={pendente}
                onClick={() => agir(() => acaoAssumir(empresaSlug, conversa.id))}
              >
                {conversa.atribuidaA ? 'Assumir mesmo assim' : 'Assumir atendimento'}
              </Botao>
            ))}

          {permissoes.encerrar && conversa.status !== 'resolvida' && (
            <Botao
              tamanho="sm"
              variante="sutil"
              icone={<Check strokeWidth={1.5} />}
              disabled={pendente}
              onClick={() => agir(() => acaoResolver(empresaSlug, conversa.id))}
            >
              Marcar como resolvida
            </Botao>
          )}
        </div>
      )}

      {erro && (
        <p
          role="alert"
          className="border-b border-falha/25 bg-falha-suave px-3 py-2 text-xs text-falha"
        >
          {erro}
        </p>
      )}

      <Historico mensagens={conversa.mensagens} />

      {permissoes.responder ? (
        <Redator empresaSlug={empresaSlug} conversaId={conversa.id} />
      ) : (
        <p className="area-segura-base border-t border-linha px-3 py-3 text-xs text-texto-3">
          Seu perfil permite acompanhar esta conversa, mas não responder.
        </p>
      )}
    </div>
  );
}

function Historico({ mensagens }: { mensagens: MensagemDaConversa[] }) {
  const fim = useRef<HTMLDivElement>(null);

  // Conversa abre no fim, como qualquer aplicativo de mensagem.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.length]);

  if (mensagens.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-texto-3">Nenhuma mensagem nesta conversa ainda.</p>
      </div>
    );
  }

  return (
    <div className="rolagem min-h-0 flex-1 bg-fundo px-3 py-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        {mensagens.map((m, i) => {
          const anterior = mensagens[i - 1];
          const mostrarData =
            !anterior || !mesmoDia(anterior.criadaEm, m.criadaEm);
          return (
            <Fragment key={m.id}>
              {mostrarData && <SeparadorDia data={m.criadaEm} />}
              <Bolha mensagem={m} />
            </Fragment>
          );
        })}
        <div ref={fim} />
      </div>
    </div>
  );
}

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function SeparadorDia({ data }: { data: Date }) {
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  const rotulo = mesmoDia(data, hoje)
    ? 'Hoje'
    : mesmoDia(data, ontem)
      ? 'Ontem'
      : data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: undefined });

  return (
    <div className="my-2 flex items-center justify-center">
      <span className="rounded-full bg-superficie px-2.5 py-0.5 text-2xs font-medium text-texto-3 shadow-[var(--shadow-suspensa)]">
        {rotulo}
      </span>
    </div>
  );
}

function Bolha({ mensagem }: { mensagem: MensagemDaConversa }) {
  const doCliente = mensagem.autor === 'cliente';
  const falhou = mensagem.status === 'falhou';

  // Mensagem do sistema não é uma fala — é um registro do que aconteceu no
  // atendimento. Vai centralizada e discreta, como o separador de dia.
  if (mensagem.autor === 'sistema') {
    return (
      <div className="my-1.5 flex justify-center">
        <p className="max-w-[85%] rounded-full bg-superficie-2 px-3 py-1 text-center text-2xs text-texto-3">
          {mensagem.corpo}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex', doCliente ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          doCliente ? 'max-w-[78%] items-start md:max-w-[32rem]' : 'max-w-[85%] items-end md:max-w-[34rem]',
        )}
      >
        <div
          className={cn(
            'rounded-md px-3 py-2 text-md leading-relaxed',
            doCliente
              ? 'rounded-tl-xs bg-superficie-2 text-texto'
              : falhou
                ? 'rounded-tr-xs border border-falha/30 bg-falha-suave text-texto'
                : 'rounded-tr-xs bg-marca text-marca-contraste',
          )}
        >
          {/* `whitespace-pre-wrap` preserva as quebras que a pessoa digitou. */}
          <p className="whitespace-pre-wrap break-words">{mensagem.corpo ?? '—'}</p>
        </div>

        <div
          className={cn(
            'mt-1 flex items-center gap-1.5 px-0.5 text-2xs text-texto-3',
            doCliente ? 'justify-start' : 'justify-end',
          )}
        >
          {!doCliente && (
            <span>
              {mensagem.autor === 'agente' ? 'Bia' : (mensagem.autorNome ?? 'Equipe')}
            </span>
          )}
          <time dateTime={mensagem.criadaEm.toISOString()}>
            {mensagem.criadaEm.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          {!doCliente && <Situacao status={mensagem.status} />}
        </div>

        {falhou && mensagem.falha && (
          <p className="mt-0.5 px-0.5 text-2xs text-falha">Não enviada: {mensagem.falha}</p>
        )}
      </div>
    </div>
  );
}

/** Estado de envio. Nenhuma mensagem pode parecer que "não aconteceu". */
function Situacao({ status }: { status: string }) {
  const mapa: Record<string, { Icone: typeof Check; rotulo: string; classe?: string }> = {
    pendente: { Icone: Clock, rotulo: 'Aguardando envio' },
    enviando: { Icone: Clock, rotulo: 'Enviando' },
    enviada: { Icone: Check, rotulo: 'Enviada' },
    entregue: { Icone: CheckCheck, rotulo: 'Entregue' },
    lida: { Icone: CheckCheck, rotulo: 'Lida', classe: 'text-marca' },
    falhou: { Icone: AlertCircle, rotulo: 'Falhou', classe: 'text-falha' },
  };

  const info = mapa[status];
  if (!info) return null;

  return (
    <span title={info.rotulo} className={info.classe}>
      <info.Icone aria-hidden strokeWidth={1.75} className="size-3" />
      <span className="sr-only">{info.rotulo}</span>
    </span>
  );
}

/**
 * Campo de resposta.
 *
 * A mensagem aparece na tela antes de o servidor confirmar — sem isso, digitar e
 * esperar meio segundo por uma resposta em branco faz o produto parecer travado.
 * A chave de idempotência é gerada aqui, uma por envio: clique duplo ou
 * reconexão no meio do caminho não manda a mesma mensagem duas vezes.
 */
function Redator({ empresaSlug, conversaId }: { empresaSlug: string; conversaId: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciarTransicao] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);

  function enviar() {
    const corpo = texto.trim();
    if (!corpo || enviando) return;

    const chave = `op:${crypto.randomUUID()}`;
    setTexto('');
    setErro(null);

    iniciarTransicao(async () => {
      const r = await acaoResponder(empresaSlug, conversaId, corpo, chave);
      if (!r.ok) {
        setErro(r.erro ?? 'Não foi possível enviar.');
        // Devolve o texto para a pessoa não perder o que escreveu.
        setTexto(corpo);
      } else {
        router.refresh();
      }
    });
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha — a convenção de todo mensageiro.
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      enviar();
    }
  }

  return (
    <div className="area-segura-base border-t border-linha bg-superficie px-3 py-2.5">
      {erro && (
        <p role="alert" className="mb-2 text-xs text-falha">
          {erro}
        </p>
      )}

      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          rows={1}
          placeholder="Escreva uma resposta…"
          aria-label="Mensagem para o cliente"
          className={cn(
            'max-h-40 min-h-9 flex-1 resize-none rounded-sm border border-linha-firme bg-superficie',
            'px-2.5 py-2 text-md text-texto placeholder:text-texto-3',
            'transition-colors duration-[120ms] ease-[var(--ease-padrao)]',
            'focus:outline-none focus-visible:border-marca focus-visible:ring-2 focus-visible:ring-marca/25',
            'max-md:min-h-11',
          )}
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
        />

        <Botao
          variante="primaria"
          aria-label="Enviar mensagem"
          carregando={enviando}
          disabled={!texto.trim()}
          onClick={enviar}
          className="size-9 shrink-0 px-0 max-md:size-11"
          icone={enviando ? undefined : <Send strokeWidth={1.5} />}
        />
      </div>
    </div>
  );
}
