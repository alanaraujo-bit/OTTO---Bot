import { agents, agentVersions, desc, eq, sql, users, withTenant } from '@otto/db';
import { childLogger, conflito } from '@otto/shared';

import {
  compilarInstrucao,
  esquemaPersonalidade,
  PERSONALIDADE_PADRAO,
  type Personalidade,
} from './personalidade.ts';
import { contextoDaEmpresa } from './contexto.ts';

/**
 * Configuração do atendente virtual.
 *
 * Duas coisas separadas de propósito: o **rascunho**, que a pessoa mexe à
 * vontade sem afetar ninguém, e a **versão publicada**, que é o que atende os
 * clientes. Salvar não muda comportamento; publicar muda.
 *
 * Toda publicação cria uma versão imutável com a instrução compilada guardada.
 * É o que permite responder "a qualidade caiu depois da mudança X?" — cada
 * execução do agente registra qual versão a produziu.
 */

export interface ConfiguracaoAgente {
  agenteId: string;
  /** O que está sendo editado. Igual à versão publicada quando não há rascunho. */
  rascunho: Personalidade;
  /** O que atende os clientes agora. `null` antes da primeira publicação. */
  publicada: Personalidade | null;
  versaoAtual: number;
  publicadaEm: Date | null;
  publicadaPor: string | null;
  temAlteracoesNaoPublicadas: boolean;
  historico: {
    id: string;
    versao: number;
    nota: string | null;
    autor: string | null;
    publicadaEm: Date;
    ativa: boolean;
  }[];
}

export async function lerConfiguracao(tenantId: string): Promise<ConfiguracaoAgente> {
  return withTenant(tenantId, async (tx) => {
    let [agente] = await tx
      .select({
        id: agents.id,
        nome: agents.displayName,
        versaoAtivaId: agents.activeVersionId,
        rascunho: agents.draftSettings,
      })
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .limit(1);

    // Empresa criada antes de o agente existir: cria na primeira leitura, em vez
    // de exigir uma etapa de configuração que ninguém pediu.
    if (!agente) {
      const [criado] = await tx
        .insert(agents)
        .values({ tenantId, displayName: 'Atendimento' })
        .returning({
          id: agents.id,
          nome: agents.displayName,
          versaoAtivaId: agents.activeVersionId,
          rascunho: agents.draftSettings,
        });
      agente = criado!;
    }

    let publicada: Personalidade | null = null;
    let versaoAtual = 0;
    let publicadaEm: Date | null = null;
    let publicadaPor: string | null = null;

    if (agente.versaoAtivaId) {
      const [versao] = await tx
        .select({
          settings: agentVersions.settings,
          numero: agentVersions.version,
          em: agentVersions.publishedAt,
          por: users.name,
        })
        .from(agentVersions)
        .leftJoin(users, eq(users.id, agentVersions.publishedBy))
        .where(eq(agentVersions.id, agente.versaoAtivaId))
        .limit(1);

      if (versao) {
        const analise = esquemaPersonalidade.safeParse(versao.settings);
        if (analise.success) publicada = analise.data;
        versaoAtual = versao.numero;
        publicadaEm = versao.em;
        publicadaPor = versao.por;
      }
    }

    const analiseRascunho = esquemaPersonalidade.safeParse(agente.rascunho ?? {});
    const rascunho = agente.rascunho && analiseRascunho.success
      ? analiseRascunho.data
      : (publicada ?? { ...PERSONALIDADE_PADRAO, nome: agente.nome });

    const historico = await tx
      .select({
        id: agentVersions.id,
        versao: agentVersions.version,
        nota: agentVersions.changeNote,
        autor: users.name,
        publicadaEm: agentVersions.publishedAt,
      })
      .from(agentVersions)
      .leftJoin(users, eq(users.id, agentVersions.publishedBy))
      .where(eq(agentVersions.agentId, agente.id))
      .orderBy(desc(agentVersions.version))
      .limit(20);

    return {
      agenteId: agente.id,
      rascunho,
      publicada,
      versaoAtual,
      publicadaEm,
      publicadaPor,
      temAlteracoesNaoPublicadas:
        publicada !== null && JSON.stringify(rascunho) !== JSON.stringify(publicada),
      historico: historico.map((h) => ({ ...h, ativa: h.id === agente.versaoAtivaId })),
    };
  });
}

