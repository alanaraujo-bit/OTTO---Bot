import type { ContextoEmpresa } from './personalidade.ts';
import type { TrechoRecuperado } from '../knowledge/recuperacao.ts';

/**
 * De onde pode vir o fundamento de uma resposta.
 *
 * A Base de Conhecimento não é a única fonte legítima. Horário, endereço e
 * telefone vivem em colunas — não em texto em prosa — porque "que horas abre?" e
 * "manda a localização" precisam de resposta exata, e o horário muda por dia da
 * semana e por feriado.
 *
 * Sem reconhecer esse fundamento estruturado, as perguntas **mais comuns** de um
 * supermercado — horário, domingo, feriado, endereço, telefone — iam todas para
 * atendimento humano, mesmo com a informação cadastrada e correta. Era o produto
 * recusando responder o que sabe.
 */

export type OrigemFundamento =
  | 'conhecimento'
  | 'unidades'
  | 'ambos'
  /**
   * O que a equipe disse **nesta conversa**.
   *
   * A autoridade mais fraca das que autorizam resposta, e de propósito: vale
   * para este cliente, agora, e não é política da empresa. Só entra quando as
   * fontes oficiais não têm nada — ver `avaliarFundamento`.
   */
  | 'operador'
  | 'nenhum';

/**
 * Termos que indicam pergunta sobre dados estruturados da unidade.
 *
 * Deliberadamente uma lista, e não uma classificação por modelo: é barato,
 * previsível, auditável, e erra para o lado seguro — um falso positivo apenas
 * inclui o contexto da unidade, que já iria no prompt de qualquer forma.
 */
const TERMOS_DE_UNIDADE =
  /\b(hor[áa]ri|que horas|abre|abrem|fecha|fecham|aberto|fechad|funciona|atende|domingo|s[áa]bado|feriad|endere[çc]|onde (fica|ficam|é|e|está)|localiza|local|mapa|chegar|telefone|contato|falar|ligar|whats|unidade|loja|filial|bairro|rua|avenida)/i;

export function perguntaSobreUnidade(texto: string): boolean {
  return TERMOS_DE_UNIDADE.test(texto);
}

/**
 * Se o contexto da empresa responde a pergunta.
 *
 * Exige que a pergunta seja sobre unidade **e** que exista dado cadastrado — uma
 * empresa sem unidade nenhuma não pode informar horário, e nesse caso o caminho
 * correto continua sendo o humano.
 */
export function unidadesRespondem(
  pergunta: string,
  empresa: ContextoEmpresa,
): boolean {
  if (!perguntaSobreUnidade(pergunta)) return false;
  if (empresa.unidades.length === 0) return false;

  // Ao menos uma unidade precisa ter algo concreto a dizer.
  return empresa.unidades.some(
    (u) => u.horarioHoje !== null || u.endereco !== null || u.telefone !== null,
  );
}

/**
 * Decide a origem do fundamento.
 *
 * Devolver a origem, e não apenas um booleano, tem consequência prática: ela vai
 * para `ai_runs` e permite responder depois "essa resposta veio da base ou do
 * cadastro da unidade?" — que é a pergunta que se faz quando um cliente reclama
 * de informação errada.
 */
export function avaliarFundamento(
  pergunta: string,
  trechos: TrechoRecuperado[],
  empresa: ContextoEmpresa,
  daBase: boolean,
  doOperador = false,
): OrigemFundamento {
  const dasUnidades = unidadesRespondem(pergunta, empresa);

  // A hierarquia de autoridade, escrita como ordem de avaliação. Fonte oficial
  // primeiro; a fala da equipe só é consultada quando o cadastro e a base não
  // têm nada a dizer.
  //
  // A ordem importa num caso concreto: se o horário está cadastrado e um
  // operador digitou outro por engano, quem vale é o cadastro. O contrário
  // deixaria um erro de digitação sobrescrever o dado curado da empresa.
  if (daBase && dasUnidades) return 'ambos';
  if (daBase) return 'conhecimento';
  if (dasUnidades) return 'unidades';
  if (doOperador) return 'operador';
  return 'nenhum';
}
