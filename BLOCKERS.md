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

**RESOLVIDO em 2026-09-04 no que depende do webhook.** App `OTTO`
(`1864610901368671`) inscrito na WABA de teste (`1389511429271679`), campo
`messages` assinado, `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` no Railway.
Conferido por `GET /<APP_ID>/subscriptions`, que devolve `active: true` e
`fields: [messages]`. A Verificação de Negócios continua sendo o prazo longo,
mas ela **não** bloqueia o número de teste.

**Armadilha registrada:** inscrever o app na WABA e assinar o campo `messages`
são passos diferentes. Faltando o segundo, o painel mostra URL verificada,
permissões "Pronto para teste" e app inscrito — e nada chega. Ver `docs/META.md`.

**Feito em 2026-09-04 — o webhook oficial está no ar.**
`POST/GET https://otto.aionixdev.com/api/webhooks/meta/whatsapp`
(`apps/web/src/app/api/webhooks/meta/whatsapp/route.ts`). Suporta o aperto de mão
de verificação e a recepção de eventos, com assinatura conferida, registro bruto
em `webhook_events` e deduplicação por hash do corpo. O
`META_WEBHOOK_VERIFY_TOKEN` de produção foi gerado pelo próprio Railway
(`${{secret(64)}}`) no serviço `web` — nunca passou por chat nem por shell. Ver
`docs/META.md` para o passo a passo do painel da Meta.

**Quando voltar:**
1. business.facebook.com → criar portfólio de negócios → **submeter a
   Verificação de Negócios** (é esta etapa que demora)
2. developers.facebook.com/apps → criar app → adicionar o produto WhatsApp
3. WhatsApp → Configuration → Webhook: colar a URL acima e o Verify Token
   copiado do Railway; assinar o campo `messages`
4. Traga o `App Secret` (Configurações → Básico) — enquanto ele não estiver em
   `META_APP_SECRET`, a rota aceita a verificação mas **recusa evento** com
   `401`, porque não teria como provar que veio da Meta

---

## B3 · Envio pelo WhatsApp — recebimento RESOLVIDO, envio pendente

**Recebimento: resolvido em 2026-09-04.** O número de teste está cadastrado como
canal em produção e a cadeia inteira foi verificada **no ambiente real**:

- Canal `whatsapp` `1307560649104617` (`+1 555-204-7561`) na empresa `aionixdev`,
  cadastrado pelo arranque do worker (`packages/db/src/cadastrar-canal.ts`).
- Evento assinado com o App Secret real → `200` em 0,52 s → log do worker em
  produção: `mensagem recebida` → `evento da Meta processado`.

**O que ainda falta: o envio.** `despachar()` em
`packages/core/src/channels/envio.ts` continua lançando erro explícito para
`whatsapp` — o adaptador da Cloud API não está escrito. A resposta do agente é
gerada e fica gravada na conversa, mas **não chega ao cliente**, e a Inbox mostra
o motivo.

**Duas coisas travam o envio, e a segunda é sua:**

1. **O adaptador** (`POST /<phone_number_id>/messages`) — trabalho nosso, não
   depende de ninguém.
2. **Um token que não expire.** O token temporário da tela API Setup dura 24 h;
   um envio que para de funcionar no dia seguinte é pior que não ter envio.
   Precisa de um **System User token** (Business Settings → Usuários do sistema →
   gerar token com `whatsapp_business_messaging` e `whatsapp_business_management`).

**E uma terceira, antes de guardar qualquer token:** a coluna
`channels.credentials` promete cifragem AES-256-GCM com `ENCRYPTION_KEY`, e essa
cifragem **ainda não existe no código**. Escrever o adaptador sem ela significaria
gravar segredo em texto claro numa coluna que a Inbox lê. A ordem certa é:
cifragem → token → adaptador.

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

## ~~B6 · Primeiro deploy em produção~~ — RESOLVIDO (2026-09-03)

Produção está no ar em **<https://web-production-1c38b.up.railway.app>**
(`/api/saude` responde `{"ok":true,"banco":"ok"}`).

O que foi feito, na ordem: o Alan executou o **Sync** no dashboard (o único
passo sem API — ver o histórico abaixo); as variáveis de produção foram
reconfiguradas, porque o Sync as sobrescreveu com as do `development`, inclusive
os segredos, que os dois ambientes **não** podem compartilhar; o worker migrou o
banco no arranque (papéis + migrações em 277 ms); o `web` subiu e ganhou
domínio; e a primeira empresa foi provisionada.