/** Salva o rascunho. Não muda o que os clientes recebem. */
export async function salvarRascunho(
  tenantId: string,
  dados: unknown,
): Promise<Personalidade> {
  const analise = esquemaPersonalidade.safeParse(dados);
  if (!analise.success) {
    throw conflito(
      analise.error.issues[0]?.message ?? 'Confira os campos da configuração.',
    );
  }

  await withTenant(tenantId, (tx) =>
    tx
      .update(agents)
      .set({ draftSettings: analise.data, displayName: analise.data.nome })
      .where(eq(agents.tenantId, tenantId)),
  );

  return analise.data;
}

/**
 * Publicar.
 *
 * Compila a instrução e a guarda junto da versão. Guardar o texto compilado — e
 * não só os controles — é o que torna a auditoria útil: meses depois, dá para
 * ler exatamente o que o modelo recebeu, mesmo que o compilador tenha mudado.
 */
export async function publicarConfiguracao(
  tenantId: string,
  userId: string,
  nota?: string,
): Promise<number> {
  const empresa = await contextoDaEmpresa(tenantId);

  return withTenant(tenantId, async (tx) => {
    const [agente] = await tx
      .select({ id: agents.id, rascunho: agents.draftSettings })
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .limit(1);

    if (!agente) throw conflito('O atendente virtual ainda não foi configurado.');

    const analise = esquemaPersonalidade.safeParse(agente.rascunho ?? {});
    if (!analise.success) {
      throw conflito('A configuração tem campos inválidos. Revise antes de publicar.');
    }

    const [ultima] = await tx
      .select({ n: sql<number>`coalesce(max(${agentVersions.version}), 0)::int` })
      .from(agentVersions)
      .where(eq(agentVersions.agentId, agente.id));

    const novaVersao = (ultima?.n ?? 0) + 1;

    const [versao] = await tx
      .insert(agentVersions)
      .values({
        tenantId,
        agentId: agente.id,
        version: novaVersao,
        settings: analise.data,
        compiledInstruction: compilarInstrucao(analise.data, empresa),
        changeNote: nota?.trim() || null,
        publishedBy: userId,
      })
      .returning({ id: agentVersions.id });

    await tx
      .update(agents)
      .set({ activeVersionId: versao!.id, displayName: analise.data.nome })
      .where(eq(agents.id, agente.id));

    childLogger({ tenantId, userId }).info({ versao: novaVersao }, 'comportamento publicado');
    return novaVersao;
  });
}

/**
 * Voltar para uma versão anterior.
 *
 * Não cria versão nova nem apaga nada: apenas aponta a ativa de volta. Quando
 * algo dá errado depois de uma mudança, desfazer precisa ser imediato e óbvio.
 */
export async function reverterPara(
  tenantId: string,
  userId: string,
  versaoId: string,
): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const [versao] = await tx
      .select({
        id: agentVersions.id,
        numero: agentVersions.version,
        settings: agentVersions.settings,
        agentId: agentVersions.agentId,
      })
      .from(agentVersions)
      .where(eq(agentVersions.id, versaoId))
      .limit(1);

    if (!versao) throw conflito('Esta versão não existe.');

    await tx
      .update(agents)
      .set({ activeVersionId: versao.id, draftSettings: versao.settings })
      .where(eq(agents.id, versao.agentId));

    childLogger({ tenantId, userId }).info({ versao: versao.numero }, 'comportamento revertido');
    return versao.numero;
  });
}

/**
 * Prévia da instrução.
 *
 * O usuário comum não precisa ver isto, mas quem quiser entender exatamente o
 * que a IA recebe deve conseguir. Esconder produziria a sensação de caixa-preta
 * que o produto tenta evitar.
 */
export async function previaDaInstrucao(
  tenantId: string,
  personalidade: Personalidade,
): Promise<string> {
  const empresa = await contextoDaEmpresa(tenantId);
  return compilarInstrucao(personalidade, empresa);
}
