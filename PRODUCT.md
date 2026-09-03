# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Monorepo pnpm + Turborepo. Next.js (App Router) para o Console e o Backoffice,
worker Node separado para filas, Postgres 18 com pgvector e Redis — tudo no
Railway, na mesma rede privada. Drizzle como ORM. Decidido pelo responsável
técnico com autonomia concedida pelo cliente; justificativas em
`docs/DECISIONS.md`.

O Console é um PWA: requisito central do produto, não complemento. Instalado no
celular, precisa se aproximar de um aplicativo nativo, não de um site aberto no
Chrome.

## Users

**Proprietário da empresa cliente** — no primeiro caso real, o Sr. Fernando, do
Supermercado Campeão (Canaã dos Carajás, PA). Ele não é técnico e não deve
precisar entender nada sobre IA para operar o produto. Usa principalmente o
celular, entre outras tarefas da operação da loja, em sessões curtas: quer ver
o que está acontecendo, intervir quando necessário e voltar ao que estava
fazendo.

**Uma ou duas pessoas da equipe dele** se revezam no atendimento. Precisam saber
quem está com qual conversa e conseguir assumir e devolver sem atrito — mas não
há estrutura de call center, turnos formais ou supervisão hierárquica no piloto.
Filas e distribuição automática não são necessidades confirmadas hoje.

**O consumidor final** nunca abre o painel. Ele conversa pelo WhatsApp ou pelo
Instagram Direct e é o usuário mais numeroso do sistema. A qualidade percebida
do produto se decide na conversa dele, não na interface.

**Nós, donos da plataforma**, operamos o SaaS por um Backoffice próprio: criar e
suspender empresas, acompanhar consumo e custo, investigar incidentes.

## Product Purpose

Centralizar, automatizar e supervisionar o relacionamento entre uma empresa e
seus clientes nos canais onde eles já conversam.

A plataforma recebe a mensagem, identifica empresa, canal, cliente e conversa,
entende a intenção, responde com base no conhecimento oficial daquela empresa,
reconhece quando não sabe, transfere para um humano quando necessário, e
transforma o que aprendeu no atendimento em melhorias submetidas a aprovação
humana.

Sucesso é o proprietário abrir o produto no celular e sentir que controla o
atendimento dali — e o consumidor não perceber que falou com um sistema.

## Positioning

Não é um chatbot conectado a um modelo de linguagem. É uma infraestrutura
operacional de relacionamento, na qual WhatsApp e Instagram são canais
substituíveis e os modelos de IA são motores substituíveis.

O que um concorrente não copia com facilidade:

- **A IA nunca é a fonte da verdade.** Todo fato vem da Base de Conhecimento da
  empresa ou de uma ferramenta autorizada. Sem fundamento suficiente, o agente
  assume a limitação e oferece caminho humano — uma regra de código, não uma
  instrução de prompt que o modelo pode ignorar.
- **Aprendizado sem autocontaminação.** Conversa não vira conhecimento
  automaticamente. Clientes erram, brincam e mentem; a IA também erra. Sinais
  viram sugestões, sugestões passam por revisão humana, e a publicação é
  versionada e auditável.
- **Custo e comportamento rastreáveis por atendimento.** Cada execução registra
  modelo, tokens, custo, latência, ferramentas e versão do agente — o que
  permite responder "a qualidade caiu depois da mudança X?".

## Operating Context

O primeiro cliente é um supermercado de cidade do interior do Pará. As perguntas
reais são operacionais e repetitivas: endereço, localização no mapa, horário de
abertura e fechamento, funcionamento em domingo e feriado, estacionamento,
entrega, formas de pagamento, açougue, padaria, telefone, se tem determinado
produto, preço e promoção.

**A empresa tem mais de uma unidade.** Isso torna a desambiguação parte do
atendimento: "qual fica mais perto?" precisa ser resolvido antes de responder
horário ou mandar localização. Unidade é dimensão visível na interface, não
detalhe de fundo.

O volume é de **centenas de mensagens por dia**. É o suficiente para que
tendência, horário de pico e agrupamento por intenção tenham valor na Home — e
para que a Inbox precise aguentar crescer sem reescrita. Não é volume de
operação de call center.

O proprietário opera de pé, no celular, entre outras tarefas. O desktop é usado
para trabalho mais longo: manutenção de conhecimento, análise, configuração.

Informação dinâmica — preço, estoque, promoção — depende de integração futura
com o sistema CISS usado pelo supermercado, ainda sem documentação ou acesso
disponível.

## Capabilities and Constraints

**Confirmado e construído:** isolamento entre empresas por Row-Level Security no
Postgres; domínio modelado para empresas, unidades com horário e exceção de
calendário, usuários e papéis, canais, contatos multicanal, conversas,
mensagens, conhecimento versionado, sinais e sugestões de aprendizado, agente
versionado, execuções de IA com custo, consumo e auditoria.

