import IORedis from 'ioredis';

import { descreverErro, logger } from '@otto/shared';

/**
 * Barramento de eventos ao vivo.
 *
 * Existe para a Inbox refletir o que acontece sem ninguém apertar F5. O que
 * trafega aqui é **notificação, não conteúdo**: "a conversa X mudou". Quem
 * quiser saber o que mudou vai buscar no banco.
 *
 * Essa escolha é o coração do desenho. Mandar o conteúdo pelo canal criaria uma
 * segunda fonte de verdade, que precisaria concordar com o banco para sempre — e
 * discordaria no primeiro evento perdido, no primeiro reconecta, na primeira
 * corrida entre dois navegadores. Notificando, o cliente sempre relê o estado
 * real: um evento perdido custa uma atualização atrasada, nunca uma tela mentindo.
 *
 * É também o que faz a reconexão ser trivial: ao voltar, o cliente relê tudo.
 * Não há histórico de eventos para repor.
 *
 * O Redis é o mesmo das filas, mas a conexão **não** pode ser: uma conexão em
 * modo `subscribe` no Redis só aceita comandos de assinatura, e reusar a do
 * BullMQ quebraria as filas.
 */

export type TipoEvento =
  | 'mensagem'
  | 'conversa'
  | 'status_mensagem'
  | 'contadores';

export interface EventoAoVivo {
  tipo: TipoEvento;
  /** Conversa afetada, quando o evento é de uma. */
  conversationId?: string;
  /** Momento da emissão, para diagnóstico. */
  em: string;
}

const canal = (tenantId: string) => `otto:ao-vivo:${tenantId}`;

let publicador: IORedis | null = null;

function obterPublicador(): IORedis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!publicador) {
    publicador = new IORedis(url, { maxRetriesPerRequest: 2, enableReadyCheck: false });
    publicador.on('error', (erro) =>
      logger.error({ erro: descreverErro(erro) }, 'erro no publicador de eventos'),
    );
  }
  return publicador;
}

/**
 * Anuncia que algo mudou nesta empresa.
 *
 * **Nunca lança.** Um aviso de tempo real que falha não pode derrubar a
 * operação que o originou: perder o aviso atrasa a tela até o próximo evento;
 * perder a mensagem do cliente é irreversível.
 */
export async function publicarEvento(tenantId: string, evento: Omit<EventoAoVivo, 'em'>): Promise<void> {
  try {
    const cliente = obterPublicador();
    if (!cliente) return;

    await cliente.publish(
      canal(tenantId),
      JSON.stringify({ ...evento, em: new Date().toISOString() } satisfies EventoAoVivo),
    );
  } catch (erro) {
    logger.warn({ erro: descreverErro(erro), tenantId }, 'não foi possível publicar evento ao vivo');
  }
}

/**
 * Assina os eventos de uma empresa.
 *
 * Abre conexão própria por assinante — é o que o Redis exige — e devolve a
 * função que encerra. Quem chama **precisa** chamar o encerramento quando a
 * requisição terminar, ou cada aba aberta deixaria uma conexão pendurada.
 */
export async function assinarEventos(
  tenantId: string,
  aoReceber: (evento: EventoAoVivo) => void,
): Promise<() => Promise<void>> {
  const url = process.env.REDIS_URL;
  if (!url) return async () => {};

  const assinante = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });

  assinante.on('error', (erro) =>
    logger.warn({ erro: descreverErro(erro), tenantId }, 'erro na assinatura de eventos'),
  );

  assinante.on('message', (_canal, carga) => {
    try {
      aoReceber(JSON.parse(carga) as EventoAoVivo);
    } catch {
      // Carga malformada não derruba a assinatura das outras mensagens.
    }
  });

  await assinante.subscribe(canal(tenantId));

  return async () => {
    try {
      await assinante.unsubscribe(canal(tenantId));
    } finally {
      assinante.disconnect();
    }
  };
}

export async function fecharBarramento(): Promise<void> {
  await publicador?.quit();
  publicador = null;
}
