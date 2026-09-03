import {
  aiRuns,
  and,
  auditLog,
  channels,
  conversations,
  desc,
  eq,
  getPlatformDb,
  gte,
  memberships,
  messages,
  sql,
  tenants,
  users,
} from '@otto/db';
import { childLogger, conflito, dias } from '@otto/shared';

import type { PapelPlataforma } from '../auth/permissoes.ts';

/**
 * Backoffice do SaaS.
 *
 * Este módulo é o **único** lugar do produto que usa `getPlatformDb()` — a
 * conexão com `BYPASSRLS`, que enxerga todas as empresas. Mantê-lo isolado é o
 * que impede um erro no console de alcançar dados de outro cliente.
 *
 * Regras que valem para tudo aqui:
 *  · toda função exige papel de plataforma, verificado por quem chama;
 *  · toda ação que altera estado grava auditoria com o autor;
 *  · nada aqui é acessível pelas rotas do console.
 */

/**
 * Referência qualificada à empresa, para subconsultas correlacionadas.
 *
 * O Drizzle renderiza `${tenants.id}` como `"id"`, sem qualificar a tabela.
 * Dentro de uma subconsulta com o seu próprio `from`, esse `"id"` não resolve
 * para a empresa da linha externa — a correlação simplesmente não acontece, a
 * contagem volta zero, e na tela isso parece apenas "ainda não há dados".
 *
 * Foi assim que a listagem de empresas mostrou 0 conversas e 0 canais para uma
 * empresa com 43 conversas e um canal conectado.
 */
const EMPRESA_ID = sql.raw('"tenants"."id"');

export function ehPlataforma(papel: PapelPlataforma | null): papel is PapelPlataforma {
  return papel === 'fundador' || papel === 'suporte';
}

export interface EmpresaNaPlataforma {
  id: string;
  slug: string;
  nome: string;
  status: string;
  motivoStatus: string | null;
  criadaEm: Date;
  usuarios: number;
  canais: number;
  canaisConectados: number;
  conversas7dias: number;
  mensagens7dias: number;
  custo7diasMicroUsd: number;
  /** Última mensagem recebida. Silêncio prolongado indica canal quebrado. */
  ultimaAtividade: string | null;
}

export async function listarEmpresas(): Promise<EmpresaNaPlataforma[]> {
  const seteDias = new Date(Date.now() - dias(7));

  const linhas = await getPlatformDb()
    .select({
      id: tenants.id,
      slug: tenants.slug,
      nome: tenants.displayName,
      status: tenants.status,
      motivoStatus: tenants.statusReason,
      criadaEm: tenants.createdAt,
      usuarios: sql<number>`(
        select count(*)::int from memberships m
        where m.tenant_id = ${EMPRESA_ID} and m.is_active
      )`,
      canais: sql<number>`(
        select count(*)::int from channels c where c.tenant_id = ${EMPRESA_ID}
      )`,
      canaisConectados: sql<number>`(
        select count(*)::int from channels c
        where c.tenant_id = ${EMPRESA_ID} and c.status = 'conectado'
      )`,
      conversas7dias: sql<number>`(
        select count(*)::int from conversations cv
        where cv.tenant_id = ${EMPRESA_ID} and cv.created_at >= ${seteDias}
      )`,
      mensagens7dias: sql<number>`(
        select count(*)::int from messages m
        where m.tenant_id = ${EMPRESA_ID} and m.created_at >= ${seteDias}
      )`,
      custo7diasMicroUsd: sql<number>`(
        select coalesce(sum(r.cost_micro_usd), 0)::bigint from ai_runs r
        where r.tenant_id = ${EMPRESA_ID} and r.created_at >= ${seteDias}
      )`,
      ultimaAtividade: sql<string | null>`(
        select max(m.created_at)::text from messages m where m.tenant_id = ${EMPRESA_ID}
      )`,
    })
    .from(tenants)
    .where(sql`${tenants.deletedAt} is null`)
    .orderBy(desc(tenants.createdAt));

  return linhas.map((l) => ({ ...l, custo7diasMicroUsd: Number(l.custo7diasMicroUsd) }));
}

