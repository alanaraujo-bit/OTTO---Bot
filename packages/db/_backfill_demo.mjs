import { Client } from 'pg';
import process from 'node:process';

/**
 * Histórico fictício para o ambiente de teste "Mercado Modelo".
 * Espalha conversas/mensagens/execuções de IA pelos últimos 45 dias, com
 * variação por dia da semana e por hora, para que os gráficos do console
 * tenham o que mostrar. Declaradamente fictício. Idempotente: apaga o que
 * marcou antes (summary = '[demo]') e recria.
 *
 *   node backfill.mjs           # aplica
 *   node backfill.mjs --clear   # só limpa
 */

const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();

const { rows: [t] } = await c.query(`select id, timezone from tenants where slug = 'mercado-modelo'`);
if (!t) { console.error('tenant mercado-modelo não encontrado — rode o seed primeiro'); process.exit(1); }
const tenantId = t.id;
const fuso = t.timezone || 'America/Belem';

const { rows: [ch] } = await c.query(`select id from channels where tenant_id = $1 order by created_at limit 1`, [tenantId]);
const channelId = ch.id;
const { rows: contatos } = await c.query(`select id from contacts where tenant_id = $1 order by created_at`, [tenantId]);
const { rows: itens } = await c.query(`select id, title from knowledge_items where tenant_id = $1`, [tenantId]);
const { rows: agentes } = await c.query(`select id from agent_versions where tenant_id = $1 order by created_at limit 1`, [tenantId]);

// limpa histórico demo anterior
await c.query(`delete from messages where tenant_id=$1 and conversation_id in (select id from conversations where tenant_id=$1 and summary='[demo]')`, [tenantId]);
await c.query(`delete from ai_runs where tenant_id=$1 and conversation_id in (select id from conversations where tenant_id=$1 and summary='[demo]')`, [tenantId]);
await c.query(`delete from conversations where tenant_id=$1 and summary='[demo]'`, [tenantId]);
console.log('histórico demo anterior removido');

if (process.argv.includes('--clear')) { await c.end(); process.exit(0); }

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const MODELS = [['openai', 'gpt-4o-mini', 90], ['openai', 'gpt-4o', 900]];
const PERGUNTAS = [
  'que horas abre hoje?', 'vocês entregam no meu bairro?', 'aceita pix?',
  'tem estacionamento?', 'abre no domingo?', 'qual o telefone da loja do centro?',
  'tem picanha hoje?', 'a padaria faz bolo de aniversário?', 'qual o valor da taxa de entrega?',
  'vocês aceitam vale alimentação?', 'até que horas fica aberto sábado?', 'tem farmácia dentro?',
];
const RESPOSTAS = [
  'Oi! A Unidade Centro abre das 7h às 21h hoje. Posso ajudar em mais alguma coisa?',
  'Entregamos sim, para compras acima de R$ 80 num raio de 5 km. A taxa é R$ 8,00.',
  'Aceitamos! Pix, dinheiro, débito, crédito e também vale-alimentação (Alelo, Sodexo e Ticket).',
  'A Unidade Centro tem estacionamento gratuito para 40 carros, com entrada pela Rua das Palmeiras.',
];

let totalConv = 0, totalMsg = 0, totalRun = 0;
const agora = new Date();

