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
  CornerUpLeft,
  RotateCcw,
  Send,
  UserRound,
  X,
} from 'lucide-react';
import { Avatar, Botao, cn, Etiqueta, formatarTelefone } from '@otto/ui';

import type {
  DetalheConversa,
  MensagemCitada,
  MensagemDaConversa,
} from '@otto/core/conversations';
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

  /**
   * A mensagem que a próxima resposta vai citar.
   *
   * Vive aqui, e não dentro do redator, porque quem escolhe é o histórico e
   * quem usa é o campo de escrita — são irmãos, e o estado precisa ser do pai.
   */
  const [respondendo, setRespondendo] = useState<MensagemDaConversa | null>(null);

  // A mensagem citada pode sumir da tela enquanto a pessoa escreve: outro
  // operador resolveu a conversa, o histórico recarregou. Citar algo que não
  // está mais lá faria o envio falhar na validação do servidor.
  useEffect(() => {
    if (respondendo && !conversa.mensagens.some((m) => m.id === respondendo.id)) {
      setRespondendo(null);
    }
  }, [conversa.mensagens, respondendo]);

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

        <Avatar
          semente={conversa.contato.id}
          nome={conversa.contato.nome}
          aguardando={conversa.status === 'aguardando_humano'}
          tamanho="md"
        />

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

      <Historico
        mensagens={conversa.mensagens}
        podeResponder={permissoes.responder}
        aoResponder={setRespondendo}
      />

      {permissoes.responder ? (
        <Redator
          empresaSlug={empresaSlug}
          conversaId={conversa.id}
          respondendo={respondendo}
          aoCancelarCitacao={() => setRespondendo(null)}
        />
      ) : (
        <p className="area-segura-base border-t border-linha px-3 py-3 text-xs text-texto-3">
          Seu perfil permite acompanhar esta conversa, mas não responder.
        </p>
      )}
    </div>
  );
}

function Historico({
  mensagens,
  podeResponder,
  aoResponder,
}: {
  mensagens: MensagemDaConversa[];
  podeResponder: boolean;
  aoResponder: (mensagem: MensagemDaConversa) => void;
}) {
  const fim = useRef<HTMLDivElement>(null);
  const [destacada, setDestacada] = useState<string | null>(null);

  // Conversa abre no fim, como qualquer aplicativo de mensagem.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.length]);

  /**
   * Ir da citação até a mensagem citada.
   *
   * Rolar sem marcar não resolve nada: a pessoa chega numa tela de mensagens
   * parecidas e não sabe qual era. O destaque diz "é esta", e apaga sozinho —
   * um realce permanente viraria sujeira na conversa.
   */
  function irAte(id: string) {
    const alvo = document.getElementById(`mensagem-${id}`);
    if (!alvo) return;
    alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setDestacada(id);
    window.setTimeout(() => setDestacada((atual) => (atual === id ? null : atual)), 1800);
  }

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
              <Bolha
                mensagem={m}
                destacada={destacada === m.id}
                podeResponder={podeResponder}
                aoResponder={aoResponder}
                aoIrAteCitada={irAte}
              />
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

/** Quem escreveu, como se lê numa citação. */
function nomeDoAutor(autor: string, autorNome: string | null): string {
  if (autor === 'cliente') return 'Cliente';
  if (autor === 'agente') return 'Bia';
  return autorNome ?? 'Equipe';
}

/**
 * O trecho citado, dentro da bolha que responde.
 *
 * Clicar leva até a original. É um botão de verdade, e não uma `div` com
 * `onClick`, porque quem opera o dia inteiro navega no teclado — e porque um
 * elemento clicável que o leitor de tela não anuncia é um elemento que não
 * existe para quem depende dele.
 */
function TrechoCitado({
  citada,
  nossa,
  aoIr,
}: {
  citada: MensagemCitada;
  nossa: boolean;
  aoIr: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => aoIr(citada.id)}
      className={cn(
        'mb-1.5 flex w-full gap-2 rounded-xs border-l-2 px-2 py-1 text-left',
        'transition-colors duration-[var(--dur-controle)]',
        nossa
          ? 'border-l-marca-contraste/45 bg-marca-contraste/12 hover:bg-marca-contraste/20'
          : 'border-l-marca bg-superficie-3/70 hover:bg-superficie-3',
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-2xs font-semibold',
            nossa ? 'text-marca-contraste/90' : 'text-marca',
          )}
        >
          {nomeDoAutor(citada.autor, citada.autorNome)}
        </span>
        {/* Duas linhas no máximo: a citação orienta, não repete a conversa. */}
        <span
          className={cn(
            'mt-0.5 line-clamp-2 block text-xs break-words',
            nossa ? 'text-marca-contraste/75' : 'text-texto-2',
          )}
        >
          {citada.corpo ?? 'Mensagem sem texto'}
        </span>
      </span>
    </button>
  );
}

