# Design

<!-- impeccable:design-schema 1 -->

## O mundo visual

**Um instrumento de operação, não um dashboard.**

A referência mental não é software de startup — é equipamento profissional bem
feito: a mesa de som de um estúdio, o painel de uma cabine, a bancada de um
relojoeiro. Objetos que uma pessoa competente usa todo dia, que não explicam a
si mesmos com decoração, e cuja qualidade aparece na precisão do alinhamento, na
firmeza dos estados e na ausência de ruído.

Isso decide as escolhas difíceis. Quando houver dúvida entre expressivo e
preciso, precisão vence. Quando houver dúvida entre um gráfico bonito e um
número que cabe na frase, o número vence. O produto não tenta impressionar o Sr.
Fernando; tenta desaparecer enquanto ele resolve o que precisa.

**Neutros quentes, não cinza frio.** Cinza azulado é a assinatura do SaaS
genérico e do "produto de IA". O produto trata de conversa humana e comércio de
bairro; a base é de papel e tinta, levemente quente, com preto que puxa para o
marrom em vez de para o azul.

**A cor é semântica antes de ser marca.** Em um painel operacional, cor tem
trabalho: dizer que algo caiu, que algo espera, que algo deu certo. A cor de
marca aparece pouco — navegação ativa, foco, ação primária — para que o vermelho
de uma falha nunca compita com enfeite.

## Tipografia

**IBM Plex Sans** em todo o produto. **IBM Plex Mono** para dado técnico:
identificadores, nome de modelo, custo, latência, telefone.

Por quê essa e não a escolha reflexa (Inter, Geist): o Plex tem caráter
engenheirado e maduro — desenhado para instrumentação, não para landing page.
Sustenta densidade a 12–13 px sem virar mingau, tem numerais tabulares reais, e
seus diacríticos foram desenhados com cuidado, o que importa muito em português:
"ç", "ã", "õ" e "é" aparecem em quase toda tela do produto.

Auto-hospedada, com subset latino. Nada de fonte do sistema como voz do produto.

Escala (rem, base 16): 11 · 12 · 13 · 14 · 16 · 20 · 26 · 34. A interface vive
entre 12 e 16; os dois maiores são para números que carregam uma decisão e para
o raro título de página. Sem texto gigante.

Peso carrega hierarquia antes do tamanho: 400 corpo, 500 rótulo, 600 título.
Tracking negativo apenas acima de 20 px, nunca além de -0,02em.

Medida de leitura: 62–72 caracteres em texto corrido. Tabelas e listas ignoram
isso por natureza.

## Cor

Tokens semânticos, nunca valor cru em componente. Cada token existe nos dois
temas com contraste verificado.

**Base** — papel quente no claro, grafite quente no escuro. Três níveis de
superfície (fundo, superfície, superfície elevada) e dois de linha (sutil,
firme). Texto em três níveis: primário, secundário, terciário.

**Marca** — um verde-petróleo profundo e dessaturado. Escolhido por eliminação
consciente: não é o azul-corporativo, não é o roxo-de-IA, não é neon. Tem
seriedade e uma gota de calor, e sobrevive em ambos os temas sem virar outra cor.

**Semânticas** — sucesso (verde-mata), atenção (âmbar-tostado), falha
(vermelho-telha), informação (a própria marca). Todas dessaturadas para
pertencer ao mesmo mundo dos neutros quentes; nenhuma delas grita.

Cada semântica tem par: cor de texto e cor de fundo suave. Etiqueta de status é
texto colorido sobre fundo suave — nunca preenchimento saturado com texto branco,
que empilhado em lista vira semáforo.

## Forma e espaço

**Raio 5 px** em superfícies, **4 px** em controles, **3 px** em etiquetas.
Circular apenas em avatar e ponto de status. Canto muito arredondado infantiliza
e o cliente vetou explicitamente.

**Escala de espaço em passos de 4**: 4 · 8 · 12 · 16 · 24 · 32 · 48. Agrupamento
por proximidade: itens de um mesmo grupo próximos, grupos separados com folga.
Mais espaço acima de um título do que abaixo dele.

**Densidade é deliberada.** Linha de lista com 36–40 px de altura no desktop,
44–48 px no toque. O desktop aproveita a densidade que uma tela grande permite; o
celular respeita o dedo. Não é a mesma tela esticada.

**Profundidade vem de luz sobre material, nunca de brilho.** Esta é a distinção
que decide tudo aqui. Uma superfície é um objeto sob uma fonte de luz difusa
vinda de cima, e é assim que ela ganha espessura: a borda é branco com alfa no
escuro — aresta que pega luz, não contorno desenhado; uma linha especular de
1 px atravessa o topo do painel, forte no meio e ausente nos cantos, porque é
assim que luz de cima se comporta numa quina real; o chão tem grão, que é o que
impede uma tela escura de ler como retângulo chapado. A sombra tem deslocamento
vertical porque o objeto está acima do fundo, não em volta dele.

