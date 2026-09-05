# Arquitetura — Otto

> `Otto` é o codinome provisório da plataforma. Toda a identidade visível ao usuário
> (nome, logotipo, cores de marca) vive em `packages/ui/src/brand.ts` e é substituível
> sem tocar em nenhuma outra parte do código.

## 1. O que estamos construindo

Uma infraestrutura operacional de relacionamento entre empresas e seus clientes.
Canais (WhatsApp, Instagram) são adaptadores. Modelos de IA são motores substituíveis.
O ativo real é o conhecimento da empresa, o histórico, os workflows e o controle.

Três públicos, três superfícies:

| Superfície | Quem usa | Onde |
|---|---|---|
| **Console** | Proprietário e equipe da empresa cliente | PWA (`/app`) |
| **Backoffice** | Nós, donos do SaaS | Mesma aplicação, rotas `/admin`, papéis de plataforma |
| **Conversa** | O consumidor final | WhatsApp / Instagram Direct |

## 2. Topologia

Tudo roda no Railway, em uma única rede privada.

```
                  Meta (WhatsApp Cloud API / Instagram Messaging)
                                  │  webhook (HTTPS, assinado)
                                  ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  web  (Next.js, processo Node persistente)                   │
  │  • Console PWA (React Server Components)                     │
  │  • /api/webhooks/*  → valida assinatura, grava, enfileira    │
  │  • /api/stream      → SSE por tenant (tempo real)            │
  └───────┬──────────────────────────────────┬───────────────────┘
          │ SQL (rede privada)               │ Redis (pub/sub + filas)
          ▼                                  ▼
  ┌───────────────┐                  ┌──────────────────┐
  │  Postgres 18  │◄─────────────────┤  Redis           │
  │  + pgvector   │                  │  BullMQ + pubsub │
  │  + FTS pt-BR  │                  └────────┬─────────┘
  └───────────────┘                           │
          ▲                                   ▼
          │                   ┌───────────────────────────────────┐
          └───────────────────┤  worker  (Node, BullMQ consumers) │
                              │  • ingestão de mensagens          │
                              │  • orquestração de IA             │
                              │  • envio para os canais           │
                              │  • análise de aprendizado         │
                              │  • rollups de métricas / custo    │
                              └───────────────────────────────────┘
```

**Por que Railway e não Vercel para o `web`.** O produto não é um site com tráfego
anônimo: é um painel autenticado com SSE, filas e um banco relacional pesado. Manter
`web`, `worker`, Postgres e Redis no mesmo projeto Railway nos dá (a) rede privada — a
renderização no servidor não atravessa a internet pública a cada consulta, (b) processos
persistentes, o que torna SSE e BullMQ triviais em vez de um problema de arquitetura,
(c) pooling de conexão previsível, sem o problema clássico de serverless esgotar o
Postgres, e (d) — o mais importante para o §33 da missão — **uma única superfície de
log e métrica** quando alguém perguntar "por que essa mensagem não foi enviada?".
A Vercel continua sendo o lugar natural para um futuro site institucional.

## 3. Monorepo

```
apps/
  web/         Next.js — Console, Backoffice, webhooks, SSE
  worker/      Consumidores BullMQ
packages/
  shared/      Tipos, erros, logger, env, utilidades sem dependência de runtime
  db/          Schema Drizzle, migrations, cliente, contexto de tenant (RLS)
  core/        Domínio: conversas, agente, conhecimento, canais, uso/custo
  ui/          Design system: tokens, primitivos, gráficos, marca
```

`core` não sabe o que é HTTP. `web` e `worker` são apenas duas formas de acionar o
mesmo domínio. É isso que permite que uma mensagem seja processada de forma idêntica,
venha ela de um webhook real ou de um teste automatizado.

## 4. Multi-tenancy — isolamento estrutural, não disciplinar

Toda tabela de domínio carrega `tenant_id`. Confiar em um `WHERE tenant_id = ?`
escrito à mão em cada consulta é o modo conhecido de vazar dados entre empresas:
basta esquecer uma cláusula, uma vez.

Usamos **Row-Level Security do Postgres**. A aplicação conecta com um papel sem
`BYPASSRLS`, e todo acesso ao banco acontece dentro de:

```ts
await withTenant(tenantId, async (tx) => { /* ... */ })
// abre transação, executa SET LOCAL app.tenant_id = '<uuid>', roda o callback
```

As políticas comparam `tenant_id` com `current_setting('app.tenant_id')`. Uma consulta
sem contexto de tenant não retorna linhas — ela falha de forma segura, em vez de
retornar o banco inteiro. Operações de plataforma (backoffice) usam um caminho
explícito e auditado, nunca o mesmo caminho do console.

## 5. Dados

**Postgres 18.6** com `vector 0.8.6`, `pg_trgm`, `unaccent`, `pgcrypto`, `btree_gin`,
e configuração de full-text search `portuguese` — todos verificados na instância real.

Recuperação de conhecimento é **híbrida**: full-text em português (com `unaccent`,
para que "acougue" encontre "açougue") combinado com similaridade vetorial por
embeddings, fundidos por *reciprocal rank fusion*. FTS sozinho já resolve bem uma base
curada de algumas centenas de itens; o vetor cobre a pergunta feita com outras palavras.
Nenhum dos dois depende do outro para funcionar.