**Confirmado e a construir:** Inbox unificada com modos automático, copilot e
humano; handoff; Centro de Conhecimento com aprovação e versionamento;
configuração do agente por controles compreensíveis, sem prompt cru; casos e
Kanban; notificações push; analytics com drill-down; Backoffice do SaaS.

**Restrições duras:**

- Canais apenas por vias oficiais da Meta. Nada de WhatsApp Web automatizado ou
  scraping — o produto não pode depender de violação de termos.
- Nenhuma conta, token ou canal do cliente é usado sem aprovação explícita. A
  validação acontece primeiro em ambiente de teste nosso.
- Multi-tenancy é requisito de segurança, não de organização. Nenhuma regra
  específica do Supermercado Campeão pode existir espalhada pelo código.
- Nenhum fornecedor de IA pode ser chamado fora da camada própria de
  orquestração.
- LGPD tratada com mecanismos reais: retenção, exclusão, exportação, controle de
  acesso e trilha de auditoria.

**Terminologia do produto** (em português, incluindo no código): empresa
(tenant), canal, conversa, contato, atendente virtual, base de conhecimento,
sugestão, caso, unidade.

## Brand Commitments

Nome comercial **ainda não definido**. `Otto` é codinome provisório, isolado em
um único arquivo de marca e substituível sem tocar em nenhuma outra parte do
código. Não inventar branding elaborado para compensar a ausência do nome.

**Direção visual obrigatória:** minimalista, premium, sóbria, moderna, funcional,
compacta, legível, madura. Prioridade para tipografia, ritmo, hierarquia, espaço
e alinhamento — não decoração.

**Proibições explícitas do cliente:** cara de dashboard Tailwind genérico;
dezenas de cards sem propósito; cantos exageradamente arredondados; gradientes
artificiais; roxo e azul típicos de produto de IA; robôs; estrelas de IA;
brilhos; efeitos futuristas; glassmorphism gratuito; animação sem propósito;
textos gigantes; espaços vazios enormes; interfaces infantilizadas.

**Claro e escuro são produtos de primeira classe.** Nenhum dos dois pode parecer
uma inversão do outro.

**Voz:** português brasileiro natural e profissional. Nada de "gerencie tudo em
um só lugar", "potencialize seus resultados" ou "revolucione seu atendimento".
Botões nomeiam a ação; erros explicam o que aconteceu; estados vazios dizem o
próximo passo; confirmações perigosas explicam a consequência.

**Personalidade do atendente virtual** (o que o consumidor lê no WhatsApp):
humana, educada, calorosa, eficiente e natural. Para o Supermercado Campeão:
amigável, simples, prestativo e próximo. Pergunta simples merece resposta
simples — não quatro parágrafos para informar um horário. Proibido soar
robótico ("Como uma inteligência artificial…", "Selecione uma das opções
abaixo", "Prezado cliente").

## Evidence on Hand

**Nada dos dados reais do Supermercado Campeão foi fornecido ainda.** Endereço,
coordenadas, horários, feriados, telefones, serviços, formas de pagamento,
políticas e número de unidades são desconhecidos e **não podem ser inventados**,
nem para demonstração. A estrutura para recebê-los existe; o conteúdo virá do
Sr. Fernando.

Também ausentes: documentação e acesso ao CISS; credenciais e identificadores da
Meta; contas de WhatsApp e Instagram do cliente.

Disponível e verificado: infraestrutura no Railway (Postgres 18.6 com pgvector
0.8.6, busca textual em português, Redis), conta Vercel, e chave da OpenAI
prometida pelo operador.

## Product Principles

1. **A verdade é da empresa, não do modelo.** Sem fundamento na base ou em
   ferramenta, o agente não afirma. Assumir a limitação é comportamento
   correto, não falha.
2. **Aprender exige consentimento humano.** Nenhum atendimento altera o
   conhecimento oficial sozinho. Sinal vira sugestão; sugestão vira
   conhecimento apenas por aprovação, versionada.
3. **A complexidade é nossa, não do usuário.** O proprietário não precisa saber
   o que é modelo, token, embedding ou confiança para operar o produto.
4. **Mobile é uma experiência própria, não um desktop espremido.** O
   proprietário precisa fazer quase tudo pelo celular.
5. **Nada finge funcionar.** Sem mock em produção, sem dado estático simulando
   integração, sem fallback silencioso. Uma funcionalidade só está pronta com
   estados, erro, vazio, permissão, persistência, teste e inspeção visual.

## Accessibility & Inclusion

Contraste, foco visível, navegação por teclado no desktop, rótulos, semântica,
alvos de toque adequados e mensagens de erro compreensíveis. A busca da sensação
de aplicativo nativo não pode custar acessibilidade: zoom acidental e seleção
indesejada se resolvem sem bloquear recursos legítimos do usuário.

Contexto de uso relevante: interior do Pará, com conexão móvel possivelmente
instável e aparelhos modestos. Percepção de velocidade e tolerância a
reconexão são requisitos de acessibilidade prática, não apenas de performance.
