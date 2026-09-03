import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { watch, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/**
 * Painel de construção.
 *
 * Uma ferramenta interna, não parte do produto. Existe para acompanhar o avanço
 * sem precisar ler o terminal.
 *
 * A regra que vale aqui é a mesma do produto: nada é inventado. Cada número vem
 * de uma fonte verificável — o banco responde ou não responde, o teste passou ou
 * não passou, o commit existe ou não existe. O que é declaração minha aparece
 * marcado como declaração.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');
const require = createRequire(join(raiz, 'packages', 'db', 'package.json'));

const PORTA = Number(process.env.PAINEL_PORTA ?? 4400);

// ─── Fontes de dados ──────────────────────────────────────────────────────────

function executar(comando, args, opcoes = {}) {
  return new Promise((resolver) => {
    const p = spawn(comando, args, {
      cwd: raiz,
      shell: process.platform === 'win32',
      ...opcoes,
    });
    let saida = '';
    let erro = '';
    p.stdout?.on('data', (d) => (saida += d));
    p.stderr?.on('data', (d) => (erro += d));
    p.on('close', (codigo) => resolver({ codigo, saida, erro }));
    p.on('error', () => resolver({ codigo: -1, saida: '', erro: 'comando indisponível' }));
  });
}

async function lerEstadoDeclarado() {
  try {
    return JSON.parse(await readFile(join(aqui, 'estado.json'), 'utf8'));
  } catch {
    return { fases: [], pendenciasExternas: [] };
  }
}

async function lerDiario() {
  try {
    const bruto = await readFile(join(aqui, 'diario.jsonl'), 'utf8');
    return bruto
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-40)
      .reverse();
  } catch {
    return [];
  }
}

async function lerGit() {
  const [log, arquivos, ramo, sujo] = await Promise.all([
    executar('git', ['log', '-12', '--pretty=format:%h%x1f%s%x1f%cI']),
    executar('git', ['ls-files']),
    executar('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    executar('git', ['status', '--porcelain']),
  ]);

  const commits = log.saida
    .split('\n')
    .filter(Boolean)
    .map((linha) => {
      const [hash, assunto, quando] = linha.split('\x1f');
      return { hash, assunto, quando };
    });

  const versionados = arquivos.saida.split('\n').filter(Boolean);

  return {
    ramo: ramo.saida.trim() || '—',
    commits,
    arquivosVersionados: versionados.length,
    alteracoesPendentes: sujo.saida.split('\n').filter(Boolean).length,
  };
}

/** Conta linhas de código escritas por nós, ignorando dependências e artefatos. */
async function contarCodigo() {
  const extensoes = new Set(['.ts', '.tsx', '.sql', '.css', '.mjs']);
  const ignorar = new Set(['node_modules', '.next', '.turbo', 'dist', '.git', 'coverage']);
  const contagem = {};

  async function percorrer(caminho, rotulo) {
    let entradas;
    try {
      entradas = await readdir(caminho, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      if (ignorar.has(entrada.name)) continue;
      const completo = join(caminho, entrada.name);
      if (entrada.isDirectory()) {
        await percorrer(completo, rotulo);
      } else {
        const ponto = entrada.name.lastIndexOf('.');
        const ext = ponto >= 0 ? entrada.name.slice(ponto) : '';
        if (!extensoes.has(ext)) continue;
        try {
          const conteudo = await readFile(completo, 'utf8');
          contagem[rotulo] = (contagem[rotulo] ?? 0) + conteudo.split('\n').length;
        } catch {
          /* arquivo em escrita */
        }
      }
    }
  }

  for (const alvo of ['packages/shared', 'packages/db', 'packages/core', 'packages/ui', 'apps/web', 'apps/worker']) {
    if (existsSync(join(raiz, alvo))) await percorrer(join(raiz, alvo), alvo);
  }
  return contagem;
}

async function lerEnv() {
  try {
    const bruto = await readFile(join(raiz, '.env'), 'utf8');
    const mapa = {};
    for (const linha of bruto.split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
      if (m) mapa[m[1]] = m[2];
    }
    return mapa;
  } catch {
    return {};
  }
}

async function verificarPostgres(url) {
  if (!url) return { ok: false, detalhe: 'sem DATABASE_ADMIN_URL' };
  const pg = require('pg');
  const inicio = Date.now();
  const cliente = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
    query_timeout: 6000,
  });
  try {
    await cliente.connect();
    const versao = await cliente.query('select version()');
    const migracoes = await cliente.query(
      'select count(*)::int as n from drizzle."__drizzle_migrations"',
    );
    const tabelas = await cliente.query(`
      select count(*)::int as total,
             count(*) filter (where c.relrowsecurity)::int as protegidas
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);
    return {
      ok: true,
      latenciaMs: Date.now() - inicio,
      versao: /PostgreSQL ([\d.]+)/.exec(versao.rows[0].version)?.[1] ?? '?',
      migracoes: migracoes.rows[0].n,
      tabelas: tabelas.rows[0].total,
      tabelasProtegidas: tabelas.rows[0].protegidas,
    };
  } catch (erro) {
    return { ok: false, detalhe: erro.message };
  } finally {
    await cliente.end().catch(() => {});
  }
}

function verificarRedis(url) {
  return new Promise((resolver) => {
    if (!url) return resolver({ ok: false, detalhe: 'sem REDIS_URL' });
    let alvo;
    try {
      alvo = new URL(url);
    } catch {
      return resolver({ ok: false, detalhe: 'REDIS_URL malformada' });
    }

    const inicio = Date.now();
    const socket = connect(
      { host: alvo.hostname, port: Number(alvo.port || 6379), timeout: 6000 },
      () => {
        const senha = decodeURIComponent(alvo.password || '');
        const usuario = decodeURIComponent(alvo.username || 'default');
        const comando = (...partes) =>
          `*${partes.length}\r\n${partes.map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join('')}`;
        if (senha) socket.write(comando('AUTH', usuario, senha));
        socket.write(comando('PING'));
      },
    );

    let buffer = '';
    const encerrar = (resultado) => {
      socket.destroy();
      resolver(resultado);
    };

    socket.on('data', (d) => {
      buffer += d.toString();
      if (buffer.includes('+PONG')) encerrar({ ok: true, latenciaMs: Date.now() - inicio });
      else if (buffer.includes('-ERR') || buffer.includes('-WRONGPASS')) {
        encerrar({ ok: false, detalhe: buffer.trim().split('\r\n')[0] });
      }
    });
    socket.on('timeout', () => encerrar({ ok: false, detalhe: 'tempo esgotado' }));
    socket.on('error', (e) => encerrar({ ok: false, detalhe: e.message }));
  });
}

// ─── Testes ───────────────────────────────────────────────────────────────────

let testes = { estado: 'nunca', quando: null };
let rodandoTestes = false;

async function rodarTestes() {
  if (rodandoTestes) return;
  rodandoTestes = true;
  testes = { estado: 'rodando', quando: new Date().toISOString() };
  publicar();

  // Caminho relativo de propósito: a raiz do projeto tem espaço no nome, e com
  // `shell: true` no Windows um caminho absoluto não citado é partido no espaço.
  const relativo = '.ultimo-teste.json';
  const saidaJson = join(raiz, 'packages', 'db', relativo);
  const inicio = Date.now();
  const r = await executar(
    'pnpm',
    ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${relativo}`],
    { cwd: join(raiz, 'packages', 'db') },
  );

  let resumo = null;
  try {
    const bruto = JSON.parse(await readFile(saidaJson, 'utf8'));
    resumo = {
      total: bruto.numTotalTests,
      passaram: bruto.numPassedTests,
      falharam: bruto.numFailedTests,
      arquivos: bruto.numTotalTestSuites,
    };
  } catch {
    /* sem relatório: caímos no código de saída */
  }

  // A última linha de erro reconhecível vale mais que 400 caracteres de pilha.
  const primeiraFalha = (r.erro || r.saida)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /error|falhou|failed|cannot|não/i.test(l) && !l.includes('node_modules'))
    .pop();

  testes = {
    estado: r.codigo === 0 ? 'passou' : 'falhou',
    quando: new Date().toISOString(),
    duracaoMs: Date.now() - inicio,
    ...(resumo ?? {}),
    ...(r.codigo !== 0 && !resumo
      ? { detalhe: (primeiraFalha ?? 'A suíte não produziu relatório.').slice(0, 240) }
      : {}),
  };
  rodandoTestes = false;
  publicar();
}