O que continua proibido, e a distância entre as duas coisas é a régua: halo
colorido, aura da marca atrás do conteúdo, gradiente como enfeite, vidro
desfocado sem função. Luz ambiente da página é acromática — é a lâmpada do
teto, não uma assinatura de produto de IA.

**O que sobe e o que afunda.** Painel sobe: borda iluminada e sombra externa.
Campo afunda: preenchimento mais escuro que a superfície que o contém e sombra
interna só no topo, onde a borda de um recorte real faria sombra. O contraste
entre os dois dá espessura à tela sem uma única sombra externa a mais.

**A ação primária tem preenchimento próprio.** A cor de marca clara do tema
escuro existe para texto, foco e navegação ativa, onde precisa saltar do
grafite; espalhada por um botão de largura inteira ela vira a coisa mais alta da
tela. O preenchimento sólido é um verde-petróleo fundo nos dois temas — mesma
cor percebida, mesmo peso — e escurece ao ser pressionado, com a aresta de cima
acesa e um pixel de curso, como uma tecla.

**Borda de destaque é de 1 px.** Faixa colorida grossa na lateral de card é
recurso de template; a cor entra pela etiqueta e pelo texto.

## Movimento

Um gesto por interação, com propósito, e nenhum ornamental.

Durações: 120 ms para retorno de controle (hover, foco, pressionar), 180 ms para
troca de estado, 240 ms para entrada de camada (sheet, diálogo, menu), 420 ms
para uma tela assentando na carga. Curva de saída exponencial a partir de um
estado já visível — nada aparece de lugar nenhum com atraso encadeado.

Duas curvas, e cada uma tem trabalho. A de saída para camada que entra; uma
curva de mola, que desacelera com um resto de inércia em vez de travar, só para
superfície que assenta na carga. Controle nunca usa mola: um botão que balança
ao receber o mouse é brinquedo.

**Entrada é um objeto assentando, não uma animação por seção.** Uma tela entra
com um gesto só, tocado por poucas peças em sequência curta, na ordem em que se
lê, escalonadas por dezenas de milissegundos — não centenas. Sobe alguns pixels
e recua de fração de escala. Nunca uma entrada idêntica repetida em cada bloco
da página.

O que ganha movimento: camadas que entram, mensagem nova chegando na conversa,
valor que muda ao vivo, transição entre telas no celular. O que não ganha:
seções ao rolar, contadores animando, ícones pulsando.

`prefers-reduced-motion` remove translação e escala; mantém mudança de opacidade
e de cor, que continuam comunicando estado.

## Superfícies do navegador

O que não desenhamos também carrega o design. Seleção de texto, cursor de
digitação, barra de rolagem, anel de foco e sublinhado de link recebem token do
sistema. Numeral tabular em toda tabela e todo valor que muda ao vivo, para que
o número não dance na tela.

## Ícones

Traço único, biblioteca única (Lucide), 1,5 px de espessura, tamanho 16 na
interface e 20 no que for tocável. Nunca emoji no lugar de ícone. Nenhum robô,
nenhuma estrela de IA, nenhum raio — o produto não se anuncia como mágico.

## Voz

Português brasileiro, natural e específico. O botão nomeia a ação que executa
("Publicar conhecimento", não "Salvar"). O erro diz o que aconteceu e o que
fazer. O estado vazio diz o próximo passo, não "nenhum item encontrado". A
confirmação perigosa descreve a consequência antes de perguntar.

Números aparecem com unidade e período ("18 conversas hoje", não "18"). Nada de
promessa de marketing dentro do produto.

## Os dois temas

Claro e escuro são desenhados separadamente, não invertidos. O claro é papel
quente com tinta; o escuro é grafite quente com luz. As cores semânticas mudam
de valor entre os temas para manter contraste — o âmbar do claro seria ilegível
no escuro.

O tema segue o sistema por padrão, com controle explícito que persiste. O escuro
não é "modo noturno de cortesia": o Sr. Fernando abre o celular à noite, e essa
é a tela que ele vai ver.

## Aplicação por superfície

- **Console (Operate)** — a tarefa manda. Escanabilidade, consistência e estados
  acima de expressão. A marca vive na precisão, não em ornamento.
- **Inbox (Operate, denso)** — a conversa é o conteúdo; a interface recua. No
  celular é uma pilha de telas com transição, não três colunas espremidas.
- **Backoffice (Operate, técnico)** — mais densidade, mais dado tabular, mais
  mono. Mesmo sistema, outro ajuste de densidade.
- **Autenticação (Operate, momento único)** — a única tela onde o produto pode
  respirar e se apresentar. Ainda sóbria.