for (let d = 45; d >= 0; d--) {
  const dia = new Date(agora.getTime() - d * 86400000);
  const dow = dia.getDay(); // 0 dom .. 6 sab
  // volume por dia da semana: sáb/sex mais cheio, domingo fraco
  const base = [7, 14, 15, 16, 18, 24, 20][dow];
  const n = Math.max(2, Math.round(base * rnd(0.6, 1.35)));

  for (let i = 0; i < n; i++) {
    // hora do dia: dois picos (10-12 e 17-20)
    const bucket = Math.random();
    let hora;
    if (bucket < 0.4) hora = rnd(9, 12.5);
    else if (bucket < 0.8) hora = rnd(16.5, 20.5);
    else hora = rnd(7, 21);
    const min = Math.floor(rnd(0, 59));
    // constrói timestamp no fuso local -> UTC aproximado (Belem = UTC-3, sem DST)
    const createdLocal = new Date(dia);
    createdLocal.setHours(Math.floor(hora), min, Math.floor(rnd(0, 59)), 0);
    // Belem é UTC-3; e nada de histórico pode cair no futuro.
    const created = new Date(
      Math.min(createdLocal.getTime() + 3 * 3600000, Date.now() - 20 * 60000),
    );

    const respostaSegundos = rnd(8, 120);
    const firstResponse = new Date(created.getTime() + respostaSegundos * 1000);
    const semFundamento = Math.random() < 0.16;
    const handoff = semFundamento ? (Math.random() < 0.7 ? 1 : 0) : (Math.random() < 0.06 ? 1 : 0);
    const encerrada = true; // histórico: toda conversa demo entra fechada (evita colisão com o índice de conversa aberta)
    const status = Math.random() < 0.5 ? 'resolvida' : 'encerrada';
    const lastMsg = new Date(firstResponse.getTime() + rnd(0, 600) * 1000);
    const contato = pick(contatos).id;
    const item = pick(itens);

    const { rows: [conv] } = await c.query(
      `insert into conversations
        (tenant_id, contact_id, channel_id, status, mode, summary, intent,
         first_inbound_at, first_response_at, last_message_at, last_inbound_at,
         resolved_at, closed_at, handoff_count, created_at, updated_at)
       values ($1,$2,$3,$4,'automatico','[demo]',$5,$6,$7,$8,$6,$9,$10,$11,$12,$12)
       returning id`,
      [tenantId, contato, channelId, status, item.title.split(' ').slice(0, 2).join(' ').toLowerCase(),
       created, firstResponse, lastMsg, encerrada ? lastMsg : null, encerrada ? lastMsg : null,
       handoff, created]);
    const convId = conv.id;
    totalConv++;

    const pergunta = pick(PERGUNTAS);
    const resposta = semFundamento
      ? 'Boa pergunta! Vou confirmar essa informação com a equipe e já te retorno, tá? 🙏'
      : pick(RESPOSTAS);

    const { rows: [m1] } = await c.query(
      `insert into messages (tenant_id, conversation_id, direction, author, content_type, body, status, created_at)
       values ($1,$2,'entrada','cliente','texto',$3,'entregue',$4) returning id`,
      [tenantId, convId, pergunta, created]);
    totalMsg++;

    const [prov, model, custoBase] = pick(MODELS);
    const inTok = Math.floor(rnd(400, 1600)), outTok = Math.floor(rnd(40, 260));
    const custo = Math.floor((custoBase * (inTok + outTok * 3)) / 1000);
    const { rows: [run] } = await c.query(
      `insert into ai_runs (tenant_id, conversation_id, trigger_message_id, agent_version_id, purpose,
         provider, model, input_tokens, output_tokens, cost_micro_usd, latency_ms, confidence, grounded,
         retrieved_item_ids, outcome, created_at, completed_at)
       values ($1,$2,$3,$4,'responder',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning id`,
      [tenantId, convId, m1.id, agentes[0]?.id ?? null, prov, model, inTok, outTok, custo,
       Math.floor(rnd(600, 3200)), semFundamento ? rnd(0.2, 0.5) : rnd(0.7, 0.98),
       !semFundamento, JSON.stringify(semFundamento ? [] : [item.id]),
       semFundamento ? 'sem_fundamento' : 'ok', firstResponse, firstResponse]);
    totalRun++;

    await c.query(
      `insert into messages (tenant_id, conversation_id, direction, author, content_type, body, status, ai_run_id, created_at)
       values ($1,$2,'saida','agente','texto',$3,'entregue',$4,$5)`,
      [tenantId, convId, resposta, run.id, firstResponse]);
    totalMsg++;


    if (Math.random() < 0.5) {
      const followUp = new Date(firstResponse.getTime() + rnd(20, 400) * 1000);
      await c.query(
        `insert into messages (tenant_id, conversation_id, direction, author, content_type, body, status, created_at)
         values ($1,$2,'entrada','cliente','texto',$3,'entregue',$4)`,
        [tenantId, convId, pick(['perfeito, obrigado!', 'e no bairro novo?', 'valeu 👍', 'ok', 'e amanhã, abre?']), followUp]);
      totalMsg++;
    }
  }
}

console.log(`histórico criado: ${totalConv} conversas, ${totalMsg} mensagens, ${totalRun} execuções de IA`);
await c.end();
