## Verificação visual pelo navegador — parcialmente bloqueada

**Situação:** a extensão do Claude para Chrome esteve conectada e validou as
primeiras telas (acesso, console, dois temas, contraste medido). Depois de uma
troca de conta durante a sessão, ela desconectou e não voltou.

**O que isso custa:** telas construídas depois disso — Inbox, Conhecimento,
Melhorias — foram validadas por HTML renderizado com sessão real (conteúdo,
dados, permissões, estados), mas **não** por inspeção visual de pixel. Isso
significa que alinhamento, truncamento e comportamento em largura de celular
seguem por conferir nessas telas.

**Para religar, quando puder:** confirme que a extensão está ativa em
`chrome://extensions`, e que o Chrome está logado no claude.ai com a **mesma
conta** do Claude Code. Reiniciar o Chrome costuma resolver. Feito isso, peço a
inspeção visual completa das telas pendentes e corrijo o que aparecer.

---

# Bloqueios

O que depende de ação sua e **não pode** ser resolvido daqui. Nada nesta lista
interrompe o resto: cada item registra o que falta, o que já foi construído ao
redor dele, e o que fazer quando você voltar.

Atualizado em 2026-09-03.

---

## B1 · Chave da API da OpenAI — bloqueia a espinha vertical

**O que falta:** uma chave de API válida.

**Por que não dá para contornar:** o critério de conclusão da espinha vertical é
uma linha real em `ai_runs` com custo, modelo e latência reais. Um valor simulado
satisfaria o teste e mentiria sobre o produto.

**O que já existe ao redor:** a camada de orquestração é agnóstica de fornecedor.
Existe um provedor de teste determinístico (`ProvedorSimulado`) que exercita a
cadeia inteira — contexto, ferramentas, fundamentação, registro de custo — sem
chamar ninguém. Trocar para a OpenAI é preencher uma variável de ambiente.

**Quando voltar:**
1. platform.openai.com → API keys → Create new secret key
2. Cole o valor em `OPENAI_API_KEY` no `.env` e nas variáveis do Railway
3. Peça para eu rodar a espinha vertical; mostro a linha de custo real

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
teste usa uma empresa fictícia **declaradamente fictícia**, nunca uma imitação
do Campeão.

**Quando voltar:** peça ao Sr. Fernando os dados de cada unidade. Eu cadastro,
ou preparo uma planilha para ele preencher.

---

## Verificação visual em largura de celular — contornado

**Situação:** o redimensionamento de janela pela extensão do Chrome não tem
efeito enquanto a janela está **maximizada**.

**Contorno em uso:** a inspeção mobile é feita por emulação de viewport via CDP,
que não depende do tamanho da janela. Onde a emulação não cobrir, digo
explicitamente que a validação mobile ficou pendente em vez de afirmar que
conferi.

**Se quiser a verificação na janela real:** basta restaurar o Chrome (sair do
maximizado).
