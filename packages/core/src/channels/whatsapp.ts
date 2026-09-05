import { AppError, decifrar, logger } from '@otto/shared';

/**
 * Adaptador de envio da WhatsApp Cloud API.
 *
 * A única parte do código que sabe como a Meta espera um envio. Trocar de
 * provedor, ou acrescentar um canal, é escrever outro arquivo deste tamanho.
 *
 * A decisão que governa tudo aqui é **o que vale tentar de novo**. A fila tenta
 * cinco vezes com recuo exponencial; classificar errado tem dois custos opostos
 * e ambos ruins: marcar como recuperável um token inválido gasta cinco
 * tentativas para falhar igual, e marcar como definitivo um `429` joga fora uma
 * mensagem que teria entregue no segundo seguinte.
 */

const VERSAO_API = 'v23.0';

export interface EnvioWhatsApp {
  /** `phone_number_id` do canal — de quem sai a mensagem. */
  phoneNumberId: string;
  /** `wa_id` do destinatário. */
  para: string;
  texto: string;
  /** Credencial cifrada, como está em `channels.credentials`. */
  credenciaisCifradas: string;
}

export interface RespostaEnvio {
  /** O `wamid` da Meta. É o que amarra os status posteriores a esta mensagem. */
  wamid: string;
}

export async function enviarPeloWhatsApp(pedido: EnvioWhatsApp): Promise<RespostaEnvio> {
  let token: string;
  try {
    token = decifrar(pedido.credenciaisCifradas);
  } catch (erro) {
    // Credencial ilegível não melhora com nova tentativa.
    throw naoRecuperavel(
      erro instanceof Error ? erro.message : 'A credencial do canal não pôde ser lida.',
    );
  }

  const url = `https://graph.facebook.com/${VERSAO_API}/${pedido.phoneNumberId}/messages`;

  // Timeout próprio: sem ele, uma requisição pendurada segura um worker da fila
  // até o tempo do sistema operacional, que é de minutos.
  const cancelamento = AbortSignal.timeout(20_000);

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: pedido.para,
        type: 'text',
        // `preview_url: false` é deliberado: link com prévia muda a aparência da
        // mensagem sem que ninguém tenha pedido, e a prévia é buscada pela Meta.
        text: { preview_url: false, body: pedido.texto },
      }),
      signal: cancelamento,
    });
  } catch (erro) {
    // Rede caiu, DNS falhou, timeout. Tudo transitório.
    throw recuperavel(erro instanceof Error ? erro.message : 'A Meta não respondeu.');
  }

  const corpo = (await resposta.json().catch(() => null)) as RespostaMeta | null;

  if (!resposta.ok) {
    const erro = corpo?.error;
    const detalhe = erro?.error_user_msg ?? erro?.message ?? `HTTP ${resposta.status}`;

    logger.warn(
      { status: resposta.status, codigo: erro?.code, subcodigo: erro?.error_subcode },
      'envio pelo WhatsApp recusado',
    );

    if (podeTentarDeNovo(resposta.status, erro?.code)) {
      throw recuperavel(detalhe);
    }
    throw naoRecuperavel(traduzir(erro?.code, detalhe));
  }

  const wamid = corpo?.messages?.[0]?.id;
  if (!wamid) {
    // `200` sem id não deveria acontecer. Tentar de novo arriscaria mandar
    // duas vezes uma mensagem que pode ter saído — melhor falhar visível.
    throw naoRecuperavel('A Meta aceitou a mensagem mas não devolveu o identificador.');
  }

  return { wamid };
}

interface RespostaMeta {
  messages?: { id?: string }[];
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
  };
}

/**
 * O que vale tentar de novo.
 *
 * `429` e `5xx` são transitórios por definição. O `368` (conta restrita
 * temporariamente) e o `131048` (limite de qualidade) também passam sozinhos.
 * `4xx` restante é problema de configuração ou de conteúdo: repetir dá o mesmo
 * resultado cinco vezes.
 *
 * O `131047` fica **fora** de propósito: é a janela de 24 h fechada, e ela não
 * reabre esperando — reabre quando o cliente escreve de novo.
 */
function podeTentarDeNovo(status: number, codigo: number | undefined): boolean {
  if (status === 429 || status >= 500) return true;
  return codigo === 368 || codigo === 131048 || codigo === 131056;
}

/**
 * Mensagem em português para quem lê a Inbox.
 *
 * O texto da Meta chega em inglês e cita conceitos que não significam nada para
 * quem atende — "re-engagement message", "template". Aqui vira o que aconteceu
 * e o que fazer.
 */
function traduzir(codigo: number | undefined, padrao: string): string {
  switch (codigo) {
    case 131047:
      return 'Passaram mais de 24 horas desde a última mensagem do cliente. O WhatsApp só permite retomar a conversa com um modelo aprovado pela Meta.';
    case 131026:
      return 'Este número não recebe mensagens pelo WhatsApp.';
    case 131051:
      return 'Este tipo de mensagem não é aceito pelo WhatsApp.';
    case 190:
      return 'A credencial do canal expirou ou foi revogada. É preciso reconectar o número.';
    case 200:
    case 10:
      return 'O aplicativo não tem permissão para enviar por este número.';
    case 131030:
      return 'Este número não está na lista de destinatários permitidos do número de teste.';
    default:
      return padrao;
  }
}

const recuperavel = (mensagem: string): Error =>
  Object.assign(new AppError('dependencia_externa', mensagem), { retryable: true });

const naoRecuperavel = (mensagem: string): Error =>
  Object.assign(new AppError('dependencia_externa', mensagem), { retryable: false });
