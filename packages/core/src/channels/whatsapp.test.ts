import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cifrar } from '@otto/shared';

import { enviarPeloWhatsApp } from './whatsapp.ts';

/**
 * O que estes testes protegem é a classificação do erro, não o caminho feliz.
 *
 * A fila tenta cinco vezes. Classificar um erro definitivo como recuperável
 * gasta cinco tentativas para falhar igual; classificar um transitório como
 * definitivo joga fora uma mensagem que teria entregue. E a regra que mais
 * importa: **nada aqui pode reenviar sozinho** — quem repete é a fila, uma
 * chamada por tentativa.
 */

const CHAVE = Buffer.alloc(32, 7).toString('base64');
const original = process.env.ENCRYPTION_KEY;

beforeEach(() => {
  process.env.ENCRYPTION_KEY = CHAVE;
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (original === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = original;
});

const pedido = () => ({
  phoneNumberId: '1307560649104617',
  para: '5594991112233',
  texto: 'Bom dia! Abrimos às 7h.',
  credenciaisCifradas: cifrar('TOKEN-DA-META'),
});

function responderCom(status: number, corpo: unknown) {
  const fetchFalso = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

describe('envio bem-sucedido', () => {
  it('devolve o wamid e chama a Meta uma única vez', async () => {
    const f = responderCom(200, { messages: [{ id: 'wamid.ABC123' }] });

    const r = await enviarPeloWhatsApp(pedido());

    expect(r.wamid).toBe('wamid.ABC123');
    // Uma tentativa por chamada. Repetir é trabalho da fila, e um retry
    // escondido aqui multiplicaria as mensagens que o cliente recebe.
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('manda o token decifrado no cabeçalho, nunca o cifrado', async () => {
    const f = responderCom(200, { messages: [{ id: 'wamid.X' }] });
    await enviarPeloWhatsApp(pedido());

    const [, opcoes] = f.mock.calls[0]!;
    expect(opcoes.headers.authorization).toBe('Bearer TOKEN-DA-META');
    expect(JSON.stringify(opcoes)).not.toContain('v1.');
  });

  it('monta o corpo no formato da Cloud API', async () => {
    const f = responderCom(200, { messages: [{ id: 'wamid.X' }] });
    await enviarPeloWhatsApp(pedido());

    const corpo = JSON.parse(f.mock.calls[0]![1].body);
    expect(corpo.messaging_product).toBe('whatsapp');
    expect(corpo.to).toBe('5594991112233');
    expect(corpo.type).toBe('text');
    expect(corpo.text.body).toBe('Bom dia! Abrimos às 7h.');
  });
});

/**
 * Resposta citada.
 *
 * O `context` é o que faz a citação aparecer no aplicativo do cliente. Quem
 * perguntou três coisas e recebe uma resposta solta não sabe qual delas foi
 * respondida — e é justamente a conversa de várias perguntas que precisa disto.
 */
describe('resposta a uma mensagem específica', () => {
  it('cita a mensagem original quando há wamid', async () => {
    const f = responderCom(200, { messages: [{ id: 'wamid.NOVA' }] });
    await enviarPeloWhatsApp({ ...pedido(), respondendoWamid: 'wamid.ORIGINAL' });

    const corpo = JSON.parse(f.mock.calls[0]![1].body);
    expect(corpo.context).toEqual({ message_id: 'wamid.ORIGINAL' });
  });

  it('não manda a chave `context` quando não há citação', async () => {
    // Não é firula de formato: `context` presente e vazio faz a Meta recusar o
    // envio inteiro por payload inválido, e aí **nenhuma** resposta de operador
    // sairia — não só as citadas. A ausência da chave é o contrato.
    const f = responderCom(200, { messages: [{ id: 'wamid.X' }] });
    await enviarPeloWhatsApp({ ...pedido(), respondendoWamid: null });

    const corpo = JSON.parse(f.mock.calls[0]![1].body);
    expect(corpo).not.toHaveProperty('context');
  });

  it('envia sem citação quando a original ainda não tem wamid', async () => {
    // A mensagem citada pode não ter saído ainda. Deixar de enviar seria pior:
    // resposta sem citação chega, resposta que não sai não chega.
    const f = responderCom(200, { messages: [{ id: 'wamid.X' }] });
    await enviarPeloWhatsApp({ ...pedido(), respondendoWamid: undefined });

    const corpo = JSON.parse(f.mock.calls[0]![1].body);
    expect(corpo).not.toHaveProperty('context');
    expect(corpo.text.body).toBe('Bom dia! Abrimos às 7h.');
  });
});

describe('erros que valem nova tentativa', () => {
  it('429 é recuperável', async () => {
    responderCom(429, { error: { message: 'rate limited', code: 4 } });
    await expect(enviarPeloWhatsApp(pedido())).rejects.toMatchObject({ retryable: true });
  });

  it('500 é recuperável', async () => {
    responderCom(500, { error: { message: 'internal' } });
    await expect(enviarPeloWhatsApp(pedido())).rejects.toMatchObject({ retryable: true });
  });

  it('falha de rede é recuperável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(enviarPeloWhatsApp(pedido())).rejects.toMatchObject({ retryable: true });
  });
});

describe('erros que não valem nova tentativa', () => {
  it('token revogado é definitivo e explicado em português', async () => {
    responderCom(401, { error: { message: 'Invalid OAuth token', code: 190 } });

    await expect(enviarPeloWhatsApp(pedido())).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('credencial do canal expirou'),
    });
  });

  it('janela de 24h fechada é definitiva — esperar não reabre', async () => {
    responderCom(400, { error: { message: 'Re-engagement message', code: 131047 } });

    await expect(enviarPeloWhatsApp(pedido())).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('24 horas'),
    });
  });

  it('número fora da lista de teste é definitivo', async () => {
    responderCom(400, { error: { message: 'not in allowed list', code: 131030 } });

    await expect(enviarPeloWhatsApp(pedido())).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('destinatários permitidos'),
    });
  });

  it('200 sem wamid não é reenviado às cegas', async () => {
    // Reenviar aqui arriscaria duplicar uma mensagem que pode ter saído.
    responderCom(200, { messages: [] });
    await expect(enviarPeloWhatsApp(pedido())).rejects.toMatchObject({ retryable: false });
  });

  it('credencial cifrada com outra chave falha sem tentar de novo', async () => {
    const f = responderCom(200, { messages: [{ id: 'wamid.X' }] });
    const p = pedido();
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');

    await expect(enviarPeloWhatsApp(p)).rejects.toMatchObject({ retryable: false });
    // E, principalmente: nunca chegou a falar com a Meta.
    expect(f).not.toHaveBeenCalled();
  });
});
