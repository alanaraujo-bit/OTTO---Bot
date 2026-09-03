# Decisões técnicas

Registro curto do que foi decidido, por quê, e o que faria a decisão mudar.
Uma entrada por decisão estrutural. Não documentamos escolhas triviais.

---

## D001 · Hospedar tudo no Railway, não dividir com a Vercel
**2026-09-02 · aceita**

O `web` (Next.js), o `worker`, o Postgres e o Redis ficam no mesmo projeto Railway,
na mesma rede privada.

A alternativa considerada era Next.js na Vercel com banco no Railway. Ela custa caro
em três frentes: toda renderização no servidor atravessa a internet pública via proxy
TCP; o pooling de conexão em ambiente serverless vira problema nosso, sem PgBouncer;
e a operação passa a ter duas superfícies de log, o que atrapalha exatamente o
requisito de observabilidade da missão (§33). O ganho da Vercel — CDN global e URLs de
preview — vale pouco para um painel autenticado sem tráfego anônimo.

*Mudaria se:* surgir superfície pública de alto tráfego (site institucional, páginas
de campanha). Nesse caso ela vai para a Vercel, separada, e não arrasta o console.

---

## D002 · Isolamento de tenant por Row-Level Security do Postgres
**2026-09-02 · aceita**

Políticas RLS comparando `tenant_id` com `current_setting('app.tenant_id')`, definido
por `SET LOCAL` dentro de uma transação, através de um único helper `withTenant`.

Isolamento por convenção — lembrar do `WHERE tenant_id = ?` em toda consulta — falha
uma vez e vaza dados entre empresas. Com RLS, esquecer a cláusula retorna zero linhas
em vez de retornar tudo. A falha passa a ser segura por construção.

Custo real: o papel da aplicação não pode ter `BYPASSRLS`, migrations e rotinas de
plataforma precisam de um caminho explícito e separado, e retrofitar RLS em quarenta
tabelas depois seria doloroso — por isso a decisão é tomada agora, antes do schema.

*Mudaria se:* a sobrecarga de RLS se mostrar significativa em consultas analíticas
pesadas. Nesse caso, analytics migra para visões materializadas pré-agregadas por
tenant, e não para o abandono do RLS.

---

## D003 · Drizzle como ORM
**2026-09-02 · aceita**

Tipagem derivada do schema, migrations em SQL versionado e legível, e sem camada
de runtime pesada.

O ponto decisivo sobre o Prisma: aqui as partes mais sensíveis do banco são SQL —
políticas RLS, índices HNSW do pgvector, índices GIN de full-text, consultas de
analytics. Queremos ler e revisar esse SQL, não delegá-lo a um gerador.

---

## D004 · Recuperação de conhecimento híbrida (FTS + vetor)
**2026-09-02 · aceita**

Full-text search em `portuguese` com `unaccent`, combinado com similaridade vetorial
via pgvector, fundidos por *reciprocal rank fusion*.

Verificado na instância real: Postgres 18.6, `vector` 0.8.6, `pg_trgm`, `unaccent`,
`pgcrypto`, `btree_gin`, configuração `portuguese` presente.

Os dois caminhos são independentes de propósito. FTS resolve bem uma base curada de
centenas de itens e não depende de fornecedor externo; o vetor cobre a pergunta feita
com palavras diferentes das do documento. Se a geração de embeddings estiver
indisponível, a recuperação degrada para FTS puro em vez de parar.

---

## D005 · Autenticação própria, sessão opaca em banco
**2026-09-02 · aceita**

Argon2id para senha, token de sessão opaco com hash no Postgres, cookie `httpOnly` /
`SameSite=Lax` / `Secure`.

JWT no cliente tornaria a revogação imediata impossível — e "suspender uma empresa"
e "remover um atendente" precisam ter efeito agora, não na expiração do token.
Terceirizar autenticação traria lock-in em um ponto que é núcleo do produto
multiempresa, e o modelo de papéis e permissões seria nosso de qualquer forma.

---

## D006 · SSE para tempo real, não WebSocket
**2026-09-02 · aceita**

Um canal SSE por tenant em `/api/stream`, alimentado por Redis pub/sub.

O tráfego em tempo real é unidirecional: o servidor avisa o navegador. Toda escrita já
passa por server actions autenticadas. SSE tem reconexão nativa do navegador, atravessa
qualquer proxy e não exige protocolo próprio de heartbeat e reconexão.

*Mudaria se:* aparecer necessidade real de bidirecionalidade de baixa latência —
indicador de "digitando" entre operadores, por exemplo, seria o primeiro candidato.

---

## D007 · Camada própria de orquestração de IA
**2026-09-02 · aceita**

Nenhuma chamada a fornecedor de IA fora de `core/ai`. Fornecedores são adaptadores
atrás de uma interface nossa; o domínio nunca importa um SDK de fornecedor.

A missão (§14) exige poder trocar de modelo e fornecedor. Além disso, a contabilidade
de custo por tenant (§19) precisa ser inviolável: se qualquer parte do código puder
chamar um modelo direto, o custo deixa de fechar.

Primeiro fornecedor: OpenAI, com chave própria do operador.

---

## D008 · Codinome "Otto", isolado em um arquivo
**2026-09-02 · aceita**

Nome comercial ainda indefinido. Toda a identidade fica em `packages/ui/src/brand.ts`.
Nenhuma string de marca aparece direto em componente ou copy.
