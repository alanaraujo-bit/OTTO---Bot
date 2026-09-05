/**
 * Exercita a fonte "informado pela equipe" contra banco e embeddings reais.
 *
 * Cobre o que os testes puros não alcançam: a consulta de cobertura e trigrama
 * sobre as falas, o cosseno contra o embedding da pergunta, e a regra de
 * correção — quando a equipe se corrige, vale a última palavra.
 *
 *   node --env-file=.env --import tsx packages/db/scripts/verificar-operador.ts
 */
import { falaQueResponde, type FalaDoOperador } from '@otto/core/ai';
import { rotaPara } from '@otto/core/ai';
import { getPlatformDb, tenants } from '@otto/db';

const db = getPlatformDb();
const [empresa] = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).limit(1);
if (!empresa) throw new Error('nenhuma empresa');

const rota = rotaPara('embutir');
const embutir = async (textos: string[]) =>
  (await rota.provedor.embutir({ modelo: rota.modelo, textos })).vetores;

/** Falas da equipe, da mais recente para a mais antiga — como o banco devolve. */
const fala = (id: string, texto: string, minutosAtras: number): FalaDoOperador => ({
  mensagemId: id,
  texto,
  autor: 'Alan Araújo',
  em: new Date(Date.now() - minutosAtras * 60_000),
});

const CENARIOS: { nome: string; falas: FalaDoOperador[]; pergunta: string; espera: string | null }[] =
  [
    {
      nome: 'o caso real de producao',
      falas: [fala('m1', 'o cuscuz está 4,99.', 1)],
      pergunta: 'Show, quanto tá o cuscuz mesmo?',
      espera: 'm1',
    },
    {
      nome: 'correcao: vale a ultima palavra',
      falas: [fala('m2', 'na verdade o cuscuz está 5,49.', 1), fala('m1', 'o cuscuz está 4,99.', 5)],
      pergunta: 'quanto está o cuscuz?',
      espera: 'm2',
    },
    {
      nome: 'saudacao da equipe nao responde nada',
      falas: [fala('m3', 'Oi, tudo bem? Já te ajudo.', 1)],
      pergunta: 'quanto está o cuscuz?',
      espera: null,
    },
    {
      nome: 'fala sobre outro assunto nao responde',
      falas: [fala('m4', 'a entrega no Centro sai até as 17h.', 1)],
      pergunta: 'qual o preço do feijão?',
      espera: null,
    },
    {
      nome: 'a fala certa e escolhida entre varias',
      falas: [
        fala('m5', 'qualquer coisa é só chamar.', 1),
        fala('m6', 'o cuscuz está 4,99.', 3),
        fala('m7', 'bom dia!', 6),
      ],
      pergunta: 'quanto custa o cuscuz?',
      espera: 'm6',
    },
  ];

let falhas = 0;
for (const c of CENARIOS) {
  const [vp] = await embutir([c.pergunta]);
  const vetoresFalas = await embutir(c.falas.map((f) => f.texto));
  const mapa = new Map(c.falas.map((f, i) => [f.mensagemId, vetoresFalas[i]!]));

  const achada = await falaQueResponde(empresa.id, c.pergunta, c.falas, mapa, vp ?? null);
  const obtido = achada?.mensagemId ?? null;
  const ok = obtido === c.espera;
  if (!ok) falhas++;

  console.log(
    `${ok ? 'OK  ' : 'FALHA'} ${c.nome.padEnd(38)} esperado=${String(c.espera).padEnd(5)} obtido=${String(obtido).padEnd(5)}`,
  );
  if (achada) console.log(`      -> "${achada.texto}"`);
}

console.log(`\n${CENARIOS.length - falhas}/${CENARIOS.length} cenarios corretos`);
process.exit(falhas === 0 ? 0 : 1);