**Ficou uma dívida pequena, deliberada:** `SESSION_SECRET_PROD` e as
`PROVISIONAR_*` continuam no serviço `worker` de produção. As `PROVISIONAR_*`
podem ser apagadas assim que o login for confirmado — o script é inerte sem
elas. `SESSION_SECRET_PROD` existe porque o Railway só resolve `${{secret()}}`
na **criação** de uma variável, nunca na atualização: para trocar um segredo já
existente é preciso criar uma variável nova e referenciá-la. Apagar a auxiliar
depois quebraria a referência.

**Nota de operação para o próximo ambiente:** o Sync do Railway copia as
variáveis do ambiente de origem por cima das do destino. Depois de qualquer
Sync, conferir `DATABASE_*`, `REDIS_URL`, `SESSION_SECRET` e `ENCRYPTION_KEY` —
os nomes dos serviços de banco mudam entre ambientes (`postgres` vs
`postgres-nm6t`) e as URLs quebram silenciosamente.

---

## Histórico · o passo do dashboard que não tem API

Alvo decidido pelo Alan em 2026-09-03: **Railway, ambiente `production`.**

**O que já está pronto** (feito nesta sessão, nada pendente da sua parte):

- Código publicado no GitHub — `main` em `499a11c`.
- As **variáveis de `production` estão configuradas** em `web` e `worker`:
  `APP_ENV`, `LOG_LEVEL`, `APP_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`,
  `REDIS_URL` e as três URLs de banco. Os segredos foram gerados pelo próprio
  Railway (`${{secret(64)}}`), então nunca passaram por um chat nem por um
  histórico de shell. `web` referencia `worker` para os dois compartilharem
  exatamente os mesmos valores.
- **O banco se prepara sozinho no arranque** (`apps/worker/arrancar.sh`):
  `bootstrap` cria os papéis `otto_app` / `otto_platform`, `migrate` aplica o
  que falta, e só então o worker sobe. Com `set -e`, falha na preparação derruba
  o deploy. **Validado em `development`**: papéis criados, migrações em 10 ms,
  "worker no ar".

**O único bloqueio, e por que é seu:** o ambiente `production` contém apenas
`Postgres-NM6T` e `Redis-Y70L`. Os serviços `web` e `worker` existem no projeto
mas **não têm instância nesse ambiente**, e adicioná-los é a operação **Sync**,
que a documentação do Railway descreve como fluxo de dashboard — não há API nem
CLI para ela. Confirmado por quatro caminhos: `railway up` e o `deploy` do MCP
devolvem `404 Not Found`; `connect_service_source` devolve
`ServiceInstance not found`; `create_service` recusa com "already exists in this
project".

**O que fazer (≈4 cliques):**

1. Abra o projeto `otto` no Railway e selecione o ambiente **production**.
2. Clique em **Sync** no topo do canvas e escolha **development** como origem.
3. Marque **apenas** `web` e `worker` — os bancos de produção já existem e não
   devem ser sobrescritos.
4. Revise as *staged changes* e clique em **Deploy**.

O worker vai migrar o banco de produção no arranque, sozinho. Depois disso
sobram três passos que eu faço: gerar o domínio do `web`, criar o acesso do Alan
(B7) e validar por `GET /api/saude` e um login real.

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

## B9 · A Bia contradiz o humano que acabou de responder

**Encontrado no teste ao vivo de 2026-09-05**, conversa
`01a0727a-23fc-7525-a39d-d9d6ec532f77`:

| Hora | Quem | Mensagem |
| --- | --- | --- |
| 13:54 | cliente | Qual o preço do cuscuz? |
| 13:54 | Bia | Essa informação eu não tenho confirmada aqui. Vou chamar alguém… |
| 13:55 | **Alan (humano)** | **o cuscuz está 4,99.** |
| 13:55 | cliente | Show, quanto tá o cuscuz mesmo? |
| 13:55 | Bia | Essa informação eu não tenho confirmada aqui. Vou chamar alguém… |

A Bia oferece chamar a pessoa que respondeu quarenta segundos antes.

**Por que acontece:** `atendimento.ts` suprime o aviso quando
`conversa.status === 'aguardando_humano'`. Devolver o atendimento para a Bia
limpa esse status, então a supressão não vale mais. Mecanicamente correto,
errado para quem está do outro lado.

