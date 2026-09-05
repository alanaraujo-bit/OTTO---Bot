/**
 * Mensagens que não pedem informação nenhuma.
 *
 * ## Por que isto existe
 *
 * Um cliente escreveu **"Boa tarde"** e recebeu de volta: *"Essa informação eu
 * não tenho confirmada aqui. Vou chamar alguém da equipe para te ajudar."* A
 * conversa foi para a fila de atendimento humano por causa de um cumprimento.
 *
 * A causa é estrutural: toda mensagem que entra passa pela barreira de
 * fundamento. Um cumprimento não tem fundamento porque **não pergunta nada** —
 * então cai em `sem_fundamento`, dispara o aviso de encaminhamento e ocupa uma
 * pessoa. A barreira existe para impedir que a Bia invente fato; aplicá-la a
 * mensagens que não pedem fato transforma proteção em defeito.
 *
 * ## Por que a resposta é determinística
 *
 * Não chama modelo. Um cumprimento não tem o que gerar: qualquer texto que o
 * modelo produzisse aqui teria risco de afirmar algo, e não haveria fundamento
 * para conferir. Uma resposta fixa é indistinguível de gerada neste caso, custa
 * zero, responde em milissegundos e **não pode** alucinar — que é a mesma
 * disciplina do resto do produto: a regra é código, não instrução de prompt.
 *
 * ## O que isto não faz
 *
 * Não tenta interpretar intenção. Só reconhece mensagens que são **inteiramente**
 * cortesia. "Boa tarde, quanto custa o arroz?" não é cortesia pura — tem
 * pergunta dentro, e segue o caminho normal com a barreira inteira.
 */

/**
 * Formas de dizer olá, obrigado e tchau.
 *
 * Escrito como lista e não como classificação por modelo pelo mesmo motivo dos
 * `TERMOS_DE_UNIDADE`: é barato, previsível, auditável, e erra para o lado
 * seguro — um falso negativo apenas manda a mensagem pelo caminho normal.
 */
const CORTESIAS = [
  'oi', 'ola', 'oie', 'opa', 'eai', 'e ai', 'fala', 'alo',
  'bom dia', 'boa tarde', 'boa noite', 'boa',
  'tudo bem', 'tudo bom', 'como vai', 'como voce esta', 'beleza', 'blz',
  'obrigado', 'obrigada', 'obg', 'valeu', 'vlw', 'agradecido', 'agradecida',
  'ok', 'okay', 'certo', 'entendi', 'entendido', 'show', 'otimo', 'otima',
  'legal', 'perfeito', 'maravilha', 'top', 'isso', 'sim', 'nao', 'uhum',
  'tchau', 'ate logo', 'ate mais', 'ate breve', 'boa semana', 'bom fim de semana',
  'por favor', 'pfv', 'desculpa', 'desculpe', 'com licenca', 'bom',
];

/** Ordena do mais longo para o mais curto: "boa tarde" antes de "boa". */
const ORDENADAS = [...CORTESIAS].sort((a, b) => b.length - a.length);

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // pontuação
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Se a mensagem é **só** cortesia.
 *
 * Consome as saudações conhecidas do texto normalizado; se não sobrar nada, não
 * havia pergunta ali. Um resto qualquer — "boa tarde, **vocês entregam**?" —
 * derruba a classificação e a mensagem segue pelo caminho normal.
 */
export function apenasCortesia(texto: string): boolean {
  let resto = normalizar(texto);
  if (!resto) return false;

  // Mensagem longa não é cumprimento, por mais que comece com um.
  if (resto.length > 60) return false;

  let mudou = true;
  while (mudou && resto) {
    mudou = false;
    for (const c of ORDENADAS) {
      // Só no começo do que sobrou, e sempre em limite de palavra: evita casar
      // "sim" dentro de "simulador" ou "boa" dentro de "boato".
      if (resto === c || resto.startsWith(`${c} `)) {
        resto = resto.slice(c.length).trim();
        mudou = true;
        break;
      }
    }
  }

  return resto.length === 0;
}

/**
 * A saudação de volta.
 *
 * O período do dia sai do fuso da empresa, não do servidor: responder "bom dia"
 * às nove da noite é o tipo de detalhe que denuncia um robô mal-feito, e o
 * relógio de Canaã dos Carajás não é o de UTC.
 */
export function saudacaoDoMomento(agora: Date, fuso: string): string {
  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: fuso,
      hour: 'numeric',
      hour12: false,
    }).format(agora),
  );

  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * Resposta a uma mensagem de pura cortesia.
 *
 * Cumprimento e agradecimento pedem coisas diferentes: um abre a conversa e
 * deve convidar a perguntar; o outro a fecha e não deve empurrar assunto novo.
 */
export function respostaDeCortesia(texto: string, agora: Date, fuso: string): string {
  const normalizado = normalizar(texto);
  const despedida = /^(tchau|ate |boa semana|bom fim de semana)/.test(normalizado);
  const agradecimento = /(obrigad|obg|valeu|vlw|agradecid)/.test(normalizado);

  if (despedida) return 'Até logo! Quando precisar, é só chamar. 😊';
  if (agradecimento) return 'Por nada! Se precisar de mais alguma coisa, é só falar. 😊';

  return `${saudacaoDoMomento(agora, fuso)}! Em que posso ajudar?`;
}