function Bolha({
  mensagem,
  destacada,
  podeResponder,
  aoResponder,
  aoIrAteCitada,
}: {
  mensagem: MensagemDaConversa;
  destacada: boolean;
  podeResponder: boolean;
  aoResponder: (mensagem: MensagemDaConversa) => void;
  aoIrAteCitada: (id: string) => void;
}) {
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

  // A citação dentro da nossa bolha vive sobre o verde da marca; dentro da do
  // cliente, sobre a superfície neutra. São contrastes opostos, e a bolha que
  // falhou volta a ser clara — por isso `nossa` não é simplesmente `!doCliente`.
  const citacaoSobreMarca = !doCliente && !falhou;

  return (
    <div
      id={`mensagem-${mensagem.id}`}
      className={cn(
        'group/bolha flex scroll-mt-4',
        doCliente ? 'justify-start' : 'justify-end',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1',
          doCliente ? 'flex-row' : 'flex-row-reverse',
          doCliente ? 'max-w-[78%] md:max-w-[32rem]' : 'max-w-[85%] md:max-w-[34rem]',
        )}
      >
        <div className={cn('min-w-0', doCliente ? 'items-start' : 'items-end')}>
          <div
            className={cn(
              'rounded-md px-3 py-2 text-md leading-relaxed',
              'transition-[box-shadow,transform] duration-[var(--dur-estado)]',
              doCliente
                ? 'rounded-tl-xs bg-superficie-2 text-texto'
                : falhou
                  ? 'rounded-tr-xs border border-falha/30 bg-falha-suave text-texto'
                  : 'rounded-tr-xs bg-marca text-marca-contraste',
              // O destaque de "é esta a mensagem citada" é um anel, e não uma
              // troca de cor de fundo: a cor da bolha já significa quem falou.
              destacada && 'ring-marca ring-2 ring-offset-2 ring-offset-[var(--cor-fundo)]',
            )}
          >
            {mensagem.respondendoA && (
              <TrechoCitado
                citada={mensagem.respondendoA}
                nossa={citacaoSobreMarca}
                aoIr={aoIrAteCitada}
              />
            )}
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

        {/*
          Responder esta mensagem.

          Aparece ao passar o mouse ou ao chegar pelo teclado; no toque fica
          sempre visível, discreto. O WhatsApp usa toque longo, e aqui isso
          custaria caro: no navegador o toque longo disputa com a seleção nativa
          de texto, e desligar a seleção tiraria de quem atende a capacidade de
          copiar um endereço ou um número de pedido de dentro da mensagem — que
          é coisa que se faz o dia inteiro num atendimento.
        */}
        {podeResponder && (
          <button
            type="button"
            onClick={() => aoResponder(mensagem)}
            aria-label={`Responder a mensagem de ${nomeDoAutor(mensagem.autor, mensagem.autorNome)}`}
            title="Responder"
            className={cn(
              'text-texto-3 hover:bg-superficie-2 hover:text-texto flex size-7 shrink-0',
              'items-center justify-center rounded-full',
              'transition-[opacity,color,background-color] duration-[var(--dur-controle)]',
              'focus-visible:outline-marca focus-visible:outline-2 focus-visible:outline-offset-1',
              'max-md:opacity-60',
              'md:opacity-0 md:group-hover/bolha:opacity-100 md:focus-visible:opacity-100',
            )}
          >
            <CornerUpLeft aria-hidden strokeWidth={1.5} className="size-3.5" />
          </button>
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
function Redator({
  empresaSlug,
  conversaId,
  respondendo,
  aoCancelarCitacao,
}: {
  empresaSlug: string;
  conversaId: string;
  respondendo: MensagemDaConversa | null;
  aoCancelarCitacao: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciarTransicao] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);

  // Escolher uma mensagem para responder é dizer que vai escrever agora. Sem o
  // foco, a pessoa clica em "responder" e ainda precisa clicar no campo.
  useEffect(() => {
    if (respondendo) campo.current?.focus();
  }, [respondendo]);

  function enviar() {
    const corpo = texto.trim();
    if (!corpo || enviando) return;

    const chave = `op:${crypto.randomUUID()}`;
    // Lido antes de limpar: o envio é assíncrono e a citação some da tela agora.
    const citada = respondendo?.id ?? null;
    setTexto('');
    setErro(null);
    aoCancelarCitacao();

    iniciarTransicao(async () => {
      const r = await acaoResponder(empresaSlug, conversaId, corpo, chave, citada);
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
    // Esc desiste da citação sem apagar o que já foi escrito.
    if (evento.key === 'Escape' && respondendo) {
      evento.preventDefault();
      aoCancelarCitacao();
    }
  }

  return (
    <div className="area-segura-base border-t border-linha bg-superficie px-3 py-2.5">
      {erro && (
        <p role="alert" className="mb-2 text-xs text-falha">
          {erro}
        </p>
      )}

      {respondendo && (
        <div className="mx-auto mb-2 flex max-w-2xl items-start gap-2 rounded-sm border-l-2 border-l-marca bg-superficie-2 py-1.5 pr-1.5 pl-2.5">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-2xs font-semibold text-marca">
              <CornerUpLeft aria-hidden strokeWidth={1.75} className="size-3" />
              Respondendo {nomeDoAutor(respondendo.autor, respondendo.autorNome)}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-xs break-words text-texto-2">
              {respondendo.corpo ?? 'Mensagem sem texto'}
            </span>
          </span>
          <button
            type="button"
            onClick={aoCancelarCitacao}
            aria-label="Cancelar resposta a esta mensagem"
            className="text-texto-3 hover:bg-superficie-3 hover:text-texto flex size-6 shrink-0 items-center justify-center rounded-xs"
          >
            <X aria-hidden strokeWidth={1.5} className="size-3.5" />
          </button>
        </div>
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
