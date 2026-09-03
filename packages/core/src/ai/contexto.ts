import {
  and,
  asc,
  desc,
  eq,
  locationExceptions,
  locationHours,
  messages,
  tenantLocations,
  tenants,
  withTenant,
} from '@otto/db';
import { minutosParaHora, partesLocais } from '@otto/shared';

import type { ContextoEmpresa } from './personalidade.ts';
import type { MensagemChat } from './provedor.ts';
import type { TrechoRecuperado } from '../knowledge/recuperacao.ts';

/**
 * Montagem de contexto.
 *
 * A plataforma compreende **conversas**, não mensagens soltas: "manda a
 * localização" logo depois de "vocês abrem amanhã?" precisa ser entendido.
 *
 * Mas mandar o histórico inteiro a cada mensagem é caro e piora a resposta —
 * contexto longo dilui o que importa. Então: as últimas trocas na íntegra, e um
 * resumo do que veio antes. Também é exigência de privacidade (§37): não enviar
 * ao modelo mais dado pessoal do que a tarefa precisa.
 */

/** Trocas recentes enviadas na íntegra. Cobre a referência a "isso", "lá", "ele". */
const JANELA = 8;

export async function historicoDaConversa(
  tenantId: string,
  conversationId: string,
): Promise<{ mensagens: MensagemChat[]; resumoAnterior: string | null }> {
  return withTenant(tenantId, async (tx) => {
    const recentes = await tx
      .select({
        autor: messages.author,
        corpo: messages.body,
        tipo: messages.contentType,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(JANELA);

    const emOrdem = recentes.reverse();

    const mensagens: MensagemChat[] = emOrdem.map((m) => ({
      papel: m.autor === 'cliente' ? ('usuario' as const) : ('assistente' as const),
      // Mídia sem transcrição vira descrição: o modelo precisa saber que algo
      // chegou, mesmo sem conseguir ver.
      conteudo: m.corpo ?? descreverSemTexto(m.tipo),
    }));

    return { mensagens, resumoAnterior: null };
  });
}

function descreverSemTexto(tipo: string): string {
  const mapa: Record<string, string> = {
    imagem: '[o cliente enviou uma imagem]',
    audio: '[o cliente enviou um áudio]',
    video: '[o cliente enviou um vídeo]',
    documento: '[o cliente enviou um documento]',
    localizacao: '[o cliente enviou uma localização]',
    contato: '[o cliente enviou um contato]',
    figurinha: '[o cliente enviou uma figurinha]',
  };
  return mapa[tipo] ?? '[mensagem sem texto]';
}

/**
 * Fatos estruturados da empresa.
 *
 * Endereço e horário saem de colunas, não de texto em prosa: "que horas abre?" e
 * "manda a localização" precisam de resposta exata, e o horário muda por dia da
 * semana e por feriado. Deixar isso na base de conhecimento em texto livre daria
 * respostas erradas em toda quarta-feira de feriado.
 */
export async function contextoDaEmpresa(tenantId: string): Promise<ContextoEmpresa> {
  return withTenant(tenantId, async (tx) => {
    const [empresa] = await tx
      .select({ nome: tenants.displayName, fuso: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const fuso = empresa?.fuso ?? 'America/Sao_Paulo';
    const agora = partesLocais(new Date(), fuso);

    const unidades = await tx
      .select({
        id: tenantLocations.id,
        nome: tenantLocations.name,
        rua: tenantLocations.street,
        numero: tenantLocations.number,
        bairro: tenantLocations.district,
        cidade: tenantLocations.city,
        uf: tenantLocations.state,
        telefone: tenantLocations.phone,
        principal: tenantLocations.isPrimary,
      })
      .from(tenantLocations)
      .where(and(eq(tenantLocations.tenantId, tenantId), eq(tenantLocations.isActive, true)))
      .orderBy(desc(tenantLocations.isPrimary), asc(tenantLocations.name));

    const horarios = await tx
      .select({
        locationId: locationHours.locationId,
        dia: locationHours.weekday,
        abre: locationHours.opensAt,
        fecha: locationHours.closesAt,
      })
      .from(locationHours)
      .where(and(eq(locationHours.tenantId, tenantId), eq(locationHours.weekday, agora.diaDaSemana)));

    // Exceção de calendário sobrepõe o horário regular naquele dia.
    const excecoes = await tx
      .select({
        locationId: locationExceptions.locationId,
        fechado: locationExceptions.closed,
        abre: locationExceptions.opensAt,
        fecha: locationExceptions.closesAt,
        motivo: locationExceptions.reason,
      })
      .from(locationExceptions)
      .where(
        and(
          eq(locationExceptions.tenantId, tenantId),
          eq(locationExceptions.date, agora.dataISO),
        ),
      );

    const detalhadas = unidades.map((u) => {
      const excecao = excecoes.find((e) => e.locationId === u.id);
      const faixas = horarios.filter((h) => h.locationId === u.id);

      let horarioHoje: string | null = null;
      let abertoAgora: boolean | null = null;

      if (excecao) {
        if (excecao.fechado) {
          horarioHoje = excecao.motivo ? `fechada (${excecao.motivo})` : 'fechada';
          abertoAgora = false;
        } else if (excecao.abre !== null && excecao.fecha !== null) {
          horarioHoje = `${minutosParaHora(excecao.abre)} às ${minutosParaHora(excecao.fecha)}${
            excecao.motivo ? ` (${excecao.motivo})` : ''
          }`;
          abertoAgora =
            agora.minutosDoDia >= excecao.abre && agora.minutosDoDia < excecao.fecha;
        }
      } else if (faixas.length > 0) {
        horarioHoje = faixas
          .map((f) => `${minutosParaHora(f.abre)} às ${minutosParaHora(f.fecha)}`)
          .join(' e ');
        abertoAgora = faixas.some(
          (f) => agora.minutosDoDia >= f.abre && agora.minutosDoDia < f.fecha,
        );
      } else {
        horarioHoje = 'não abre hoje';
        abertoAgora = false;
      }

      const endereco =
        [
          u.rua && u.numero ? `${u.rua}, ${u.numero}` : u.rua,
          u.bairro,
          u.cidade && u.uf ? `${u.cidade}/${u.uf}` : u.cidade,
        ]
          .filter(Boolean)
          .join(' — ') || null;

      return {
        nome: u.nome,
        endereco,
        telefone: u.telefone,
        horarioHoje,
        abertoAgora,
      };
    });

    return {
      nome: empresa?.nome ?? 'a empresa',
      unidades: detalhadas,
      // Só é "fora de horário" se nenhuma unidade estiver aberta.
      foraDeHorario:
        detalhadas.length > 0 && detalhadas.every((u) => u.abertoAgora === false),
    };
  });
}

/**
 * Formata o conhecimento recuperado.
 *
 * O marcador `CONHECIMENTO` é o que a instrução referencia como única fonte de
 * fato, e o que o provedor determinístico procura para derivar a resposta.
 */
export function blocoDeConhecimento(trechos: TrechoRecuperado[]): string {
  if (trechos.length === 0) {
    return (
      'CONHECIMENTO\n' +
      'Nada foi encontrado na base sobre esta pergunta. ' +
      'Você não sabe a resposta — diga isso com naturalidade e ofereça chamar a equipe.'
    );
  }

  const corpo = trechos.map((t) => t.conteudo.trim()).join('\n---\n');
  return `CONHECIMENTO\nInformação oficial da empresa. Responda apenas com base nisto.\n---\n${corpo}`;
}
