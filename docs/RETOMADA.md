# Retomada — sessão de 2026-09-05

Cole o bloco abaixo no início de um chat novo. Ele existe para a próxima sessão
não redescobrir o que esta já mediu.

---

Contexto: projeto OTTO em D:\PROJETOS\OTTO - Bot. Leia BLOCKERS.md, docs/META.md
e docs/ARCHITECTURE.md antes de agir.

Produção: https://otto.aionixdev.com, empresa `aionixdev`, Railway projeto
`otto`. WhatsApp +55 94 99132-9996 (phone_number_id 1310105588859068, WABA
5457440767815250). `main` em `c48005a`, implantado em web e worker. Suíte:
125 testes, todos passando.

**Auto-deploy funciona agora**: push em `main` implanta web e worker sozinho em
~90 s, e os deploys aparecem carimbados com o hash do commit. Não dispare deploy
manual — e se precisar, saiba que `mcp__railway__deploy` empacota o **diretório
local**, o que levaria junto o trabalho de design não commitado do Alan.

**Não commitar**: DESIGN.md, apps/web/src/app/entrar/*, packages/ui/*,
apps/web/public/marca/, packages/db/_backfill_demo.mjs, _realismo_demo.mjs. São
do Alan e estão em andamento.

## O que a sessão anterior entregou e verificou em produção

- **Fundamento semântico.** A busca vetorial devolve o cosseno (antes ordenava e
  descartava). Regra: léxico forte sozinho, OU semântica ≥ 0,40 corroborada por
  cobertura ≥ 0,20 ou trigrama ≥ 0,70. Limiares medidos por
  `packages/db/scripts/calibrar-fundamento.mjs` — 9/9 positivas, 12/12 negativas.
- **Hierarquia de autoridade** em `avaliarFundamento`: cadastro/base → fala do
  operador na conversa → nada. A fala do operador é session-scoped, com
  proveniência no texto, sem promoção a conhecimento. Sem tabela nova: `messages`
  já é o registro por sessão.
- **Cortesia** interceptada antes da barreira, resposta determinística.
- **Nunca mais silêncio** quando não sabe: avisos que escalam e recomeçam quando
  um humano fala.
- **Separação de ensaio** (`conversations.is_test`, migração 0003), auditada,
  com aba na Inbox. Métricas excluem por definição.
- **Mediana de primeira resposta** corrigida: 8759 h → 6 s.
- **Agrupamento de aprendizado por intenção** (limiar 0,65, calibrado por
  `calibrar-agrupamento.mjs`).

## Onde parou, exatamente

O agrupamento semântico foi implantado e **medido com os sinais reais**: cinco
pares se formaram (0,765–0,866), nenhum chegou a 3 ocorrências, então ainda não
há sugestão. O mecanismo está certo; falta volume.

**Duas coisas ficaram decididas mas não feitas**, e o Alan não respondeu:

1. Limpar os sinais de cortesia antigos. Há "Boa noite" × "Boa tarde" agrupando
   a 0,792 — resíduo de antes da correção de cortesia. Se um terceiro aparecer,
   o produto sugere criar conhecimento sobre um cumprimento.
2. Pôr uma guarda em `registrarSinal` para que cortesia nunca vire aprendizado,
   mesmo por outro caminho.

## Pendências, em ordem de peso

1. **Base com 4 itens** (horário, endereço, área de entrega, contato). É o
   gargalo real: cartão, Pix, estacionamento e promoção viram handoff por falta
   de fonte, não por falha da IA. Pedir ao Alan as informações e cadastrar.
2. **B4 — preço e estoque** (adaptador do CISS). Metade do que um supermercado
   precisa. Sem isso toda pergunta comercial vira handoff.
3. **Identidade de contato duplicada.** O mesmo telefone virou **três** contatos
   (`559491205078`, `5594991205078`, `559491190781`). Infla "clientes
   atendidos". Precisa de normalização E.164, constraint no banco, proteção
   contra corrida e merge dos existentes. É schema + migração + teste de
   concorrência — merece sessão própria.
4. **`handoffCount` histórico inflado.** A contagem foi corrigida daqui em
   diante; os valores acumulados continuam errados. Dá para recalcular a partir
   de `conversation_events`.
5. **Atribuição errada na auditoria.** Uma resposta de horário registrou
   `item: "Área de entrega"` — o fato veio da unidade, mas o trecho registrado
   não é o que respondeu. Defeito de proveniência, não de conteúdo.
6. **B10 — realtime e navegação: inconclusivo.** Uma aba mudou de conversa
   sozinha, com `pushState` do roteador. Não achei o mecanismo no código, e a
   evidência ficou comprometida porque as abas eram do navegador do Alan e o
   grupo foi fechado. Precisa de teste limpo, com abas que ninguém toca.
7. **Config do Railway não versionada.** Builder, Dockerfile, health check e
   política de reinício vivem só no dashboard — foi assim que o Sync do B6
   apagou a fonte do `web` sem ninguém notar.

## Armadilhas confirmadas nesta sessão

- **Embeddings do banco de desenvolvimento eram aleatórios** (provedor simulado)
  enquanto a doc dizia "9/9 com embedding". Ter vetor não é ter vetor útil. Os
  de produção são reais — verificado por ausência da periodicidade de 32 do
  `ProvedorSimulado`. Se for calibrar semântica, rode
  `packages/db/scripts/revetorizar-dev.mjs` antes.
- **O stemmer português é irregular**: `feriado`→`feri` mas `feriados`→`feriad`;
  `abre`≠`abrem`; `horas`→`hor` mas `horário`→`horari`. Não confie em casamento
  lexical para decidir nada sozinho.
- **`railway ssh`** funciona para diagnóstico (`.mts` para top-level await; `.ts`
  em /tmp é tratado como CJS e falha).
- O worker de development divide Redis com worker local (ver docs/META.md).

## Padrão dos sete defeitos corrigidos

Nenhum era cálculo errado. Todos eram **uma verificação correta no lugar errado
do fluxo**: a barreira de fundamento rodando antes do histórico da conversa,
antes da triagem de cortesia, ou sendo consultada depois pela conta de
confiança. Se aparecer um oitavo, provavelmente tem essa cara.

## Decisão registrada

O Alan decidiu **não rotacionar** os segredos que passaram por chat
(`SESSION_SECRET`, `ENCRYPTION_KEY`, senhas do Postgres, `OPENAI_API_KEY`,
`META_APP_SECRET`). Não reabrir o assunto.
