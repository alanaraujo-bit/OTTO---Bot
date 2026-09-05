import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cifrar, decifrar, segredosIguais, temChaveDeCifragem } from './cifra.ts';

/**
 * A cifragem guarda o token que manda mensagem em nome da empresa. Os testes
 * que importam não são "ida e volta funciona" — são os que provam que ela
 * *falha* quando deve: chave errada, conteúdo adulterado, formato estranho.
 */

const CHAVE_A = Buffer.alloc(32, 1).toString('base64');
const CHAVE_B = Buffer.alloc(32, 2).toString('base64');

const original = process.env.ENCRYPTION_KEY;
beforeEach(() => {
  process.env.ENCRYPTION_KEY = CHAVE_A;
});
afterEach(() => {
  if (original === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = original;
});

describe('ida e volta', () => {
  it('devolve o mesmo texto', () => {
    const token = 'EAAaf2o5rn18B_um_token_longo_da_Meta_com_underscores';
    expect(decifrar(cifrar(token))).toBe(token);
  });

  it('preserva acentuação e emoji', () => {
    const texto = 'ação · coração · 🇧🇷 · ç ã õ é';
    expect(decifrar(cifrar(texto))).toBe(texto);
  });

  it('cifra o mesmo texto de forma diferente a cada vez', () => {
    // IV aleatório por operação. Se dois cifrados fossem iguais, o IV estaria
    // sendo reusado — que é como se quebra GCM na prática.
    const a = cifrar('mesmo segredo');
    const b = cifrar('mesmo segredo');
    expect(a).not.toBe(b);
    expect(decifrar(a)).toBe(decifrar(b));
  });

  it('não deixa o texto claro aparecer no resultado', () => {
    const cifrado = cifrar('senha-secreta-do-canal');
    expect(cifrado).not.toContain('senha-secreta');
    expect(Buffer.from(cifrado).toString('utf8')).not.toContain('senha-secreta');
  });
});

describe('recusa o que não pode aceitar', () => {
  it('falha ao decifrar com outra chave', () => {
    const cifrado = cifrar('token');
    process.env.ENCRYPTION_KEY = CHAVE_B;
    expect(() => decifrar(cifrado)).toThrow(/ENCRYPTION_KEY mudou/);
  });

  it('falha quando o texto cifrado é adulterado', () => {
    const cifrado = cifrar('token');
    const partes = cifrado.split('.');
    const bytes = Buffer.from(partes[3]!, 'base64url');
    bytes[0] = bytes[0]! ^ 0xff;
    const adulterado = [partes[0], partes[1], partes[2], bytes.toString('base64url')].join('.');

    // Esta é a diferença entre GCM e CBC: adulterar precisa falhar, não
    // devolver lixo que o resto do código trataria como token.
    expect(() => decifrar(adulterado)).toThrow();
  });

  it('falha quando a tag de autenticação é adulterada', () => {
    const partes = cifrar('token').split('.');
    const tag = Buffer.from(partes[2]!, 'base64url');
    tag[0] = tag[0]! ^ 0xff;
    expect(() =>
      decifrar([partes[0], partes[1], tag.toString('base64url'), partes[3]].join('.')),
    ).toThrow();
  });

  it('recusa formato desconhecido', () => {
    expect(() => decifrar('texto-cru')).toThrow(/formato desconhecido/);
    expect(() => decifrar('v2.a.b.c')).toThrow(/formato desconhecido/);
  });

  it('recusa cifrar vazio', () => {
    expect(() => cifrar('')).toThrow();
  });

  it('exige chave de 32 bytes', () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    expect(() => cifrar('x')).toThrow(/32 bytes/);
  });

  it('exige que a chave exista', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(temChaveDeCifragem()).toBe(false);
    expect(() => cifrar('x')).toThrow(/ENCRYPTION_KEY não está definida/);
  });
});

describe('comparação em tempo constante', () => {
  it('compara corretamente', () => {
    expect(segredosIguais('abc', 'abc')).toBe(true);
    expect(segredosIguais('abc', 'abd')).toBe(false);
    expect(segredosIguais('abc', 'abcd')).toBe(false);
    expect(segredosIguais('', '')).toBe(true);
  });
});
