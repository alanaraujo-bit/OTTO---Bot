import {
  agents,
  channels,
  getPlatformDb,
  knowledgeCategories,
  knowledgeItems,
  locationHours,
  memberships,
  tenantLocations,
  tenants,
  users,
  eq,
  sql,
  closeDb,
} from './index.ts';
import { gerarHashSenha } from '@otto/core/auth';

/**
 * Ambiente de teste.
 *
 * A empresa criada aqui é **declaradamente fictícia** — "Mercado Modelo", uma
 * cidade inventada, telefones no prefixo 5555 reservado para ficção. Ela nunca
 * imita o Supermercado Campeão: dados reais do cliente virão do Sr. Fernando, e
 * inventá-los seria a pior falha possível em um produto que existe justamente
 * para não alucinar.
 *
 * Idempotente: rodar de novo atualiza em vez de duplicar.
 *
 *   node --env-file=.env packages/db/src/seed.ts
 */

const SLUG = 'mercado-modelo';
const EMAIL_DONO = 'dono@mercadomodelo.teste';
const SENHA_DONO = 'ambiente-de-teste-2026';

async function semear(): Promise<void> {
  const db = getPlatformDb();

  // ── Empresa ────────────────────────────────────────────────────────────────
  const [empresa] = await db
    .insert(tenants)
    .values({
      slug: SLUG,
      displayName: 'Mercado Modelo',
      legalName: 'Mercado Modelo Comércio de Alimentos LTDA (fictícia)',
      status: 'ativo',
      timezone: 'America/Belem',
    })
    .onConflictDoUpdate({
      target: tenants.slug,
      set: { displayName: 'Mercado Modelo', status: 'ativo' },
    })
    .returning({ id: tenants.id });

  const tenantId = empresa!.id;
  console.log(`empresa ${SLUG} pronta`);

  // ── Pessoas ────────────────────────────────────────────────────────────────
  const senhaHash = await gerarHashSenha(SENHA_DONO);

  const pessoas = [
    { email: EMAIL_DONO, nome: 'Ana Ribeiro', papel: 'proprietario' as const },
    { email: 'atendente@mercadomodelo.teste', nome: 'Caio Menezes', papel: 'atendente' as const },
    { email: 'leitura@mercadomodelo.teste', nome: 'Dora Lima', papel: 'visualizacao' as const },
  ];

  for (const pessoa of pessoas) {
    // O índice único de `users` é sobre `lower(email)` — uma expressão, não a
    // coluna. `ON CONFLICT` não casa com ela, então a idempotência aqui é
    // explícita: procura, depois insere ou atualiza.
    const [existente] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${pessoa.email.toLowerCase()}`)
      .limit(1);

    const u = existente
      ? (
          await db
            .update(users)
            .set({ name: pessoa.nome, passwordHash: senhaHash, isActive: true })
            .where(eq(users.id, existente.id))
            .returning({ id: users.id })
        )[0]
      : (
          await db
            .insert(users)
            .values({
              email: pessoa.email,
              name: pessoa.nome,
              passwordHash: senhaHash,
              emailVerifiedAt: new Date(),
            })
            .returning({ id: users.id })
        )[0];

    await db
      .insert(memberships)
      .values({ tenantId, userId: u!.id, role: pessoa.papel })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.userId],
        set: { role: pessoa.papel, isActive: true },
      });

    console.log(`  ${pessoa.papel.padEnd(13)} ${pessoa.email}`);
  }

  // ── Unidades ───────────────────────────────────────────────────────────────
  // Duas, de propósito: o primeiro cliente real tem mais de uma, e desambiguar
  // "qual fica mais perto?" precisa fazer parte do produto desde o começo.
  const unidades = [
    {
      name: 'Unidade Centro',
      isPrimary: true,
      street: 'Rua das Palmeiras',
      number: '120',
      district: 'Centro',
      city: 'Cidade Modelo',
      state: 'PA',
      phone: '5555000001',
      horarios: [
        [1, '07:00', '21:00'],
        [2, '07:00', '21:00'],
        [3, '07:00', '21:00'],
        [4, '07:00', '21:00'],
        [5, '07:00', '22:00'],
        [6, '07:00', '22:00'],
        [0, '08:00', '14:00'],
      ] as const,
    },
    {
      name: 'Unidade Bairro Novo',
      isPrimary: false,
      street: 'Avenida das Castanheiras',
      number: '2450',
      district: 'Bairro Novo',
      city: 'Cidade Modelo',
      state: 'PA',
      phone: '5555000002',
      horarios: [
        [1, '08:00', '20:00'],
        [2, '08:00', '20:00'],
        [3, '08:00', '20:00'],
        [4, '08:00', '20:00'],
        [5, '08:00', '20:00'],
        [6, '08:00', '20:00'],
      ] as const,
    },
  ];

  const jaCadastradas = new Set(
    (
      await db
        .select({ name: tenantLocations.name })
        .from(tenantLocations)
        .where(eq(tenantLocations.tenantId, tenantId))
    ).map((u) => u.name),
  );

  for (const unidade of unidades) {
    if (jaCadastradas.has(unidade.name)) continue;

    const [nova] = await db
      .insert(tenantLocations)
      .values({
        tenantId,
        name: unidade.name,
        isPrimary: unidade.isPrimary,
        street: unidade.street,
        number: unidade.number,
        district: unidade.district,
        city: unidade.city,
        state: unidade.state,
        phone: unidade.phone,
      })
      .returning({ id: tenantLocations.id });

    const locationId = nova!.id;

    const paraMinutos = (h: string) => {
      const [hora, min] = h.split(':').map(Number);
      return hora! * 60 + min!;
    };

    await db.insert(locationHours).values(
      unidade.horarios.map(([dia, abre, fecha]) => ({
        tenantId,
        locationId,
        weekday: dia,
        opensAt: paraMinutos(abre),
        closesAt: paraMinutos(fecha),
      })),
    );

    console.log(`  unidade ${unidade.name}`);
  }

  // ── Canal de teste ─────────────────────────────────────────────────────────
  const [canalExistente] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.tenantId, tenantId));

  if (!canalExistente) {
    await db.insert(channels).values({
      tenantId,
      kind: 'simulador',
      name: 'Canal de teste',
      status: 'conectado',
      externalId: `sim-${tenantId.slice(0, 8)}`,
      externalHandle: 'simulador',
      connectedAt: new Date(),
    });
    console.log('  canal de teste conectado');
  }

  // ── Conhecimento ───────────────────────────────────────────────────────────
  const [categoria] = await db
    .insert(knowledgeCategories)
    .values({ tenantId, name: 'Atendimento', description: 'Perguntas do dia a dia da loja.' })
    .onConflictDoNothing()
    .returning({ id: knowledgeCategories.id });

  const itens = [
    {
      kind: 'pergunta_frequente' as const,
      title: 'Formas de pagamento aceitas',
      body:
        'O Mercado Modelo aceita dinheiro, PIX, cartão de débito e cartão de crédito ' +
        '(Visa, Mastercard e Elo). Também aceitamos vale-alimentação e vale-refeição ' +
        'nas bandeiras Alelo, Sodexo e Ticket.',
      aliases: ['aceita pix', 'aceita cartão', 'pode pagar com vale', 'aceita alelo'],
    },
    {
      kind: 'servico' as const,
      title: 'Serviços disponíveis na loja',
      body:
        'As duas unidades têm açougue, padaria própria e hortifruti. A Unidade Centro ' +
        'também tem rotisseria, com pratos prontos a partir das 11h.',
      aliases: ['tem açougue', 'tem padaria', 'vende pão', 'tem comida pronta'],
    },
    {
      kind: 'politica' as const,
      title: 'Entrega em domicílio',
      body:
        'Fazemos entrega para compras acima de R$ 80,00, em um raio de 5 km de cada ' +
        'unidade. O pedido é feito pelo WhatsApp e a entrega acontece no mesmo dia para ' +
        'pedidos até as 16h. A taxa é de R$ 8,00.',
      aliases: ['fazem entrega', 'tem delivery', 'entregam em casa', 'taxa de entrega'],
    },
    {
      kind: 'fato' as const,
      title: 'Estacionamento',
      body:
        'A Unidade Centro tem estacionamento gratuito para 40 carros, com acesso pela ' +
        'Rua das Palmeiras. A Unidade Bairro Novo não tem estacionamento próprio.',
      aliases: ['tem estacionamento', 'onde estacionar', 'tem vaga'],
    },
  ];

  for (const item of itens) {
    const [existe] = await db
      .select({ id: knowledgeItems.id })
      .from(knowledgeItems)
      .where(eq(knowledgeItems.title, item.title));
    if (existe) continue;

    await db.insert(knowledgeItems).values({
      tenantId,
      categoryId: categoria?.id ?? null,
      kind: item.kind,
      status: 'publicado',
      title: item.title,
      body: item.body,
      aliases: item.aliases,
      sourceType: 'ambiente_de_teste',
      publishedAt: new Date(),
    });
  }
  console.log(`  ${itens.length} itens de conhecimento`);

  // ── Agente ─────────────────────────────────────────────────────────────────
  await db
    .insert(agents)
    .values({ tenantId, displayName: 'Bia' })
    .onConflictDoNothing();

  console.log('\nambiente de teste pronto.');
  console.log(`  console:  http://localhost:3000/e/${SLUG}`);
  console.log(`  entrar:   ${EMAIL_DONO}`);
  console.log(`  senha:    ${SENHA_DONO}`);
}

semear()
  .then(() => closeDb())
  .catch(async (erro: unknown) => {
    console.error('seed falhou:', erro instanceof Error ? erro.message : erro);
    await closeDb();
    process.exit(1);
  });