export interface SaudeDaPlataforma {
  empresasAtivas: number;
  empresasSuspensas: number;
  conversasHoje: number;
  mensagensHoje: number;
  custoHojeMicroUsd: number;
  /** Mensagens paradas em `pendente` há mais de 5 minutos: envio travado. */
  enviosPresos: number;
  /** Mensagens que falharam nas últimas 24 h. */
  enviosFalhos: number;
  /** Execuções de IA com erro nas últimas 24 h. */
  errosDeIa: number;
  /** Canais que deveriam estar conectados e não estão. */
  canaisComProblema: number;
}

/**
 * Saúde da operação.
 *
 * Cada número aqui é um alarme, não uma estatística: se algum estiver acima de
 * zero, alguém precisa olhar. É a diferença entre um painel de status e um
 * painel de vaidade.
 */
export async function saudeDaPlataforma(): Promise<SaudeDaPlataforma> {
  const db = getPlatformDb();
  const umDia = new Date(Date.now() - dias(1));
  const cincoMinutos = new Date(Date.now() - 5 * 60_000);

  const [empresas] = await db
    .select({
      ativas: sql<number>`count(*) filter (where ${tenants.status} = 'ativo')::int`,
      suspensas: sql<number>`count(*) filter (where ${tenants.status} = 'suspenso')::int`,
    })
    .from(tenants)
    .where(sql`${tenants.deletedAt} is null`);

  const [msgs] = await db
    .select({
      hoje: sql<number>`count(*) filter (where ${messages.createdAt} >= ${umDia})::int`,
      presos: sql<number>`count(*) filter (
        where ${messages.status} = 'pendente' and ${messages.createdAt} < ${cincoMinutos}
      )::int`,
      falhos: sql<number>`count(*) filter (
        where ${messages.status} = 'falhou' and ${messages.createdAt} >= ${umDia}
      )::int`,
    })
    .from(messages);

  const [conversasHoje] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(gte(conversations.createdAt, umDia));

  const [ia] = await db
    .select({
      custo: sql<number>`coalesce(sum(${aiRuns.costMicroUsd}), 0)::bigint`,
      erros: sql<number>`count(*) filter (where ${aiRuns.outcome} = 'erro')::int`,
    })
    .from(aiRuns)
    .where(gte(aiRuns.createdAt, umDia));

  const [canais] = await db
    .select({
      problema: sql<number>`count(*) filter (
        where ${channels.status} in ('degradado','desconectado')
      )::int`,
    })
    .from(channels);

  return {
    empresasAtivas: empresas?.ativas ?? 0,
    empresasSuspensas: empresas?.suspensas ?? 0,
    conversasHoje: conversasHoje?.n ?? 0,
    mensagensHoje: msgs?.hoje ?? 0,
    custoHojeMicroUsd: Number(ia?.custo ?? 0),
    enviosPresos: msgs?.presos ?? 0,
    enviosFalhos: msgs?.falhos ?? 0,
    errosDeIa: ia?.erros ?? 0,
    canaisComProblema: canais?.problema ?? 0,
  };
}

/**
 * Suspender uma empresa.
 *
 * Suspensão é **somente leitura**, não bloqueio: o histórico continua acessível
 * a quem trabalha lá, e nada novo é escrito. Cortar o acesso inteiro por uma
 * pendência comercial puniria o atendente, que não decide nada sobre pagamento.
 */
export async function suspenderEmpresa(
  autorId: string,
  autorNome: string,
  tenantId: string,
  motivo: string,
): Promise<void> {
  if (!motivo.trim()) throw conflito('Informe o motivo da suspensão.');

  const db = getPlatformDb();

  await db
    .update(tenants)
    .set({ status: 'suspenso', statusReason: motivo.trim() })
    .where(eq(tenants.id, tenantId));

  await db.insert(auditLog).values({
    targetTenantId: tenantId,
    actorType: 'plataforma',
    actorUserId: autorId,
    actorLabel: autorNome,
    action: 'empresa.suspensa',
    targetType: 'tenant',
    targetId: tenantId,
    metadata: { motivo: motivo.trim() },
  });

  childLogger({ userId: autorId, tenantId }).warn({ motivo }, 'empresa suspensa');
}