// ─── Montagem do estado ───────────────────────────────────────────────────────

let cache = null;
let ultimoHashCommit = null;

async function montarEstado() {
  const env = await lerEnv();
  const [declarado, git, codigo, postgres, redis, diario] = await Promise.all([
    lerEstadoDeclarado(),
    lerGit(),
    contarCodigo(),
    verificarPostgres(env.DATABASE_ADMIN_URL),
    verificarRedis(env.REDIS_URL),
    lerDiario(),
  ]);

  const pendencias = (declarado.pendenciasExternas ?? []).map((p) => ({
    ...p,
    atendida: Boolean(p.variavel && env[p.variavel] && env[p.variavel].length > 0),
  }));

  return {
    atualizadoEm: new Date().toISOString(),
    projeto: {
      nome: 'Otto',
      subtitulo: 'Plataforma de atendimento omnichannel com IA',
      ambiente: env.APP_ENV ?? 'development',
    },
    fases: declarado.fases ?? [],
    pendencias,
    infra: { postgres, redis },
    testes,
    git,
    codigo,
    diario,
  };
}

// ─── SSE ──────────────────────────────────────────────────────────────────────

const inscritos = new Set();

async function publicar() {
  cache = await montarEstado();
  const payload = `data: ${JSON.stringify(cache)}\n\n`;
  for (const resposta of inscritos) {
    try {
      resposta.write(payload);
    } catch {
      inscritos.delete(resposta);
    }
  }

  // Um commit novo é o sinal mais confiável de que algo mudou de verdade.
  const topo = cache.git.commits[0]?.hash;
  if (topo && ultimoHashCommit && topo !== ultimoHashCommit) rodarTestes();
  ultimoHashCommit = topo ?? ultimoHashCommit;
}

