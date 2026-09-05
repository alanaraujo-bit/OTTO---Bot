import { pathToFileURL } from 'node:url';

import { cifrar } from '@otto/shared';

import { and, channels, eq, getPlatformDb, tenants } from './index.ts';

/**
 * Cadastro de um canal real em um ambiente.
 *
 * Mesma forma do `provisionar.ts`, e pelo mesmo motivo: quem alcança o banco de
 * produção é o worker, pela rede privada, e o produto não tem tela de cadastro
 * de canal — conectar um número é operação nossa, não do dono da loja.
 *
 * Controlado por variáveis e **inerte sem elas**, então fica no arranque sem
 * fazer nada em todo deploy seguinte:
 *
 *   CANAL_EXTERNAL_ID    `phone_number_id` da Meta — é a chave da resolução
 *   CANAL_TENANT_SLUG    empresa dona do canal; opcional se só existe uma
 *   CANAL_NOME           nome interno, o que aparece na Inbox
 *   CANAL_HANDLE         como o número aparece para o cliente (+55 …)
 *   CANAL_TIPO           `whatsapp` (padrão) ou `instagram`
 *   CANAL_TOKEN          token de envio; cifrado antes de tocar o banco
 *   CANAL_SUBSTITUI      `phone_number_id` antigo, a ser desconectado
 *
 * O `CANAL_TOKEN` **nunca** é gravado em texto claro: passa por `cifrar()`
 * (AES-256-GCM com `ENCRYPTION_KEY`) antes do `INSERT`. Sem ele o canal recebe
 * mensagem normalmente e o envio falha de forma visível, dizendo o que falta.
 *
 * Depois de cadastrar, **apague a variável do serviço**. Ela cumpriu o papel: o
 * valor está cifrado no banco, e uma variável de ambiente é o lugar mais fácil
 * de vazar um segredo por engano.
 *
 * Idempotente pelo `(kind, external_id)`, que é único no banco: rodar de novo
 * confirma o estado e atualiza nome/handle em vez de duplicar.
 */
export async function cadastrarCanal(): Promise<void> {
  const externalId = process.env.CANAL_EXTERNAL_ID?.trim();
  if (!externalId) return;

  const tipo = (process.env.CANAL_TIPO?.trim() || 'whatsapp') as 'whatsapp' | 'instagram';
  const nome = process.env.CANAL_NOME?.trim() || 'WhatsApp';
  const handle = process.env.CANAL_HANDLE?.trim() || null;
  const slug = process.env.CANAL_TENANT_SLUG?.trim();

  const db = getPlatformDb();
  const tenantId = await resolverEmpresa(slug);

  // Cifra antes de qualquer escrita: se `ENCRYPTION_KEY` estiver ausente ou
  // malformada, o arranque falha aqui, com o segredo ainda fora do banco.
  const token = process.env.CANAL_TOKEN?.trim();
  const credenciais = token ? cifrar(token) : null;

  const [existente] = await db
    .select({ id: channels.id, tenantId: channels.tenantId })
    .from(channels)
    .where(and(eq(channels.kind, tipo), eq(channels.externalId, externalId)))
    .limit(1);

  if (existente && existente.tenantId !== tenantId) {
    // O índice único é global por (kind, external_id): um número não pode
    // atender duas empresas. Mover exigiria apagar as conversas antigas, e
    // isso não é decisão de um script de arranque.
    throw new Error(
      `O número ${externalId} já está cadastrado em outra empresa. ` +
        'Remova o canal existente antes de movê-lo.',
    );
  }

  if (existente) {
    await db
      .update(channels)
      .set({
        name: nome,
        externalHandle: handle,
        status: 'conectado',
        // Só sobrescreve a credencial quando veio uma nova: rodar sem
        // CANAL_TOKEN não deve apagar a que já está guardada.
        ...(credenciais ? { credentials: credenciais, connectedAt: new Date() } : {}),
      })
      .where(eq(channels.id, existente.id));
    console.log(
      `[canal] ${tipo} ${externalId} confirmado (${existente.id})` +
        (credenciais ? ' — credencial atualizada' : ' — sem credencial nova'),
    );
    await desconectarAnterior(tenantId, tipo, externalId);
    return;
  }

  const [criado] = await db
    .insert(channels)
    .values({
      tenantId,
      kind: tipo,
      name: nome,
      status: 'conectado',
      externalId,
      externalHandle: handle,
      credentials: credenciais,
      connectedAt: new Date(),
    })
    .returning({ id: channels.id });

  console.log(
    `[canal] ${tipo} ${externalId} cadastrado (${criado!.id})` +
      (credenciais ? ' — com credencial de envio' : ' — sem credencial: só recebe'),
  );
  await desconectarAnterior(tenantId, tipo, externalId);
}

