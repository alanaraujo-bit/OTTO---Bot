import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Cifragem de segredo em repouso — AES-256-GCM.
 *
 * Existe para uma coisa só: o token de canal em `channels.credentials`. Esse
 * token manda mensagem em nome da empresa, e a coluna é lida por consultas que
 * a Inbox faz — guardá-lo em texto claro significaria que qualquer erro de
 * consulta, log ou dump de banco o entrega inteiro.
 *
 * **GCM e não CBC** porque a mensagem precisa ser autenticada, não só embaralhada:
 * a tag de 16 bytes faz a decifragem *falhar* se alguém alterar um byte do
 * texto cifrado, em vez de devolver lixo que o resto do código trataria como
 * token. Sem isso, um banco comprometido permitiria trocar credenciais por
 * outras válidas do atacante.
 *
 * **IV aleatório por operação**, nunca derivado do conteúdo: reusar IV com a
 * mesma chave em GCM não vaza só a diferença entre duas mensagens — vaza a
 * chave de autenticação. É o modo conhecido de quebrar GCM na prática.
 *
 * Formato: `v1.<iv-base64url>.<tag-base64url>.<cifrado-base64url>`. O prefixo de
 * versão existe para poder trocar de algoritmo sem adivinhar o formato do que
 * já está gravado.
 */

const VERSAO = 'v1';
const BYTES_IV = 12; // 96 bits — o tamanho para o qual o GCM foi desenhado.
const BYTES_TAG = 16;
const BYTES_CHAVE = 32; // AES-256.

/**
 * Lê a chave do ambiente.
 *
 * Aceita base64 e base64url, e exige 32 bytes exatos. Uma chave curta não é
 * "menos segura": ela quebra o AES-256, então falhar aqui é melhor que cifrar
 * com material insuficiente.
 *
 * Não guarda a chave em cache entre chamadas de propósito — o custo é
 * irrelevante perto de uma chamada de rede, e ler sempre significa que trocar a
 * variável e reiniciar basta, sem estado escondido em módulo.
 */
function obterChave(): Buffer {
  const bruta = process.env.ENCRYPTION_KEY;
  if (!bruta) {
    throw new Error(
      'ENCRYPTION_KEY não está definida. Sem ela não é possível guardar credencial de canal.',
    );
  }

  const chave = Buffer.from(bruta, 'base64');
  if (chave.length !== BYTES_CHAVE) {
    throw new Error(
      `ENCRYPTION_KEY precisa ter ${BYTES_CHAVE} bytes em base64 (tem ${chave.length}). ` +
        'Gere com: openssl rand -base64 32',
    );
  }

  return chave;
}

/** `true` quando a chave está presente e utilizável. Não lança. */
export function temChaveDeCifragem(): boolean {
  try {
    obterChave();
    return true;
  } catch {
    return false;
  }
}

export function cifrar(textoClaro: string): string {
  if (textoClaro === '') throw new Error('Não há segredo para cifrar.');

  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv('aes-256-gcm', obterChave(), iv);

  const cifrado = Buffer.concat([cifrador.update(textoClaro, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();

  return [VERSAO, b64(iv), b64(tag), b64(cifrado)].join('.');
}

export function decifrar(guardado: string): string {
  const partes = guardado.split('.');
  if (partes.length !== 4 || partes[0] !== VERSAO) {
    throw new Error('Credencial em formato desconhecido. Cadastre o canal novamente.');
  }

  const iv = debase64(partes[1]!);
  const tag = debase64(partes[2]!);
  const cifrado = debase64(partes[3]!);

  if (iv.length !== BYTES_IV || tag.length !== BYTES_TAG) {
    throw new Error('Credencial corrompida. Cadastre o canal novamente.');
  }

  const decifrador = createDecipheriv('aes-256-gcm', obterChave(), iv);
  decifrador.setAuthTag(tag);

  try {
    return Buffer.concat([decifrador.update(cifrado), decifrador.final()]).toString('utf8');
  } catch {
    // `final()` lança quando a tag não bate: conteúdo adulterado, ou cifrado
    // com outra chave. A mensagem não distingue os dois casos de propósito —
    // quem chama não pode agir diferente, e detalhar ajuda quem ataca.
    throw new Error(
      'Não foi possível decifrar a credencial do canal. ' +
        'Isso acontece quando ENCRYPTION_KEY mudou desde que ela foi salva.',
    );
  }
}

/**
 * Compara dois segredos em tempo constante.
 *
 * Aqui pelo mesmo motivo que no webhook: comparar segredo com `===` vaza,
 * pelo tempo, quantos caracteres iniciais batem.
 */
export function segredosIguais(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const b64 = (b: Buffer): string => b.toString('base64url');
const debase64 = (s: string): Buffer => Buffer.from(s, 'base64url');