**A causa de fundo:** a guarda pergunta *"a conversa está esperando humano?"*
quando o que ela quer saber é *"já dissemos a esta pessoa que não sabemos
disto?"*. São coisas diferentes, e o `status` só coincide com a segunda
enquanto ninguém devolve a conversa.

**Direção provável:** amarrar o aviso ao assunto e não ao status — não repetir
para uma pergunta cujo tema já foi encaminhado nesta conversa. O sinal já é
gravado em `knowledge_signals` com a pergunta, então o dado existe.

---

## B10 · O SSE tira o operador de onde ele está

**Encontrado no mesmo teste.** Uma aba parada em `/e/aionixdev/conversas`
navegou sozinha para `/e/aionixdev/conversas/01a0727a-…` quando chegou mensagem
nova. Ninguém clicou.

**Por que importa:** um operador lendo uma conversa pode ser jogado em outra
porque um terceiro mandou mensagem. Numa Inbox movimentada isso é inviável.

**Suspeita:** efeito do `router.refresh()` do componente `AoVivo` combinado com
alguma seleção padrão da rota de conversas. É regressão introduzida junto com o
SSE (`526ac5b`), não comportamento antigo.

**Quando voltar:** reproduzir com duas abas, confirmar se a rota
`/e/[empresa]/conversas` redireciona para a conversa mais recente, e se sim
torná-lo inicial-apenas em vez de a cada releitura.

---

## B8 · Deploy não dispara sozinho — pendência de infraestrutura

**O que acontece:** empurrar para `main` **não** gera deploy. Verificado em
2026-09-05: `main` foi de `526ac5b` para `44792bf` e o último deploy de
produção continuou sendo `fe9abe0d`, das 04:21 UTC. Vale para `web` e `worker`.

**Por que importa:** hoje o deploy depende de alguém lembrar de disparar à mão,
e o sintoma de esquecer é silencioso — o código está no `main`, os testes
passaram, e produção segue rodando outra coisa. Foi exatamente essa a confusão
que custou meia sessão hoje: comparar comportamento de produção com código que
nunca tinha sido implantado.

**Não bloqueia entrega:** o deploy manual pelo Railway funciona.

**Quando voltar:** conferir no dashboard, em cada serviço, se há repositório e
**branch** conectados (Settings → Source) e se o webhook do GitHub está ativo. O
`get_service_config` mostra `Source repo` no `worker` mas **nenhuma fonte** no
`web`, o que sugere que o `web` perdeu a conexão no Sync do B6 — o mesmo Sync
que sobrescreveu as variáveis.

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
- **O mesmo telefone vira dois contatos.** Em produção há `Alan Araújo` com
  `559491205078` (12 dígitos) e `Alan` com `5594991205078` (13). É a mesma
  pessoa, com normalizações diferentes do número — provavelmente da troca de
  canal. O efeito em métrica é direto: "clientes atendidos" conta dois onde há
  um. Precisa de normalização E.164 na identidade do contato, e de uma fusão
  para os cadastros já duplicados.
- **Rotação de segredos — decidida contra.** `SESSION_SECRET`, `ENCRYPTION_KEY`,
  as senhas do Postgres, a `OPENAI_API_KEY` e o `META_APP_SECRET` passaram por
  chat em texto claro. O Alan decidiu em 2026-09-05 **não rotacionar**, e as
  variáveis seguem como estão. Fica registrado como decisão tomada, não como
  pendência — para não reaparecer a cada sessão.
- **`usage_events` não registra fornecedor nem modelo** (só `kind`, `quantity`,
  `unit`, `cost_micro_usd`, `ref_type`, `ref_id`, `local_date`, `occurred_at`).
  Provar que os embeddings de produção vieram do modelo real exigiu inspecionar
  a estrutura dos vetores em vez de ler a auditoria. Duas colunas resolveriam.
- **Não há como distinguir embedding real de simulado sem inspecionar vetor.**
  O banco de `development` rodou meses com vetores do `ProvedorSimulado` — que
  são aleatórios — enquanto o `BLOCKERS.md` registrava "9/9 com embedding". Ter
  vetor não é ter vetor útil. Valeria gravar o modelo em `knowledge_chunks` e
  recusar recuperação semântica quando ele não for o esperado.
