## Verificação visual pelo navegador — contornado nesta sessão

**Situação:** a extensão do Claude para Chrome não pareou nesta sessão (troca de
conta). Em vez de parar, instalei o Playwright no scratchpad e inspecionei
**todas as 12 telas** (desktop 1440 + iPhone 13 Pro), nos dois temas, lendo cada
captura com os próprios olhos. Cada tela passou por crítica de um modelo
separado antes de avançar.

**O que ainda seria útil com a extensão:** inspeção manual ao vivo (hover,
foco, animação em tempo real). Para religar: confirme a extensão ativa em
`chrome://extensions` e o Chrome logado no claude.ai com a **mesma conta** do
Claude Code; reiniciar o Chrome costuma resolver.

---

# Bloqueios

O que depende de ação sua e **não pode** ser resolvido daqui. Nada nesta lista
interrompe o resto: cada item registra o que falta, o que já foi construído ao
redor dele, e o que fazer quando você voltar.

Atualizado em 2026-09-03 (após o redesenho premium do console).

---

## ~~B1 · Chave da API da OpenAI~~ — RESOLVIDO (2026-09-03)

Você forneceu a chave e autorizou. Configurada em `OPENAI_API_KEY` no `.env` da
raiz. Verificado:
- `packages/core/src/espinha.test.ts` passa (18/18) — a espinha vertical grava
  `ai_runs` com custo, modelo e latência reais.
- O Simulador responde com prosa real da Bia (desambiguação de unidade,
  fundamentação no Conhecimento, recusa educada quando não sabe). Sign-off
  visual da tela concluído.
- O worker foi consertado no mesmo passo: o script `dev` não carregava o `.env`
  (`apps/worker/package.json`: `tsx watch` → `tsx watch --env-file=../../.env`).
- Os 7 itens de conhecimento fictícios que faltavam foram indexados e
  vetorizados (`knowledge_chunks`: 9/9 com embedding).

Configurada também no Railway (projeto `otto`), via CLI autorizada por você:
`OPENAI_API_KEY` em `web` e `worker`, nos ambientes `production` e `development`.
Verificado presente nos quatro. O `web` em produção ainda não tem deploy
(projeto pré-lançamento) — a variável pega no primeiro deploy.

---

## B2 · App da Meta e Verificação de Negócios — bloqueia canais reais

**O que falta:** um app de desenvolvedor da Meta com o produto WhatsApp
adicionado, e a Verificação de Negócios submetida.

**Por que não dá para contornar:** exige identidade jurídica e documentos da
empresa. A análise leva de dias a semanas — é o único prazo do projeto que não
depende de escrever código, por isso deveria começar o quanto antes.

**O que já existe ao redor:** o canal `simulador` é de primeira classe, com o
mesmo contrato dos canais reais: mesmo webhook, mesma deduplicação, mesma fila,
mesmo agente. A cadeia inteira é exercitável e testável sem a Meta. O adaptador
do WhatsApp é escrito contra o contrato oficial da Cloud API.

**Quando voltar:**
1. business.facebook.com → criar portfólio de negócios → **submeter a
   Verificação de Negócios** (é esta etapa que demora)
2. developers.facebook.com/apps → criar app → adicionar o produto WhatsApp
3. Traga o `App Secret` (Configurações → Básico)
4. Cole em `META_APP_SECRET`; o `META_WEBHOOK_VERIFY_TOKEN` eu gero
5. Valido pelo handshake: a Meta manda um desafio e o webhook devolve

---

## B3 · Número de teste do WhatsApp — bloqueia a validação ponta a ponta real

**O que falta:** `phone_number_id` e token de acesso do número de teste.

**Por que não dá para contornar:** só a Meta emite. Depende do B2, mas **não**
depende da Verificação ser aprovada — o número de teste funciona em modo
desenvolvimento desde o primeiro dia.

**Quando voltar:** painel do app → WhatsApp → API Setup. Traga o
`phone_number_id` e o token temporário. Cadastro como canal do ambiente de teste
e mando uma mensagem do seu celular para ver chegar na Inbox.

---

## B4 · Documentação do CISS — fora do escopo atual

**O que falta:** documentação, credenciais e endpoint da API do CISS usado pelo
Supermercado Campeão.

**Situação:** deliberadamente adiado. Consultar preço, estoque e promoção existe
como **contrato de ferramenta** no registro do agente, com autorização e
auditoria. Quando a documentação chegar, implementa-se o adaptador — nada mais
do produto muda.

**Importante:** enquanto não existir, o agente **nunca** inventa preço ou
estoque. Ele diz que não tem essa informação e oferece caminho humano.

---

## B5 · Dados reais do Supermercado Campeão — bloqueia só o onboarding do cliente

**O que falta:** endereço, coordenadas, horários por unidade, feriados,
telefones, serviços, formas de pagamento e políticas — de cada unidade.

**Por que não dá para contornar:** inventar qualquer um desses dados seria a pior
falha possível neste produto, que existe justamente para não alucinar.

**O que já existe ao redor:** o modelo de dados recebe tudo isso de forma
estruturada, e o Centro de Conhecimento tem a tela para cadastrar. O ambiente de
teste usa uma empresa fictícia **declaradamente fictícia** ("Mercado Modelo"),
nunca uma imitação do Campeão. O histórico de demonstração dessa empresa é
regenerado por `packages/db/_backfill_demo.mjs` e `_realismo_demo.mjs` (não
commitados).

