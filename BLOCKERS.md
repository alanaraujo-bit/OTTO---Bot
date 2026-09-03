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

## B6 · Primeiro deploy em produção — falta decisão e pré-requisitos

Pedido em 2026-09-03: "subir tudo para a produção". O trabalho está commitado
(`6587a87`), build e testes passam, mas **o deploy não foi disparado** porque o
alvo é ambíguo e o ambiente não está pronto. Nada disso é código a escrever:

1. **Dois alvos possíveis, e não dá para adivinhar.** Existe projeto na Vercel
   (`otto-bot`, `prj_1VimSTaFbviYTxrEBNWDlXIXvd4U`) e ambiente `production` no
   Railway. O último commit anterior era "Ajusta build web para Vercel", mas os
   deploys reais do Railway saíram por CLI. Qual é a produção de verdade?
2. **O `production` do Railway nunca rodou a aplicação.** Só existem lá
   `Postgres-NM6T` e `Redis-Y70L`; `web` e `worker` só têm deploy em
   `development`. Ou seja, seria o primeiro lançamento, não um redeploy.
3. **O banco de produção nunca foi migrado.** Subir o `web` contra ele entrega
   aplicação quebrada. Precisa rodar as migrations antes do primeiro deploy.
4. **Não consigo conferir as variáveis de produção** (leitura de segredo
   bloqueada, e está certo assim). Não sei se `DATABASE_URL`, segredo de sessão
   e afins estão configurados no ambiente de produção.
5. **Sem canal real, produção é uma casca.** B2 e B3 continuam abertos: sem app
   da Meta e sem número de WhatsApp, o produto em produção não recebe uma
   mensagem de cliente sequer.

**Quando voltar:** diga o alvo (Vercel ou Railway `production`). Eu rodo as
migrations, confiro as variáveis, faço o deploy e valido pelo `/api/saude`.

---

## B7 · Senha do acesso principal — a regra do próprio produto recusa

Pedido: tornar `alanvitoraraujo1a@outlook.com` / `alan123` o acesso principal.

**O e-mail eu configuro sem problema. A senha não posso usar:** `alan123` tem 7
caracteres, e a regra de senha do próprio produto
(`esquemaSenha`, em `packages/core/src/auth/senha.ts`) exige **no mínimo 10**.
Gravar esse acesso significaria furar a validação do próprio sistema — em
produção e justamente na conta de proprietário, que é a de maior poder.

Some-se a isso que não existe fluxo de "esqueci a senha" (ver Menores): se essa
senha vazar, não há autoatendimento para trocá-la.

**Quando voltar:** me passe uma frase de 10+ caracteres, ou me autorize a gerar
uma forte e te entregar. Aí eu crio o usuário como `proprietario` da empresa e
confirmo o login.

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
