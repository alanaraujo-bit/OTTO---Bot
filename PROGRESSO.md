# Progresso — Redesenho premium do console

> Registro persistente para retomar o trabalho se a sessão cair.
> Atualizado continuamente pelo agente em modo autônomo.

## Objetivo

Elevar o painel administrativo (console do lojista) a nível de SaaS comercial
premium: visual rico, gráficos, animações e transições, ícones autorais, cópia
amigável para usuário não técnico, menu lateral recolhível, e PWA no celular com
sensação de app nativo (sem zoom acidental, sem seleção de texto na cromagem, sem
rubber-band de rolagem). Vale para desktop **e** celular.

## Método (por tela)

1. Arquitetar + implementar a melhor versão possível.
2. `pnpm --filter @otto/web build` / typecheck limpos.
3. Screenshot real (desktop 1440 + iPhone 13 Pro) via Playlwright em
   `scratchpad/shot.mjs`, ler com os próprios olhos.
4. Crítica por outro modelo (advisor + subagente crítico). Só avança com aprovação.
5. Corrigir → re-screenshot → avançar.

## Ambiente

- App web: `pnpm dev` (turbo) — <http://localhost:3000>. `.env` da raiz OK (DB/Redis Railway).
- Login de teste: `dono@mercadomodelo.teste` / `ambiente-de-teste-2026` — empresa `mercado-modelo`.
- Seed: `node --env-file=.env packages/db/src/seed.ts` (idempotente). 47 conversas, 82 msgs.
- Screenshot: `cd scratchpad && MSYS_NO_PATHCONV=1 node shot.mjs <rota> <nome>`.
- Playwright instalado no scratchpad (fora do monorepo).

## Telas (ordem)

