# Roadmap

Cada fase entrega uma parte **completa** da fundação. Uma fase só termina quando
satisfaz o critério de qualidade do §48 da missão: funciona, está integrada, tem
estados de carregamento / vazio / erro, respeita permissões, funciona em mobile e
desktop, funciona em claro e escuro, persiste de verdade, foi testada e foi
inspecionada visualmente.

Nenhuma fase entrega mock fingindo ser integração.

---

## Trilha paralela M — Meta (começa agora, corre em paralelo a tudo)

A única dependência do projeto que **não** depende de código nosso: a verificação de
negócio e a revisão de app da Meta levam dias ou semanas de análise humana. Por isso
essa trilha começa na fase 0, e não perto do fim.

| Etapa | Bloqueia |
|---|---|
| M1 · Portfólio de Negócios + App de Desenvolvedor criados | M2 |
| M2 · Verificação de Negócios submetida | Enviar para números reais |
| M3 · Número de teste do WhatsApp ativo (modo desenvolvimento) | Nada — libera a fase 10 |
| M4 · Revisão de app / permissões de mensageria | Piloto comercial |
| M5 · Elegibilidade de Tech Provider / Embedded Signup | Onboarding self-service (§16) |

O desenvolvimento das fases 0–9 **não é bloqueado** por nenhuma dessas etapas.
O número de teste (M3) é suficiente para validar o produto inteiro ponta a ponta.

---

## Fase 0 — Fundação técnica

Infraestrutura provisionada, monorepo, banco com RLS ativo, autenticação real,
tokens de design e o conjunto mínimo de primitivos de interface.

Escopo deliberadamente estreito no design system: cerca de oito primitivos, não
vinte e cinco. O restante nasce quando uma tela real pedir — componente construído
sem tela que o use vira código morto e inconsistência.

**Concluída quando:** um usuário real cria conta, entra, vê o shell da aplicação em
claro e escuro, e uma consulta sem contexto de tenant comprovadamente retorna zero
linhas (teste automatizado de isolamento).

## Fase 1 — Espinha vertical

O caminho crítico inteiro, sem mock em nenhum ponto: canal de teste → webhook
recebido e deduplicado → contato e conversa persistidos → mensagem visível em tempo
real → agente recupera conhecimento real da base → resposta fundamentada → envio →
custo e tokens registrados.

Interface mínima nessa fase; a prova é que a cadeia é real.

**Concluída quando:** uma mensagem enviada por um simulador de canal com contrato
idêntico ao da Meta percorre a cadeia toda e aparece uma linha em `ai_runs` com
custo, modelo e latência reais.

## Fase 2 — Console

Shell do produto, navegação desktop e mobile, Home operacional com indicadores que
levam a uma decisão, usuários, equipes, papéis e permissões, configurações da empresa.

**Concluída quando:** o proprietário consegue convidar alguém, definir papel, e o
papel efetivamente restringe o que a pessoa faz — verificado no servidor, não só
escondendo botões.

## Fase 3 — Inbox

Caixa unificada de verdade: conversa completa, canal, cliente, status, atendente,
modo, tags, notas internas, anexos, busca, filtros, atribuição, transferência,
ações rápidas. Modos Automático / Copilot / Humano e o handoff entre eles.
Experiência mobile projetada como aplicativo, não como três colunas espremidas.

**Concluída quando:** um operador assume uma conversa da IA pelo celular, responde,
devolve para a IA, e o cliente nunca precisa repetir nada.

## Fase 4 — Centro de Conhecimento

Categorias, itens estruturados, fontes, validade, status (rascunho / em aprovação /
publicado / desatualizado / arquivado), versionamento, histórico, autor, aprovação,
detecção de conflito, e a visão "o que minha IA sabe e de onde isso veio".

**Concluída quando:** publicar um item muda a resposta do agente na conversa seguinte,
e o histórico mostra quem mudou o quê e quando.

## Fase 5 — Agente

Configuração de comportamento traduzida em controles compreensíveis — não prompt cru.
Personalidade, tom, objetividade, saudação, despedida, assuntos proibidos, assuntos
obrigatoriamente humanos, limiar de confiança, ferramentas disponíveis. Versionamento
do comportamento com comparação entre versões.

**Concluída quando:** mudar a personalidade altera visivelmente o estilo da resposta
sem alterar os fatos, e a mudança fica registrada como uma nova versão do agente.

## Fase 6 — Aprendizado

Sinais coletados durante o atendimento, agregação, sugestões de conhecimento,
fila de revisão, aprovação, publicação versionada e acompanhamento do resultado.

**Concluída quando:** perguntas repetidas sem resposta na base geram uma sugestão
concreta, e aprová-la cria o item de conhecimento correspondente.

## Fase 7 — Operação

Casos e Kanban com pipelines configuráveis, notificações (central interna + push do
PWA), e a fundação de automações baseada em eventos e condições.

**Concluída quando:** uma reclamação vira um caso acompanhável e o gerente recebe
a notificação no celular com o app fechado.

## Fase 8 — Inteligência

Analytics com períodos e comparação, custo por conversa e por mensagem, consumo por
modelo e por canal, qualidade, e drill-down: toda métrica leva às conversas que a
originaram.

**Concluída quando:** clicar em "conversas transferidas hoje" abre exatamente
aquelas conversas.

## Fase 9 — Backoffice do SaaS

Empresas, criação, suspensão, planos, features, limites, consumo, saúde, incidentes,
auditoria, e as ações administrativas seguras (pausar IA de um tenant, desconectar
canal, alterar limite, reprocessar evento).

**Concluída quando:** operar o SaaS não exige mais editar o banco à mão.

## Fase 10 — Canais reais

WhatsApp e Instagram oficiais no nosso tenant de teste, com as contas da Meta que
controlamos. Fluxo de conexão de canal desenhado como produto.

**Concluída quando:** uma mensagem enviada de um celular real chega na Inbox e a
resposta do agente chega de volta ao celular.

## Fase 11 — Endurecimento

Segurança, LGPD operacional, observabilidade, backups e restauração testada, casos
de borda, performance percebida, acessibilidade.

**Concluída quando:** um backup é restaurado com sucesso em ambiente limpo e a
pergunta "por que essa mensagem não foi enviada?" é respondida em uma tela só.

## Fase 12 — Piloto interno

Uso real e continuado do nosso tenant de teste, com clientes simulados por nós, até
não haver fluxo quebrado.

## Fase 13 — Supermercado Campeão

Onboarding do primeiro cliente real, com dados reais fornecidos pelo Sr. Fernando —
nunca inventados — e com as propriedades da Meta dele conectadas somente após
aprovação explícita.