export async function reativarEmpresa(
  autorId: string,
  autorNome: string,
  tenantId: string,
): Promise<void> {
  const db = getPlatformDb();

  await db
    .update(tenants)
    .set({ status: 'ativo', statusReason: null })
    .where(eq(tenants.id, tenantId));

  await db.insert(auditLog).values({
    targetTenantId: tenantId,
    actorType: 'plataforma',
    actorUserId: autorId,
    actorLabel: autorNome,
    action: 'empresa.reativada',
    targetType: 'tenant',
    targetId: tenantId,
  });

  childLogger({ userId: autorId, tenantId }).info('empresa reativada');
}

export interface EventoDeAuditoria {
  id: string;
  acao: string;
  autor: string | null;
  tipoAutor: string;
  empresa: string | null;
  alvo: string | null;
  quando: Date;
  detalhes: unknown;
}

export async function auditoriaRecente(limite = 100): Promise<EventoDeAuditoria[]> {
  return getPlatformDb()
    .select({
      id: auditLog.id,
      acao: auditLog.action,
      autor: auditLog.actorLabel,
      tipoAutor: auditLog.actorType,
      empresa: tenants.displayName,
      alvo: auditLog.targetLabel,
      quando: auditLog.createdAt,
      detalhes: auditLog.metadata,
    })
    .from(auditLog)
    .leftJoin(
      tenants,
      sql`${EMPRESA_ID} = coalesce(${auditLog.tenantId}, ${auditLog.targetTenantId})`,
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limite);
}

/**
 * Diagnóstico de uma mensagem.
 *
 * A resposta à pergunta do §33 da missão — "por que essa mensagem não foi
 * enviada?" — em uma consulta só, sem procurar em cinco lugares.
 */
export interface DiagnosticoMensagem {
  id: string;
  empresa: string;
  criadaEm: Date;
  direcao: string;
  autor: string;
  status: string;
  corpo: string | null;
  motivoFalha: string | null;
  enviadaEm: Date | null;
  canal: string;
  canalStatus: string;
  /** Execução de IA que gerou a mensagem, quando houve. */
  execucao: {
    modelo: string;
    provedor: string;
    desfecho: string;
    confianca: number | null;
    custoMicroUsd: number;
    latenciaMs: number | null;
    tentativas: number;
    erro: string | null;
  } | null;
}

export async function diagnosticarMensagem(
  messageId: string,
): Promise<DiagnosticoMensagem | null> {
  const [linha] = await getPlatformDb()
    .select({
      id: messages.id,
      empresa: tenants.displayName,
      criadaEm: messages.createdAt,
      direcao: messages.direction,
      autor: messages.author,
      status: messages.status,
      corpo: messages.body,
      motivoFalha: messages.failureReason,
      enviadaEm: messages.sentAt,
      canal: channels.kind,
      canalStatus: channels.status,
      runId: messages.aiRunId,
      modelo: aiRuns.model,
      provedor: aiRuns.provider,
      desfecho: aiRuns.outcome,
      confianca: aiRuns.confidence,
      custo: aiRuns.costMicroUsd,
      latencia: aiRuns.latencyMs,
      tentativas: aiRuns.attempts,
      erroIa: aiRuns.error,
    })
    .from(messages)
    .innerJoin(tenants, eq(tenants.id, messages.tenantId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .leftJoin(aiRuns, eq(aiRuns.id, messages.aiRunId))
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!linha) return null;

  return {
    id: linha.id,
    empresa: linha.empresa,
    criadaEm: linha.criadaEm,
    direcao: linha.direcao,
    autor: linha.autor,
    status: linha.status,
    corpo: linha.corpo,
    motivoFalha: linha.motivoFalha,
    enviadaEm: linha.enviadaEm,
    canal: linha.canal,
    canalStatus: linha.canalStatus,
    execucao: linha.runId
      ? {
          modelo: linha.modelo ?? '—',
          provedor: linha.provedor ?? '—',
          desfecho: linha.desfecho ?? '—',
          confianca: linha.confianca,
          custoMicroUsd: Number(linha.custo ?? 0),
          latenciaMs: linha.latencia,
          tentativas: linha.tentativas ?? 1,
          erro: linha.erroIa,
        }
      : null,
  };
}