| # | Tela | Rota | Status |
|---|------|------|--------|
| 0 | Fundação: tokens de movimento (`--dur-*`, `.entra`, `.realce-vivo`, `brilho`), primitivos `Cartao`/`Esqueleto`/`Anel`, gráficos `GraficoAtividade`/`GraficoHoras`, métricas `serieUltimosDias`/`distribuicaoPorHora`/`faixasDePico` | `packages/ui`, `packages/core/metricas/painel.ts` | feito (typecheck limpo) — revisar junto da Home |
| 1 | Início / Home — reescrita completa. Saudação por horário, painel "Agora" com prévia, anel de resolução, gráfico de movimento + insight, horários de pico, assuntos, faixa de atenção. | `/e/[empresa]` | **APROVADO** (2 rodadas de crítica). v8 desktop+celular OK. |
| 12 | Shell: barra lateral recolhível (persist. `otto:menu-recolhido`), trilho de ícones com tooltip, indicador de ativo (barra à esquerda), **menu do celular** (sheet que sobe, todas as seções + troca de empresa + tema + sair, trava rolagem), transição de tela no celular (`key={pathname}` + `.entra`), ícone de "Atendente virtual" trocado de robô → headset. | `componentes/shell.tsx`, `navegacao.ts` | 1ª passada feita — revisar detalhes no passe dedicado |
| 2+3 | Conversas (inbox) + conversa — busca com debounce, abas com contadores (`contarConversas`), linhas com avatar + selo de canal + prévia + etiqueta inline, estado vazio do desktop = "central da fila" (título + 3 números + fila), conversa com separadores de dia + avatar no cabeçalho + msg de sistema centralizada, **modo imersivo no celular** (shell esconde cabeçalho + barra inferior dentro de uma conversa). | `/e/[empresa]/conversas` | implementado — v6/vp OK, aguardando crítica |
| 4 | Clientes — lista larga (`max-w-5xl`) com busca, prévia da última mensagem, etiqueta "Esperando", contagem e horário; **ficha do cliente** (`/clientes/[id]`): resumo + observações + histórico linkável. Bugs corrigidos: `detalharCliente` e `listarClientes` reescritos como `tx.execute` cru (subconsulta correlata do drizzle devolvia 0/errado); `first_seen_at`/agregados do contato sincronizados; carimbos futuros do demo corrigidos. `formatarTelefone` em `@otto/ui`. | `/e/[empresa]/clientes` | **APROVADO** (crítico pré-aprovou após largura+data; ambos corrigidos) |
| 5 | Conhecimento — lista larga + resumo + busca + filtro segmentado, tabela/cards responsivo, ficha do item com status explicado + resposta + aliases + versões. `em_aprovacao` → âmbar. Demo: 11 itens, usos/versões sincronizados. | `/e/[empresa]/conhecimento` | **APROVADO** |
| 6 | Melhorias — abas, cartões de sugestão com selo de frequência, evidência linkada, "Escrever resposta" (primário, exige texto humano) / "Não é necessário", revisadas com "Virou conhecimento". | `/e/[empresa]/melhorias` | **APROVADO** |
| 7 | Atendente virtual — 2 colunas: controles em `Cartao` + **prévia ao vivo** que monta uma amostra de conversa conforme os ajustes (`componentes/atendente/previa.tsx`). Escalas viram controle segmentado (espectro). Barra de publicação sólida. | `/e/[empresa]/atendente` | **APROVADO** |
| 8 | Análise — reescrita no sistema da Home: período, KPIs + variação, anel, gráfico de movimento, custo, assuntos com barras de proporção reais, faixa → Melhorias (cópia reconciliada). | `/e/[empresa]/analise` | **APROVADO** |
| 9 | Simulador — 2 colunas: chat (mensagens ancoradas embaixo + "digitando…", balões italic/tracejado p/ handoff) + painel "O que está sendo testado". | `/e/[empresa]/simulador` | **APROVADO** — prosa real da Bia validada (chave OpenAI configurada) |
| 10 | Configurações — seções em `Cartao`, `formatarTelefone` em tudo, fuso amigável, linhas empilham no celular. Só leitura. | `/e/[empresa]/configuracoes` | **APROVADO** |
| 11 | Entrar / login — cartão com presença (borda + sombra), marca + tagline, botão sempre em cor de marca, tema nos dois modos. Sóbrio e centrado. | `/entrar` | implementado — v1/vp/dark OK, aguardando crítica |
| 12 | Shell — barra recolhível, trilho de ícones, indicador de ativo, menu do celular (sheet), transição de tela, robô → headset, **modo imersivo no celular** na conversa. | `componentes/shell.tsx` | feito (revisado junto de todas as telas) |

## Decisões

- (inicial) Mantida a decisão de não bloquear pinch-zoom (acessibilidade). O
  "parecer app" vem de `touch-action: manipulation`, `overscroll-behavior: none`,
  `-webkit-tap-highlight-color: transparent` e `user-select: none` só na cromagem
  (já em `styles.css` `.app-shell`). Não foi revertido.
- **Ícones:** mantido o Lucide traço único em toda a interface funcional. Não foi
  feito ícone "desenhado à mão" nem ilustração de estado vazio — DESIGN.md e
  PRODUCT.md vetam explicitamente (robôs, brilhos, ilustração na entrada), e o
  próprio pedido do cliente ("não genérico", "sem cara de IA") é sobre a
  superfície inteira parecer carimbada, não sobre a biblioteca. O "premium" vem
  de alinhamento, ritmo tipográfico, firmeza de estado e movimento com propósito.
- **Gráficos:** liberados pelo próprio PRODUCT.md (Operating Context cita
  tendência, horário de pico e agrupamento por assunto como valor da Home).
  Feitos em SVG inline na paleta quente, sem biblioteca — mesmo idioma do
  `grafico-barras.tsx` existente.
