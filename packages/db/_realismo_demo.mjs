import { Client } from 'pg';
import process from 'node:process';

/**
 * Dá nome e variedade aos dados do ambiente de teste "Mercado Modelo".
 * A empresa continua declaradamente fictícia — só deixa a lista de conversas e
 * de clientes parecer uma operação real em vez de "Cliente 1, Cliente 2".
 * Idempotente. Rodar de `packages/db`:
 *   node --env-file=../../.env _realismo_demo.mjs
 */

const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();

const { rows: [t] } = await c.query(`select id from tenants where slug='mercado-modelo'`);
const tenantId = t.id;

const NOMES = [
  'Rita Souza', 'Marcos Antônio', 'Cleide Ferreira', 'João Batista', 'Fernanda Alves',
  'Seu Raimundo', 'Dona Lúcia', 'Patrícia Gomes', 'Anderson Luz', 'Maria do Carmo',
  'Josué Carvalho', 'Vanessa Rocha', 'Elton Nascimento', 'Sandra Regina', 'Gilberto Nunes',
  'Aline Barbosa', 'Rubens Teixeira', 'Cátia Mendes', 'Wagner Pires', 'Débora Santana',
  'Nilton César', 'Rosângela Dias', 'Fábio Moura', 'Juliana Prado', 'Osmar Correia',
  'Bruna Cavalcante', 'Sérgio Ramos', 'Marlene Farias', 'Diego Aragão', 'Tânia Lopes',
  'Hélio Bastos', 'Camila Freitas', 'Valdir Pontes', 'Simone Araújo', 'Renato Vieira',
  'Lourdes Batista', 'Adriano Melo', 'Priscila Nogueira', 'Edson Tavares', 'Meire Cunha',
  'Custódio Reis', 'Larissa Pinho', 'Genival Santos', 'Neide Bezerra', 'Ivo Machado',
  'Kelly Andrade', 'Manoel Furtado', 'Solange Vaz',
];

const ESPERANDO = [
  'quero falar com uma pessoa por favor',
  'vocês entregam gás de cozinha?',
  'tem como parcelar a compra do mês?',
  'a promoção do café ainda está valendo?',
  'comprei um produto vencido, como faço?',
  'preciso de uma nota fiscal da compra de ontem',
  'o motoboy não chegou ainda, já faz 2 horas',
  'vocês têm frango caipira inteiro?',
  'qual o limite de itens pra entrega grátis?',
  'me liga nesse número quando puder',
  'vcs trocam botijão ou só a recarga?',
  'o pix não caiu no caixa, o que faço?',
];

const contatos = (await c.query(
  `select id from contacts where tenant_id=$1 order by created_at`, [tenantId],
)).rows;

for (let i = 0; i < contatos.length; i++) {
  await c.query(`update contacts set display_name=$1 where id=$2`, [NOMES[i % NOMES.length], contatos[i].id]);
}
console.log(`${contatos.length} contatos renomeados`);

// Conversas abertas / esperando: espalha o tempo de espera e varia a última fala.
const abertas = (await c.query(
  `select id from conversations
   where tenant_id=$1 and status in ('aberta','aguardando_cliente','aguardando_humano')
   order by created_at`, [tenantId],
)).rows;

const agora = Date.now();
for (let i = 0; i < abertas.length; i++) {
  const convId = abertas[i].id;
  // espera entre 3 min e 30 h, concentrada nas primeiras horas
  const minutos = Math.round(3 + Math.pow(Math.random(), 2) * 1800);
  const quando = new Date(agora - minutos * 60000);
  const texto = ESPERANDO[i % ESPERANDO.length];

  const { rows: [ult] } = await c.query(
    `select id from messages where conversation_id=$1 order by created_at desc limit 1`, [convId],
  );
  if (ult) {
    await c.query(
      `update messages set body=$1, author='cliente', direction='entrada', created_at=$2 where id=$3`,
      [texto, quando, ult.id],
    );
  }
  await c.query(
    `update conversations set last_message_at=$1, last_inbound_at=$1,
       first_inbound_at=coalesce(first_inbound_at, $1) where id=$2`,
    [quando, convId],
  );
}
console.log(`${abertas.length} conversas abertas com espera variada`);

// Reagrega os contadores do contato a partir das conversas reais (o histórico
// demo é inserido direto e não passa pelos gatilhos da aplicação).
const ag = await c.query(
  `update contacts ct set
     conversation_count = sub.n,
     last_interaction_at = sub.last,
     first_seen_at = least(ct.first_seen_at, sub.first)
   from (select contact_id, count(*) n, max(last_message_at) last, min(created_at) first
         from conversations where tenant_id = $1 group by contact_id) sub
   where ct.id = sub.contact_id and ct.tenant_id = $1`,
  [tenantId],
);
console.log(`${ag.rowCount} contatos reagregados`);

await c.end();
