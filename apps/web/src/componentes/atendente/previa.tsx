import { cn } from '@otto/ui';

import type { Personalidade } from '@otto/core/ai';

/**
 * Prévia do jeito de conversar.
 *
 * Os controles são abstratos — "acolhimento", "tamanho da resposta". Esta prévia
 * torna concreto: mostra como a Bia responderia a uma pergunta comum com os
 * ajustes atuais. Não é o modelo de verdade rodando (isso custaria a cada
 * tecla); é uma amostra montada a partir dos mesmos controles, para dar a
 * sensação antes de publicar.
 */

const PERGUNTAS = [
  { cliente: 'oi, que horas vocês abrem hoje?', assunto: 'horario' },
  { cliente: 'vocês entregam no meu bairro?', assunto: 'entrega' },
] as const;

function nivel(valor: number): 0 | 1 | 2 {
  return valor <= 33 ? 0 : valor <= 66 ? 1 : 2;
}

function saudacao(nome: string, calor: 0 | 1 | 2, formalidade: 0 | 1 | 2): string {
  if (formalidade === 2) return calor >= 1 ? 'Olá! Tudo bem? ' : 'Olá. ';
  if (calor === 2) return 'Oi! Que bom falar com você. ';
  if (calor === 1) return 'Oi, tudo bem? ';
  return 'Oi! ';
}

function corpo(assunto: string, detalhe: 0 | 1 | 2): string {
  if (assunto === 'horario') {
    if (detalhe === 0) return 'A loja do Centro abre das 7h às 21h hoje.';
    if (detalhe === 1)
      return 'Hoje a Unidade Centro abre das 7h às 21h. A do Bairro Novo abre das 8h às 20h.';
    return 'Hoje a Unidade Centro funciona das 7h às 21h e a Unidade Bairro Novo das 8h às 20h. Nos domingos o horário é reduzido — se precisar, me diz qual unidade que eu confirmo certinho.';
  }
  if (detalhe === 0) return 'Entregamos sim, para compras acima de R$ 80 num raio de 5 km. A taxa é R$ 8,00.';
  if (detalhe === 1)
    return 'Fazemos entrega para compras acima de R$ 80, num raio de 5 km de cada unidade. A taxa é R$ 8,00 e a entrega sai no mesmo dia para pedidos até as 16h.';
  return 'Fazemos entrega sim! Para pedidos acima de R$ 80, dentro de um raio de 5 km da unidade mais próxima. A taxa é de R$ 8,00 e, para pedidos feitos até as 16h, a entrega acontece no mesmo dia. Se me passar seu bairro eu confirmo se está na área de cobertura.';
}

function fecho(calor: 0 | 1 | 2, assunto: string): string {
  if (calor === 2) return assunto === 'entrega' ? ' Qualquer coisa, é só chamar! 🙌' : ' Precisando de mais alguma coisa, estou por aqui.';
  if (calor === 1) return ' Posso ajudar em mais alguma coisa?';
  return '';
}

function comEmojis(texto: string, emojis: Personalidade['emojis'], assunto: string): string {
  if (emojis === 'nunca') return texto.replace(/\s*[\p{Emoji_Presentation}\u{1F300}-\u{1FAFF}]/gu, '');
  if (emojis === 'a_vontade') {
    return assunto === 'horario' ? texto.replace(/hoje\./, 'hoje. 😊') : texto;
  }
  // 'raramente' — tira o excesso, deixa no máximo um.
  const partes = texto.split(/(\p{Emoji_Presentation}|\u{1F64C})/gu);
  let usados = 0;
  return partes
    .map((p) => (/(\p{Emoji_Presentation}|\u{1F64C})/u.test(p) ? (usados++ === 0 ? p : '') : p))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function montarResposta(valores: Personalidade, indice: number): { cliente: string; bia: string } {
  const p = PERGUNTAS[indice % PERGUNTAS.length]!;
  const f = nivel(valores.formalidade);
  const c = nivel(valores.calor);
  const d = nivel(valores.detalhamento);

  // Só a primeira amostra cumprimenta — a segunda é "meio de conversa".
  const abertura = indice === 0 ? saudacao(valores.nome, c, f) : '';
  let bia = abertura + corpo(p.assunto, d) + fecho(c, p.assunto);
  bia = comEmojis(bia, valores.emojis, p.assunto);

  return { cliente: p.cliente, bia };
}

export function Previa({ valores }: { valores: Personalidade }) {
  return (
    <div className="grid gap-4">
      {PERGUNTAS.map((_, i) => {
        const { cliente, bia } = montarResposta(valores, i);
        return (
          <div key={i} className="grid gap-1.5">
            <Bolha lado="cliente">{cliente}</Bolha>
            <Bolha lado="bia">{bia}</Bolha>
          </div>
        );
      })}
      <p className="text-2xs text-texto-3">
        Amostra aproximada. A resposta real usa sempre o que está no Conhecimento.
      </p>
    </div>
  );
}

function Bolha({ lado, children }: { lado: 'cliente' | 'bia'; children: React.ReactNode }) {
  const doCliente = lado === 'cliente';
  return (
    <div className={cn('flex', doCliente ? 'justify-start' : 'justify-end')}>
      <p
        className={cn(
          'max-w-[85%] rounded-md px-3 py-2 text-sm leading-relaxed',
          doCliente
            ? 'rounded-tl-xs bg-superficie-2 text-texto'
            : 'rounded-tr-xs bg-marca text-marca-contraste',
        )}
      >
        {children}
      </p>
    </div>
  );
}