- **Dados de demonstração:** `packages/db/_backfill_demo.mjs` (fora do seed
  oficial; NÃO commitado) popula ~45 dias de histórico fictício da "Mercado
  Modelo" para os gráficos terem o que mostrar. Rodar: `node --env-file=.env
  packages/db/_backfill_demo.mjs` (de `packages/db`). `--clear` só limpa. Marca
  as linhas com `summary='[demo]'`.
- **Home usa `Cartao`** — decisão do `Indicador` ("deliberadamente não é um
  card") continua válida para número solto dentro de um painel; o `Cartao`
  agrupa uma unidade de leitura com título e região própria, que é outra coisa.

## Padrões da casa (reusar nas próximas telas)

- **Linha de dois cartões (8/4 ou 6/6):** as alturas se acoplam no grid. Para o
  cartão mais curto não criar um vazio, o corpo dele distribui o conteúdo:
  `<Cartao corpoClassName="flex flex-col justify-between">` + `mt-auto` no rodapé.
  Cada cartão precisa **merecer a própria altura** — se sobra espaço, falta
  conteúdo ou o cartão é largo demais.
- **Entrada da tela:** classe `.entra` + `style={{'--atraso':'Nms'}}` escalona
  seções. Só acima da dobra. No shell, `<main key={pathname} className="max-md:entra">`
  dá a transição de tela no celular.
- **Gráficos:** SVG inline, paleta `bg-marca/NN`, sem lib. Toda leitura tem uma
  frase em linguagem de dono antes do gráfico.
- **Números:** `data-numerico` + `tabular-nums`.
- **Largura do conteúdo:** o `<main>` do shell expõe `--w-conteudo` (84rem →
  92rem quando a barra recolhe) e `--w-conteudo-amplo` (104rem → 112rem).
  Recolher a barra **aumenta o conteúdo**, não a margem. Não use `max-w-*` cru
  numa página: use `<Pagina largura>` / `<PaginaLista largura>`, que traduzem
  `padrao` / `amplo` / `leitura` para esses tokens.
- **Enquadramento das telas (`componentes/pagina.tsx`):** no desktop a janela não
  rola — o `main` trava em `h-dvh` com `overflow-hidden` e cada tela cuida da
  própria rolagem. Duas formas, e só duas:
  - `<Pagina>` — a tela inteira rola dentro de si (painel, formulário, leitura).
  - `<PaginaLista>` + `<CartaoRolavel>` — cabeçalho e busca ficam presos no topo
    e só a lista corre por dentro do cartão. `CartaoRolavel` usa `max-h-full`
    (não `flex-1`): lista curta fecha na própria altura, lista longa enche a tela
    e rola. Um cabeçalho de tabela passado em `fixo` gruda no topo da rolagem.
  No celular as duas viram rolagem normal de documento.
- **`rolagem` é `@utility`, não classe em `@layer utilities`.** Precisa aceitar
  variante (`md:rolagem`); classe escrita à mão em `@layer` não gera `md:`.
- **Linha de lista larga:** com 84rem+ de largura, empilhar nome sobre prévia
  deixa metade da linha vazia até a coluna da direita. Nome e prévia dividem a
  linha num grid (`md:grid-cols-[minmax(0,Xrem)_minmax(0,1fr)]`) e voltam a
  empilhar no celular. Vale para Clientes, Conhecimento e a fila do Início.
- **`prefetch={false}` em toda linha de lista.** O Next faz prefetch de todo
  `<Link>` no viewport; com 47 conversas isso vira 47 renderizações de página no
  servidor de uma vez. Com `prefetch={false}` o prefetch passa para o
  hover/toque. Vale para conversas, clientes, conhecimento e as filas do Início.
- **Barra de gráfico tem largura máxima** (`max-w-16`): série de 7 pontos num
  painel largo vira bloco, não ritmo.

## Log

- 2026-09-03: Ambiente validado. Baseline capturada.
- 2026-09-03: Fundação + Home + Shell. Backfill demo + realismo.
- 2026-09-03: **Todas as 12 telas + shell + fundação concluídas.** Cada tela
  passou por crítica de um modelo separado e foi aprovada (tela 9 tem
  aprovação com ressalva: o texto da resposta da Bia depende de `OPENAI_API_KEY`
  — ver BLOCKERS #3 — para o sign-off visual final).
  - `pnpm --filter @otto/web build`: passa. Typecheck de `@otto/ui`,
    `@otto/core`, `@otto/web`: passam.
  - Testes: **tudo verde** — `@otto/core` 18/18, `@otto/db` 14/14. (O
    `espinha.test.ts` falhava antes só por causa da `OPENAI_API_KEY` vazia —
    fora de qualquer caminho do redesenho; agora que a chave foi configurada,
    passa.)
  - `OPENAI_API_KEY` configurada (autorizada pelo Alan). Worker consertado
    (`tsx watch --env-file`). Conhecimento fictício indexado + vetorizado.
  - `next lint` está quebrado no repo (Next 16 removeu o comando) — não é do
    redesenho.
  - Consistência entre telas conferida: Home ↔ Análise batem (conversas do dia
    e da semana). Anéis de resolução são rotulados por escopo ("hoje" vs período).
  - Modo claro e escuro conferidos em várias telas.
- 2026-09-03 (2ª rodada — **aproveitamento de tela**): o cliente apontou, num
  monitor de 1920, que as telas ficavam travadas em 1152 px com ~350 px mortos de
  cada lado, e que a página inteira rolava em vez de só a lista.
  - **Larguras**: `--w-conteudo` 66→84rem, `--w-conteudo-amplo` 90→104rem.
  - **Rolagem de aplicação**: `main` trava em `h-dvh` no desktop; criado
    `componentes/pagina.tsx` (`Pagina`, `PaginaLista`, `CartaoRolavel`) e as 10
    telas migradas. Cabeçalho e busca param; a lista rola por dentro do cartão.
  - **Linhas de lista** de dois níveis viraram um nível (Clientes, fila do
    Início): altura da linha caiu ~⅓ e o vão horizontal sumiu.
  - **Conhecimento** ganhou coluna "Resposta" (`resumo` novo em `ItemListado`,
    cortado no banco com `left(regexp_replace(body,…),160)`): a tabela deixou de
    ter um vão de 400 px entre o título e a situação.
  - **Configurações** em duas colunas; **Melhorias** já estava em duas.
  - **Fichas de detalhe** saíram de `max-w-3xl` (que deixava ~450 px mortos de
    cada lado) para duas colunas em `max-w-[68rem]`: no Cliente, resumo à
    esquerda e histórico à direita; no item de Conhecimento, a resposta na coluna
    larga (com `max-w-[70ch]` próprio) e metadado/versões na estreita.
  - **Gráfico de movimento**: série de até 10 pontos não estica — o gráfico e a
    régua ganham `maxWidth` de `n × 5.5rem`. Esticar 7 barras por 1000 px
    transformava o gráfico em retângulos soltos.
  - `prefetch={false}` nas linhas de lista.
  - Verificado ao vivo no Chrome do cliente (extensão pareada, 1920) tela por
    tela, mais Playwright em 1920 + iPhone 13 Pro nos dois temas.
  - Build de produção passa; typecheck de `web`/`core`/`ui` limpos; detector do
    design system sem achados.
  - **Falso alarme registrado:** durante a sessão apareceram HTTP 500 com
    `useTema precisa estar dentro de <ProvedorTema>`. É artefato do dev server
    recompilando (grafo de módulos inconsistente quebra a identidade do
    `createContext`), não bug do produto: com o servidor quente, 27 pedidos
    sequenciais e 54 simultâneos deram 200, e o build de produção passa.
- Ferramentas descartáveis (NÃO commitar): `packages/db/_backfill_demo.mjs`,
  `packages/db/_realismo_demo.mjs` — regeneram o ambiente fictício "Mercado
  Modelo". Rodar de `packages/db` com `node --env-file=../../.env <arquivo>`.

## Pontas soltas (não bloqueiam; próximas iterações)

- Edição inline de Conhecimento e de ficha de Cliente (renomear/anotar) —
  server actions já existem no core, falta a UI. "Novo item" foi retirado até lá.
- Tela 9 (Simulador): re-review visual quando a `OPENAI_API_KEY` entrar.
- Análise: variação vs. período anterior só nos KPIs onde o core devolve o
  comparativo (conversas, resolução, custo); os demais mostram contexto.
