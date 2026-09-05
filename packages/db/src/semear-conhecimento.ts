import { pathToFileURL } from 'node:url';

import { criarItem, indexarItem, publicarItem } from '@otto/core/knowledge';

import { eq, getPlatformDb, memberships, tenants } from './index.ts';

/**
 * Base de conhecimento mínima e controlada, para validar o fundamento.
 *
 * Não é semente de demonstração: são poucos fatos, deliberadamente **estreitos**,
 * escolhidos para que exista uma fronteira nítida entre o que a Bia sabe e o que
 * ela não sabe. É isso que torna o teste de "não inventar" verificável — sem
 * essa fronteira, "ela não inventou" seria só sorte.
 *
 * O que fica **de fora** é tão deliberado quanto o que entra: nada de preço, de
 * estoque, de promoção, de forma de pagamento. São exatamente as perguntas que
 * um cliente faz e que este produto não pode responder por adivinhação.
 *
 * Controlado por `SEMEAR_CONHECIMENTO=1` e inerte sem ele. Idempotente pelo
 * título: rodar de novo não duplica.
 */

interface ItemSemente {
  titulo: string;
  corpo: string;
  aliases: string[];
}

/**
 * Empresa fictícia e **declaradamente** fictícia.
 *
 * O ambiente de teste nunca imita um cliente real: um dado inventado que pareça
 * do Supermercado Campeão pode acabar respondido a um cliente de verdade.
 */
const ITENS: ItemSemente[] = [
  {
    titulo: 'Horário de funcionamento',
    corpo: [
      'A loja abre de segunda a sábado, das 8h às 20h.',
      'Aos domingos, das 8h às 14h.',
      'Feriados nacionais seguem o horário de domingo.',
    ].join(' '),
    aliases: [
      'que horas abre',
      'que horas fecha',
      'qual o horário',
      'abre domingo',
      'funciona feriado',
    ],
  },
  {
    titulo: 'Endereço e como chegar',
    corpo:
      'Ficamos na Avenida das Palmeiras, 1200, bairro Cidade Nova. ' +
      'A entrada fica ao lado da praça, e há estacionamento gratuito para clientes.',
    aliases: ['onde fica', 'qual o endereço', 'como chegar', 'tem estacionamento'],
  },
  {
    titulo: 'Área de entrega',
    corpo:
      'Entregamos nos bairros Cidade Nova, Centro e Jardim Aurora. ' +
      'Pedidos até as 17h chegam no mesmo dia; depois disso, no dia seguinte pela manhã. ' +
      'Ainda não entregamos fora desses três bairros.',
    aliases: ['vocês entregam', 'faz entrega', 'entrega no meu bairro', 'quanto tempo demora'],
  },
  {
    titulo: 'Contato e atendimento humano',
    corpo:
      'O telefone da loja é (94) 3322-1100, das 8h às 18h. ' +
      'Quem preferir falar com uma pessoa pode pedir a qualquer momento por aqui.',
    aliases: ['telefone', 'falar com atendente', 'falar com humano'],
  },
];

export async function semearConhecimento(): Promise<void> {
  if (process.env.SEMEAR_CONHECIMENTO?.trim() !== '1') return;

  const slug = process.env.SEMEAR_TENANT_SLUG?.trim();
  const { tenantId, userId } = await resolverDestino(slug);

  for (const item of ITENS) {
    if (await tituloExistente(tenantId, item.titulo)) {
      console.log(`[conhecimento] "${item.titulo}" já existe`);
      continue;
    }

    const itemId = await criarItem(tenantId, userId, {
      titulo: item.titulo,
      corpo: item.corpo,
      tipo: 'fato',
      aliases: item.aliases,
    });

    // Publicar é o que torna o item utilizável como fundamento; rascunho não
    // funda resposta nenhuma.
    await publicarItem(tenantId, userId, itemId, 'Base inicial de validação');

    // Sem embedding o item existe mas não é recuperado pela busca semântica —
    // e o teste de "responde corretamente" falharia por um motivo que não tem
    // nada a ver com o agente.
    await indexarItem(tenantId, itemId);

    console.log(`[conhecimento] "${item.titulo}" publicado e indexado`);
  }

  console.log(`[conhecimento] base de ${ITENS.length} itens pronta`);
}

async function tituloExistente(tenantId: string, titulo: string): Promise<boolean> {
  const { knowledgeItems } = await import('./schema/index.ts');
  const { and } = await import('drizzle-orm');

  const linhas = await getPlatformDb()
    .select({ id: knowledgeItems.id })
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.tenantId, tenantId), eq(knowledgeItems.title, titulo)))
    .limit(1);

  return linhas.length > 0;
}

/**
 * Empresa e autor do item.
 *
 * O `createdBy` precisa ser uma pessoa real do banco: um item de conhecimento
 * sem autor não tem a quem perguntar quando a informação envelhece.
 */
async function resolverDestino(
  slug: string | undefined,
): Promise<{ tenantId: string; userId: string }> {
  const db = getPlatformDb();

  const empresas = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(slug ? eq(tenants.slug, slug) : undefined)
    .limit(2);

  if (empresas.length === 0) {
    throw new Error(slug ? `Empresa "${slug}" não existe.` : 'Não há empresa neste ambiente.');
  }
  if (empresas.length > 1) {
    throw new Error('Há mais de uma empresa. Defina SEMEAR_TENANT_SLUG.');
  }

  const empresa = empresas[0]!;

  const [dono] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.tenantId, empresa.id))
    .limit(1);

  if (!dono) throw new Error(`A empresa "${empresa.slug}" não tem nenhum usuário.`);

  console.log(`[conhecimento] semeando em "${empresa.slug}"`);
  return { tenantId: empresa.id, userId: dono.userId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  semearConhecimento()
    .then(() => process.exit(0))
    .catch((erro: unknown) => {
      console.error('[conhecimento] falhou:', erro instanceof Error ? erro.message : erro);
      process.exit(1);
    });
}
