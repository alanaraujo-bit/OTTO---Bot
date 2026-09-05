# Meta — WhatsApp Cloud API

Como o produto conversa com a Meta, e o que precisa estar configurado para isso
funcionar. Complementa o B2 e o B3 do `BLOCKERS.md`.

## A URL de callback

```
https://otto.aionixdev.com/api/webhooks/meta/whatsapp
```

Uma única URL por app da Meta, para todos os clientes e todos os números. Não há
identificador de empresa no caminho — quem revela o canal é o `phone_number_id`
que vem dentro do payload, resolvido contra `channels.external_id`.

Isso é uma correção deliberada ao desenho original, que previa
`/api/webhooks/meta/:channel`: a Cloud API simplesmente não oferece esse ponto de
extensão.

O domínio do Railway (`web-production-1c38b.up.railway.app`) atende a mesma rota
e continua valendo como reserva, mas o domínio oficial é o que deve ser colado na
Meta — trocar de host depois exige reverificar o webhook.

## Os dois segredos

| Variável | Onde nasce | Para que serve |
| --- | --- | --- |
| `META_WEBHOOK_VERIFY_TOKEN` | Nosso — gerado pelo Railway | Só o aperto de mão de verificação (`GET`) |
| `META_APP_SECRET` | Da Meta — Configurações → Básico | Assinatura de todo evento (`POST`) |

São coisas diferentes e não se substituem. O primeiro prova para a Meta que a URL
é nossa, uma única vez. O segundo prova, a cada evento, que o evento é da Meta.

**Onde ficam:**

- **Produção** — Railway, projeto `otto`, ambiente `production`, serviço **`web`**.
  Só o `web` precisa: o `worker` nunca recebe requisição HTTP.
- **Local** — `.env` da raiz do monorepo. Use um valor **próprio** de
  desenvolvimento; nunca copie o de produção para um laptop. A Meta não alcança
  `localhost`, então esse valor só existe para testar a rota manualmente.

O valor de produção foi gerado pelo próprio Railway (`${{secret(64)}}`), como os
demais segredos do projeto — ele nunca passou por um chat, por um histórico de
shell nem por este repositório. Para lê-lo: dashboard do Railway → `otto` →
ambiente `production` → serviço `web` → aba **Variables** → botão de copiar ao
lado de `META_WEBHOOK_VERIFY_TOKEN`.

Cuidado conhecido: o Railway resolve `${{secret()}}` na **criação** da variável,
nunca na atualização. Para trocar esse token é preciso criar uma variável nova e
referenciá-la — editar a existente grava a string `${{secret(64)}}` literal.

## O aperto de mão de verificação

Ao clicar em **Verificar e salvar** no painel da Meta, ela dispara:

```
GET /api/webhooks/meta/whatsapp
    ?hub.mode=subscribe
    &hub.verify_token=<o que você colou>
    &hub.challenge=<nonce que ela inventou>
```

A resposta correta é o `hub.challenge` de volta, **em texto puro**. Responder
`"1234"` com aspas de JSON reprova uma rota que parece certa — é o erro clássico
aqui, e a razão de o handler usar `new NextResponse(desafio)` em vez de
`NextResponse.json`.

Diagnóstico pelo código de status, quando algo der errado:

| Status | Significado |
| --- | --- |
| `200` + o desafio | Certo |
| `403` | Token não confere — o que foi colado na Meta difere do que está no Railway |
| `503` | `META_WEBHOOK_VERIFY_TOKEN` não está no ambiente do `web` |
| `404` | O deploy em produção não contém a rota |
| `302` | Algo está redirecionando `/api/webhooks/*` — hoje não há middleware, então não deveria acontecer |

O desafio não é segredo: é um nonce público, e por isso ele **é registrado no
log**, o que torna a verificação auditável depois do clique.

## Os eventos

Depois de verificado, a Meta passa a mandar `POST` na mesma URL.

- A assinatura `X-Hub-Signature-256` é conferida em tempo constante contra o
  corpo **cru**. Sem `META_APP_SECRET` configurado, o evento é recusado com
  `401` — aceitar sem poder provar a origem abriria a ingestão para qualquer um
  que descubra a URL.
- Toda entrega vira uma linha em `webhook_events`, com `external_id` = SHA-256 do
  corpo cru. O índice único `(provider, external_id)` faz o reenvio ser um no-op.
  A idempotência por mensagem continua sendo o índice `(tenant_id, external_id)`
  usado por `receberMensagem`.
- **Sempre `200`** para o que faz sentido sintático, inclusive o que não
  interessa: confirmação de entrega, mídia ainda não suportada, número
  desconhecido. O motivo fica em `webhook_events.discard_reason`. Erro repetido
  faz a Meta desativar o webhook do app inteiro, derrubando junto os canais que
  funcionam.

## Campos a assinar

No painel do app, em **WhatsApp → Configuration → Webhook fields**, assine
`messages`. É esse campo que carrega tanto as mensagens recebidas quanto as
confirmações de entrega.

## O que ainda falta

O caminho de **entrada** está pronto. O de **saída** não: `despachar()` em
`packages/core/src/channels/envio.ts` ainda lança erro explícito para
`whatsapp`, porque não existe credencial de número. Falhar visivelmente é o
comportamento correto até o B3 — um envio que silenciosamente não acontece é pior
que um erro.

Quando o número de teste existir, cadastre-o como canal com `kind = 'whatsapp'`,
`external_id = <phone_number_id>` e o token de acesso em `credentials` (cifrado
com `ENCRYPTION_KEY`). Só então o adaptador de envio faz sentido.
