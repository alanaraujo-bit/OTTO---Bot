import { logger } from '@otto/shared';

import { ErroProvedor, type Provedor } from './provedor.ts';
import { ProvedorOpenAI } from './provedores/openai.ts';
import { ProvedorSimulado } from './provedores/simulado.ts';

/**
 * Roteamento de modelo.
 *
 * Decide **qual modelo para qual tarefa**, e o critério é econômico: classificar
 * intenção e resumir conversa não precisam do mesmo motor que conversar com um
 * cliente. Um produto que usa o modelo mais caro para tudo não fecha a conta
 * quando escala para centenas de empresas.
 *
 * Também é aqui que a ausência de chave deixa de ser um bloqueio: sem
 * `OPENAI_API_KEY`, tudo cai no provedor determinístico, que se identifica como
 * tal em toda linha registrada.
 */

export type Tarefa =
  | 'responder'
  | 'classificar_intencao'
  | 'resumir'
  | 'avaliar'
  | 'sugerir'
  | 'embutir';

interface Escolha {
  modelo: string;
  temperatura: number;
  maxTokens: number;
}

/**
 * Modelo por tarefa.
 *
 * `responder` fala com o cliente e ganha o modelo melhor. Temperatura em 0,4:
 * alta o bastante para não soar decorado, baixa o bastante para não improvisar
 * sobre fato. As tarefas internas usam o modelo barato em temperatura zero,
 * porque classificação precisa ser reproduzível.
 */
const PLANO: Record<Tarefa, Escolha> = {
  responder: { modelo: 'gpt-4.1-mini', temperatura: 0.4, maxTokens: 400 },
  classificar_intencao: { modelo: 'gpt-4.1-nano', temperatura: 0, maxTokens: 60 },
  resumir: { modelo: 'gpt-4.1-nano', temperatura: 0.2, maxTokens: 200 },
  avaliar: { modelo: 'gpt-4.1-nano', temperatura: 0, maxTokens: 120 },
  sugerir: { modelo: 'gpt-4.1-mini', temperatura: 0.3, maxTokens: 500 },
  embutir: { modelo: 'text-embedding-3-small', temperatura: 0, maxTokens: 0 },
};

export interface Rota {
  provedor: Provedor;
  modelo: string;
  temperatura: number;
  maxTokens: number;
}

let provedorPrincipal: Provedor | null = null;
let avisouSemChave = false;

function principal(): Provedor {
  if (provedorPrincipal) return provedorPrincipal;

  const chave = process.env.OPENAI_API_KEY?.trim();

  if (chave) {
    provedorPrincipal = new ProvedorOpenAI(chave);
  } else {
    if (!avisouSemChave) {
      logger.warn(
        'OPENAI_API_KEY ausente: usando o provedor determinístico. ' +
          'As respostas vêm do conhecimento recuperado e ficam marcadas como simuladas.',
      );
      avisouSemChave = true;
    }
    provedorPrincipal = new ProvedorSimulado();
  }

  return provedorPrincipal;
}

export function rotaPara(tarefa: Tarefa): Rota {
  const escolha = PLANO[tarefa];
  return { provedor: principal(), ...escolha };
}

/** Usado em teste para fixar o provedor sem depender do ambiente. */
export function definirProvedor(provedor: Provedor | null): void {
  provedorPrincipal = provedor;
}

export function usandoProvedorReal(): boolean {
  return principal().nome !== 'simulado';
}

/**
 * Executa com nova tentativa e recuo exponencial.
 *
 * Só repete o que o fornecedor disse ser recuperável: repetir um 400 gasta tempo
 * do cliente que está esperando e nunca vai dar certo. O teto de duas tentativas
 * extras é deliberado — depois disso, transferir para um humano atende melhor do
 * que insistir.
 */
export async function comNovaTentativa<T>(
  operacao: () => Promise<T>,
  aoFalhar?: (tentativa: number, erro: ErroProvedor) => void,
): Promise<{ resultado: T; tentativas: number }> {
  const MAXIMO = 3;
  let ultimo: unknown;

  for (let tentativa = 1; tentativa <= MAXIMO; tentativa++) {
    try {
      return { resultado: await operacao(), tentativas: tentativa };
    } catch (erro) {
      ultimo = erro;

      const recuperavel = erro instanceof ErroProvedor && erro.detalhes.recuperavel;
      if (!recuperavel || tentativa === MAXIMO) break;

      aoFalhar?.(tentativa, erro as ErroProvedor);

      const sugerido = (erro as ErroProvedor).detalhes.esperarSegundos;
      // Respeita o `retry-after` do fornecedor quando ele existe: ele sabe
      // melhor que nós quando a janela reabre.
      const esperaMs = sugerido ? sugerido * 1000 : 2 ** (tentativa - 1) * 500;
      await new Promise((r) => setTimeout(r, Math.min(esperaMs, 8000)));
    }
  }

  throw ultimo;
}