/**
 * Desconecta o número que este substitui.
 *
 * Trocar de número é um canal **novo**, não uma edição do antigo: as conversas
 * já tidas pertencem ao número em que aconteceram, e reescrever o
 * `external_id` da linha existente faria o histórico mentir sobre por onde o
 * cliente falou.
 *
 * O antigo fica em `desconectado`, o que já é entendido pelo envio — ele
 * recusa a mensagem com "o canal está desconectado" em vez de tentar entregar
 * por um número que não é mais nosso.
 *
 * Exige o id explícito. Desconectar sozinho "os outros canais da empresa"
 * seria adivinhação, e uma empresa pode legitimamente ter dois números.
 */
async function desconectarAnterior(
  tenantId: string,
  tipo: 'whatsapp' | 'instagram',
  novoExternalId: string,
): Promise<void> {
  const anterior = process.env.CANAL_SUBSTITUI?.trim();
  if (!anterior || anterior === novoExternalId) return;

  const atualizadas = await getPlatformDb()
    .update(channels)
    .set({ status: 'desconectado' })
    .where(
      and(
        eq(channels.tenantId, tenantId),
        eq(channels.kind, tipo),
        eq(channels.externalId, anterior),
      ),
    )
    .returning({ id: channels.id });

  if (atualizadas.length) {
    console.log(`[canal] ${anterior} marcado como desconectado (${atualizadas[0]!.id})`);
  } else {
    console.log(`[canal] nada a desconectar: ${anterior} não é um canal desta empresa`);
  }
}

/**
 * Descobre a empresa dona do canal.
 *
 * Sem `CANAL_TENANT_SLUG`, aceita o caso em que o ambiente tem exatamente uma
 * empresa — que é a situação de um ambiente recém-provisionado. Com mais de
 * uma, exige o slug: escolher sozinho a empresa de um canal seria entregar
 * conversa de cliente para a empresa errada.
 */
async function resolverEmpresa(slug: string | undefined): Promise<string> {
  const db = getPlatformDb();

  if (slug) {
    const [empresa] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (!empresa) throw new Error(`Empresa "${slug}" não existe neste ambiente.`);
    return empresa.id;
  }

  const empresas = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).limit(2);

  if (empresas.length === 0) throw new Error('Não há nenhuma empresa neste ambiente.');
  if (empresas.length > 1) {
    throw new Error('Há mais de uma empresa neste ambiente. Defina CANAL_TENANT_SLUG.');
  }

  console.log(`[canal] usando a única empresa do ambiente: ${empresas[0]!.slug}`);
  return empresas[0]!.id;
}

// Executável direto, para uso fora do arranque. `pathToFileURL` em vez de
// montar a URL à mão: no Windows o caminho vem com barra invertida e a
// comparação ingênua nunca casaria — o script viraria um no-op silencioso.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cadastrarCanal()
    .then(() => process.exit(0))
    .catch((erro: unknown) => {
      console.error('[canal] falhou:', erro instanceof Error ? erro.message : erro);
      process.exit(1);
    });
}