**Quando voltar:** peça ao Sr. Fernando os dados de cada unidade. Eu cadastro,
ou preparo uma planilha para ele preencher.

---

## B6 · Primeiro deploy em produção — bloqueado pelas permissões da sessão

Alvo decidido pelo Alan em 2026-09-03: **Railway, ambiente `production`.**
O trabalho está commitado (`6587a87`, `e73bb35`, `9a5b17a`), build e testes
passam. O deploy **não foi disparado**: quatro ações seguidas foram recusadas
pelo classificador de permissões desta sessão, todas envolvendo credenciais de
produção — criar proxy TCP no Postgres, escrever o arquivo de segredos, ler esse
arquivo. A recusa é correta em si; só não dá para concluir o deploy sem ela.

**Estado real do ambiente `production`** (levantado nesta sessão):

- Existem só `Postgres-NM6T` e `Redis-Y70L`. `web` e `worker` **nunca rodaram**
  lá — é primeiro lançamento, não redeploy.
- O serviço `web` tem **apenas** `OPENAI_API_KEY`. Falta todo o resto.
- O Postgres de produção **não tem proxy TCP** (só domínio privado), e **nunca
  foi migrado** — nem os papéis `otto_app` / `otto_platform` existem.
- Nenhum Dockerfile roda migração no arranque, apesar de `migrate.ts` dizer que
  é ali que deveria rodar.

**Runbook para concluir** (na ordem; some as senhas do histórico depois):

1. Gerar os segredos:
   `SESSION_SECRET` (48 bytes base64url), `ENCRYPTION_KEY` (32 bytes em base64,
   exatamente), e uma senha para cada papel do banco (`otto_app`,
   `otto_platform`).
2. Definir no `web` **e** no `worker` de `production`:
   `APP_ENV=production`, `LOG_LEVEL=info`, `APP_URL=<domínio do web>`,
   `SESSION_SECRET`, `ENCRYPTION_KEY`, `REDIS_URL` (o valor está no serviço
   `Redis-Y70L`), e as três URLs de banco apontando para
   `postgres-nm6t.railway.internal:5432/railway` — `otto_app` em `DATABASE_URL`,
   `otto_platform` em `DATABASE_PLATFORM_URL`, `postgres` em
   `DATABASE_ADMIN_URL`.
3. Fazer as migrações rodarem **dentro** da rede do Railway. A imagem do
   `worker` já carrega `packages/db` inteiro e roda TypeScript por `tsx`, então
   o caminho limpo é o `pre_deploy_command` do `worker`:
   `node packages/db/src/bootstrap.ts && node packages/db/src/migrate.ts`
   (`bootstrap` cria os dois papéis com a senha que já está nas URLs; ambos são
   idempotentes). Alternativa: `railway ssh` no serviço depois de subir.
4. Subir `worker` e depois `web`; gerar domínio para o `web`.
5. Validar por `GET /api/saude` e por um login real.
6. Criar o acesso do Alan — ver B7, o script já existe e está testado.

**Aviso que continua valendo:** sem canal real (B2 e B3), produção é uma casca.
Sem app da Meta e sem número de WhatsApp, o produto no ar não recebe uma
mensagem de cliente sequer.

---

## B7 · Senha do acesso principal — RESOLVIDO em desenvolvimento, pendente em produção

Pedido: tornar `alanvitoraraujo1a@outlook.com` o acesso principal, com a senha
`alan123`.

**A senha pedida foi recusada pela regra do próprio produto**, não por
preferência: `alan123` tem 7 caracteres e `esquemaSenha`
(`packages/core/src/auth/senha.ts`) exige no mínimo 10. Gravá-la seria furar a
validação do sistema na conta de maior poder. Com autorização do Alan, foi
gerada uma frase forte.

**Feito no ambiente de desenvolvimento** (verificado com login real e captura da
tela de Configurações mostrando "Alan Araújo · Proprietário"):

- `alanvitoraraujo1a@outlook.com` · **`vento-nuvem-ancora-40`**
- Papel `proprietario` na empresa `mercado-modelo`.

**Falta em produção:** depende do B6. Quando o ambiente estiver no ar, rodar
(a partir da raiz, com o `.env` de produção):

```
node --env-file=.env packages/db/src/criar-acesso.ts \
  --email alanvitoraraujo1a@outlook.com --nome "Alan Araújo" --empresa <slug>
```

Sem `--senha` ele gera uma frase forte e a imprime uma única vez. O script é
idempotente e serve para qualquer pessoa e papel.

**Ainda pendente e relacionado:** não existe fluxo de "esqueci a senha" (ver
Menores). Enquanto não existir, trocar a senha do proprietário depende de rodar
esse script.

---

## Menores (não bloqueiam nada) — para o backlog do time

- **`next lint`** está quebrado no repo inteiro (o Next 16 removeu o comando).
  Cobertura de lint hoje é zero — vale migrar para ESLint direto.
- **Fluxo real de "esqueci a senha"** para o dono não técnico: hoje o acesso é
  administrado por vocês e a tela de entrada encaminha para esse contato.
  Continua sendo uma necessidade futura.
- **Edição inline** de Conhecimento e da ficha de Cliente (renomear/anotar): as
  server actions já existem no core; falta a UI. O botão "Novo item" foi retirado
  do Conhecimento até lá.
