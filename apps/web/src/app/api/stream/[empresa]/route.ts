import { assinarEventos } from '@otto/core/events';
import { descreverErro, logger } from '@otto/shared';

import { exigirAcesso } from '@/servidor/sessao.ts';

/**
 * Fluxo de eventos ao vivo da Inbox (SSE).
 *
 * SSE e não WebSocket porque o tráfego é de mão única — o servidor avisa, o
 * navegador nunca responde por aqui. SSE roda sobre HTTP comum, reconecta
 * sozinho no navegador, e não exige nada de infraestrutura. Um WebSocket
 * traria protocolo bidirecional para um problema que não é bidirecional.
 *
 * O que trafega é **notificação, não conteúdo**: "a conversa X mudou". Quem
 * recebe relê do servidor. Mandar o conteúdo aqui criaria uma segunda fonte de
 * verdade que discordaria do banco no primeiro evento perdido.
 *
 * A empresa vai no caminho, e o acesso é verificado a cada conexão: sem isso,
 * quem descobrisse a URL de outra empresa ouviria a movimentação dela.
 */

export const dynamic = 'force-dynamic';

/** Sem isto, um proxy pode acumular o fluxo e entregar tudo junto no fim. */
const CABECALHOS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
} as const;

/**
 * Batimento.
 *
 * Um SSE em silêncio é indistinguível de um SSE morto para qualquer
 * intermediário — proxy, balanceador, o próprio Railway — e a conexão é
 * fechada por inatividade. 25 s fica abaixo dos limites usuais de 30–60 s.
 */
const BATIMENTO_MS = 25_000;

export async function GET(_requisicao: Request, contexto: { params: Promise<{ empresa: string }> }) {
  const { empresa: slug } = await contexto.params;

  // `exigirAcesso` redireciona quando não há sessão; numa rota de dados isso
  // viraria um HTML no lugar do fluxo. Melhor recusar de forma explícita.
  let tenantId: string;
  try {
    const acesso = await exigirAcesso(slug);
    tenantId = acesso.empresa.id;
  } catch {
    return new Response('sem acesso', { status: 403 });
  }

  const codificador = new TextEncoder();
  let encerrar: (() => Promise<void>) | null = null;
  let batimento: ReturnType<typeof setInterval> | null = null;

  const fluxo = new ReadableStream({
    async start(controlador) {
      const escrever = (texto: string) => {
        try {
          controlador.enqueue(codificador.encode(texto));
        } catch {
          // O consumidor já foi embora; `cancel` cuida da limpeza.
        }
      };

      // Um primeiro evento imediato: o cliente sabe que está conectado, e o
      // `retry` diz de quanto em quanto tempo tentar quando a conexão cair.
      escrever('retry: 3000\n');
      escrever(`event: conectado\ndata: {"empresa":"${slug}"}\n\n`);

      encerrar = await assinarEventos(tenantId, (evento) => {
        escrever(`data: ${JSON.stringify(evento)}\n\n`);
      });

      batimento = setInterval(() => escrever(': batimento\n\n'), BATIMENTO_MS);
    },

    async cancel() {
      // Aba fechada, navegação, rede caída. Sem isto cada conexão deixaria uma
      // assinatura de Redis pendurada até o processo reiniciar.
      if (batimento) clearInterval(batimento);
      try {
        await encerrar?.();
      } catch (erro) {
        logger.warn({ erro: descreverErro(erro) }, 'falha ao encerrar assinatura de eventos');
      }
    },
  });

  return new Response(fluxo, { headers: CABECALHOS });
}