Drizzle como ORM: tipagem real e migrations em SQL versionado e legível — importante
porque as políticas de RLS e os índices vetoriais são SQL que queremos ler e revisar,
não gerar às cegas.

## 6. Ingestão de mensagens — o caminho crítico

A Meta reenvia webhooks, entrega fora de ordem e duplica. O caminho de entrada precisa
ser rápido e idempotente, ou o cliente recebe respostas duplicadas.

1. `POST /api/webhooks/meta/whatsapp` — valida `X-Hub-Signature-256` em tempo constante.
   A rota é **estática**, não `/meta/:channel` como este documento supunha: a Cloud API
   configura uma única URL de callback por app, e quem revela o canal é o
   `phone_number_id` dentro do payload.
2. Grava o payload bruto em `webhook_events` com chave única `(provider, external_id)`.
   Se já existe, responde `200` e para. **Essa é a idempotência.**
3. Enfileira o `webhook_event.id`. Responde `200` em milissegundos.
4. O worker resolve tenant → canal → contato → conversa → mensagem, em uma transação,
   e publica no Redis para o SSE atualizar a Inbox ao vivo.
5. Só então decide se a IA deve responder.

Falhas do passo 4 em diante têm retry com backoff exponencial e terminam em uma fila
morta visível no Backoffice, com ação de reprocessar. Nada some em silêncio.

**Por que o passo 3 não é negociável.** A Meta reenvia o que demora e desativa o webhook
de quem falha de forma repetida — e desativar derruba todos os canais de todos os
clientes, não só o que causou o problema. Medido neste projeto: resolver o canal e chamar
a IA dentro da requisição levou **14,2 s**; gravar e enfileirar leva **0,15 s**.

Isso não contradiz a regra de que a resposta do agente não passa por fila (§ `core/queue`).
Ela vale para o Simulador, onde quem espera do outro lado do HTTP é a pessoa usando o
console. No caminho da Meta quem espera é a Meta, e o cliente recebe a resposta por um
envio próprio — a fila não acrescenta nada à espera dele.

O corolário é que `200` significa "recebi e guardei", não "processei".

## 7. Camada de IA

Nenhuma chamada a fornecedor de IA acontece fora de `core/ai`. A interface é nossa:

```
AgentRuntime
  ├── ModelRouter      escolhe o modelo por tarefa, custo e disponibilidade
  ├── Provider[]       adaptadores (OpenAI hoje; outros sem tocar no domínio)
  ├── ContextBuilder   monta o contexto mínimo suficiente — não o histórico inteiro
  ├── ToolRegistry     ferramentas com contrato, autorização e auditoria
  ├── Grounding        recuperação da base + regra de "não sei"
  └── UsageRecorder    tokens, custo, latência, modelo, versão do agente
```

Cada execução do agente grava uma linha em `ai_runs`: modelo, ferramentas chamadas,
tokens, custo em milésimos de centavo, latência, confiança, versão do agente. É isso
que alimenta analytics, custo por conversa e a pergunta "a qualidade caiu depois da
mudança X?".

**A IA nunca é fonte da verdade.** Fatos vêm da Base de Conhecimento ou de ferramentas.
Se a recuperação não trouxer suporte suficiente, o agente assume a limitação e oferece
caminho humano. Isso é uma regra de código no `Grounding`, não uma instrução de prompt
que o modelo pode ignorar.

## 8. Aprendizado sem autocontaminação

Conversa **nunca** vira conhecimento automaticamente. O ciclo é:

```
atendimento → sinais → agregação → sugestão → revisão humana → publicação versionada
```

Sinais são eventos objetivos e detectáveis: recuperação sem resultado, confiança baixa,
handoff pedido pelo cliente, humano corrigiu a resposta, mesma pergunta repetida por
N clientes em X dias. Eles se acumulam em `knowledge_suggestions`. Só um humano com
permissão publica. Toda publicação cria uma nova versão imutável do item.

## 9. Tempo real

SSE (`/api/stream`), não WebSocket. Um canal por tenant, autenticado pela mesma sessão
do console, alimentado por Redis pub/sub. É unidirecional — que é exatamente a forma do
problema, já que toda escrita passa por server actions. Menos peças móveis, reconexão
nativa do browser, e funciona atrás de qualquer proxy.

## 10. Segurança

- Sessão opaca em cookie `httpOnly` / `SameSite=Lax` / `Secure`, com hash no banco.
  Senha com Argon2id. Sem JWT no cliente — revogação precisa ser imediata.
- Autorização em duas camadas: guarda no servidor por permissão (a verdade) e
  ocultação de UI (conveniência). Nunca apenas a segunda.
- Segredos de canal (tokens Meta) cifrados em repouso com chave da aplicação.
- Webhooks com assinatura verificada, rate limit por IP e por tenant.
- Auditoria: toda operação relevante grava ator, ação, alvo, antes/depois, IP.

## 11. LGPD

Retenção configurável por tenant, exclusão e exportação por titular implementadas como
operações reais — não uma página de política. O que enviamos ao modelo é registrado,
para que a pergunta "quais dados desse cliente saíram da plataforma?" tenha resposta.

## 12. Ambientes

| Ambiente | Banco | Uso |
|---|---|---|
| `development` | Railway env `development`, exposto por proxy TCP | Máquina local |
| `production` | Railway env `production`, apenas rede privada | Produção |

`staging` será criado quando houver algo a homologar — não faz sentido manter um
terceiro par Postgres+Redis ocioso agora.