let agendado = null;
function publicarComFolga() {
  if (agendado) return;
  agendado = setTimeout(() => {
    agendado = null;
    publicar().catch(() => {});
  }, 700);
}

for (const alvo of ['apps', 'packages', 'docs', 'tools']) {
  const caminho = join(raiz, alvo);
  if (!existsSync(caminho)) continue;
  try {
    watch(caminho, { recursive: true }, (_evento, arquivo) => {
      if (!arquivo) return;
      const texto = String(arquivo);
      if (texto.includes('node_modules') || texto.includes('.next') || texto.includes('.turbo')) return;
      if (texto.includes('.ultimo-teste.json')) return;
      publicarComFolga();
    });
  } catch {
    /* sem watch recursivo: o intervalo cobre */
  }
}
setInterval(() => publicar().catch(() => {}), 15_000);

// ─── Servidor ─────────────────────────────────────────────────────────────────

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORTA}`);

  if (url.pathname === '/eventos') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(': conectado\n\n');
    if (!cache) await publicar();
    res.write(`data: ${JSON.stringify(cache)}\n\n`);
    inscritos.add(res);
    const batida = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(batida);
      inscritos.delete(res);
    });
    return;
  }

  if (url.pathname === '/testes' && req.method === 'POST') {
    rodarTestes();
    res.writeHead(202).end('{"ok":true}');
    return;
  }

  if (url.pathname === '/estado') {
    if (!cache) await publicar();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(cache));
    return;
  }

  const html = await readFile(join(aqui, 'painel.html'), 'utf8');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

servidor.listen(PORTA, () => {
  console.log(`painel de construção em http://localhost:${PORTA}`);
  publicar().catch((e) => console.error('falha ao montar estado:', e.message));
});
