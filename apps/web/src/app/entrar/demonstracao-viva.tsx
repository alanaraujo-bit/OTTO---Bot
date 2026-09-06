'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  BookOpenCheck,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Headphones,
  MapPin,
  MessageCircle,
  Package,
  Route,
  ScanSearch,
  Send,
  ShieldCheck,
  ShoppingBasket,
  Store,
  Truck,
  UserRoundCheck,
} from 'lucide-react';
import { cn } from '@otto/ui';

import { Assinatura } from '@/componentes/assinatura.tsx';

type RespostaVisual =
  | { tipo: 'horario'; rotulo: string; valor: string; apoio: string }
  | { tipo: 'localizacao'; titulo: string; apoio: string }
  | { tipo: 'opcoes'; titulo: string; itens: string[] }
  | { tipo: 'confirmacao'; titulo: string; valor: string; apoio: string }
  | { tipo: 'encaminhamento'; titulo: string; itens: string[] };
type Mensagem = {
  em: number;
  autor: 'Cliente' | 'Otto';
  texto: string;
  selo?: string;
  resposta?: RespostaVisual;
};
type Passo = { em: number; titulo: string; detalhe: string; Icone: LucideIcon };
type Cenario = {
  id: string;
  titulo: string;
  fim: number;
  mensagens: Mensagem[];
  passos: Passo[];
  resultado: { em: number; tipo: 'resolvido' | 'humano'; texto: string; Icone: LucideIcon };
};

const CENARIOS: Cenario[] = [
  {
    id: 'horario',
    titulo: 'Horário e unidade',
    fim: 10,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'Vocês abrem amanhã?' },
      { em: 2, autor: 'Otto', texto: 'Claro. De qual unidade você quer saber?' },
      { em: 4, autor: 'Cliente', texto: 'A mais próxima de mim.' },
      { em: 6, autor: 'Otto', texto: 'Consigo encontrar. Me manda sua localização?' },
      { em: 7, autor: 'Cliente', texto: 'Localização enviada.' },
      {
        em: 9,
        autor: 'Otto',
        texto: 'A unidade mais próxima abre amanhã das 8h às 20h.',
        selo: 'Confirmado na base',
        resposta: {
          tipo: 'horario',
          rotulo: 'Unidade mais próxima',
          valor: '8h — 20h',
          apoio: 'Horário de amanhã',
        },
      },
    ],
    passos: [
      { em: 1, titulo: 'Entendeu o pedido', detalhe: 'Horário de funcionamento', Icone: Clock3 },
      { em: 3, titulo: 'Percebeu o contexto', detalhe: 'Unidade não informada', Icone: Building2 },
      { em: 5, titulo: 'Evitou uma suposição', detalhe: 'Pediu a localização', Icone: ShieldCheck },
      {
        em: 8,
        titulo: 'Consultou a empresa',
        detalhe: 'Horário da unidade encontrada',
        Icone: BookOpenCheck,
      },
    ],
    resultado: { em: 9, tipo: 'resolvido', texto: 'Resolvido pelo Otto', Icone: Check },
  },
  {
    id: 'localizacao',
    titulo: 'Localização e rota',
    fim: 7,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'Como chego à unidade mais próxima?' },
      { em: 2, autor: 'Otto', texto: 'Eu encontro para você. Posso usar sua localização atual?' },
      { em: 3, autor: 'Cliente', texto: 'Pode sim.' },
      {
        em: 6,
        autor: 'Otto',
        texto: 'Encontrei a unidade mais próxima. É só abrir a rota abaixo.',
        selo: 'Rota pronta',
        resposta: {
          tipo: 'localizacao',
          titulo: 'Unidade mais próxima',
          apoio: 'Abrir rota no mapa',
        },
      },
    ],
    passos: [
      {
        em: 1,
        titulo: 'Identificou a intenção',
        detalhe: 'Encontrar uma unidade',
        Icone: ScanSearch,
      },
      { em: 4, titulo: 'Localizou o cliente', detalhe: 'Permissão confirmada', Icone: MapPin },
      { em: 5, titulo: 'Calculou o caminho', detalhe: 'Rota para a unidade', Icone: Route },
    ],
    resultado: { em: 6, tipo: 'resolvido', texto: 'Rota enviada pelo Otto', Icone: Check },
  },
  {
    id: 'pagamento',
    titulo: 'Formas de pagamento',
    fim: 5,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'Quais formas de pagamento vocês aceitam?' },
      {
        em: 4,
        autor: 'Otto',
        texto: 'Aceitamos Pix, dinheiro, cartão de débito e crédito.',
        selo: 'Informação confirmada',
        resposta: {
          tipo: 'opcoes',
          titulo: 'Formas aceitas',
          itens: ['Pix', 'Dinheiro', 'Débito', 'Crédito'],
        },
      },
    ],
    passos: [
      { em: 1, titulo: 'Classificou o pedido', detalhe: 'Formas de pagamento', Icone: CreditCard },
      {
        em: 2,
        titulo: 'Consultou a política',
        detalhe: 'Informação oficial da empresa',
        Icone: BookOpenCheck,
      },
      {
        em: 3,
        titulo: 'Validou a resposta',
        detalhe: 'Sem completar por conta própria',
        Icone: ShieldCheck,
      },
    ],
    resultado: { em: 4, tipo: 'resolvido', texto: 'Respondido com fundamento', Icone: Check },
  },
  {
    id: 'entrega',
    titulo: 'Área de entrega',
    fim: 8,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'Vocês entregam no meu endereço?' },
      { em: 2, autor: 'Otto', texto: 'Verifico agora. Qual é o seu CEP?' },
      { em: 4, autor: 'Cliente', texto: 'CEP enviado.' },
      {
        em: 7,
        autor: 'Otto',
        texto: 'Sim, entregamos no seu endereço. O prazo estimado é de até 90 minutos.',
        selo: 'CEP verificado',
        resposta: {
          tipo: 'confirmacao',
          titulo: 'Entrega disponível',
          valor: 'Até 90 min',
          apoio: 'Taxa calculada antes de confirmar',
        },
      },
    ],
    passos: [
      { em: 1, titulo: 'Entendeu o pedido', detalhe: 'Cobertura de entrega', Icone: Truck },
      { em: 3, titulo: 'Pediu o dado necessário', detalhe: 'CEP do cliente', Icone: MapPin },
      {
        em: 5,
        titulo: 'Consultou a cobertura',
        detalhe: 'Regra cadastrada pela empresa',
        Icone: BookOpenCheck,
      },
      {
        em: 6,
        titulo: 'Preparou as condições',
        detalhe: 'Resultado ligado ao endereço',
        Icone: ShieldCheck,
      },
    ],
    resultado: { em: 7, tipo: 'resolvido', texto: 'Consulta concluída', Icone: Check },
  },
  {
    id: 'servicos',
    titulo: 'Serviços da unidade',
    fim: 7,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'Essa unidade tem padaria?' },
      { em: 2, autor: 'Otto', texto: 'Você quer saber da unidade que selecionou agora?' },
      { em: 3, autor: 'Cliente', texto: 'Sim, essa mesma.' },
      {
        em: 6,
        autor: 'Otto',
        texto: 'Sim, essa unidade tem padaria. Também tem açougue e estacionamento.',
        selo: 'Unidade confirmada',
        resposta: {
          tipo: 'opcoes',
          titulo: 'Serviços da unidade',
          itens: ['Padaria', 'Açougue', 'Estacionamento'],
        },
      },
    ],
    passos: [
      { em: 1, titulo: 'Reconheceu o serviço', detalhe: 'Estrutura da unidade', Icone: Store },
      { em: 4, titulo: 'Confirmou a unidade', detalhe: 'Contexto preservado', Icone: Building2 },
      { em: 5, titulo: 'Consultou o cadastro', detalhe: 'Serviços oficiais', Icone: BookOpenCheck },
    ],
    resultado: { em: 6, tipo: 'resolvido', texto: 'Informação encontrada', Icone: Check },
  },
  {
    id: 'feriado',
    titulo: 'Funcionamento no feriado',
    fim: 6,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'No feriado o horário muda?' },
      {
        em: 2,
        autor: 'Otto',
        texto: 'Pode deixar. Vou conferir o horário especial da sua unidade.',
      },
      {
        em: 5,
        autor: 'Otto',
        texto: 'No feriado, essa unidade funciona das 9h às 18h.',
        selo: 'Feriado verificado',
        resposta: {
          tipo: 'horario',
          rotulo: 'Horário especial',
          valor: '9h — 18h',
          apoio: 'Válido para o feriado',
        },
      },
    ],
    passos: [
      { em: 1, titulo: 'Reconheceu a data', detalhe: 'Feriado e unidade atual', Icone: Clock3 },
      {
        em: 3,
        titulo: 'Buscou uma exceção',
        detalhe: 'Calendário da empresa',
        Icone: BookOpenCheck,
      },
      {
        em: 4,
        titulo: 'Priorizou a exceção',
        detalhe: 'Acima do horário padrão',
        Icone: ShieldCheck,
      },
    ],
    resultado: { em: 5, tipo: 'resolvido', texto: 'Exceção aplicada', Icone: Check },
  },
  {
    id: 'estoque',
    titulo: 'Produto sem estoque integrado',
    fim: 7,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'Tem leite sem lactose disponível?' },
      {
        em: 3,
        autor: 'Otto',
        texto:
          'Quero te responder com certeza, mas esse estoque ainda não aparece em tempo real para mim.',
      },
      {
        em: 6,
        autor: 'Otto',
        texto:
          'Já chamei alguém da loja e enviei o produto e a unidade junto. Você não vai precisar explicar tudo de novo.',
        selo: 'Contexto enviado',
        resposta: {
          tipo: 'encaminhamento',
          titulo: 'Equipe verificando agora',
          itens: ['Leite sem lactose', 'Unidade selecionada'],
        },
      },
    ],
    passos: [
      {
        em: 1,
        titulo: 'Entendeu o produto',
        detalhe: 'Disponibilidade em estoque',
        Icone: Package,
      },
      {
        em: 2,
        titulo: 'Consultou as fontes',
        detalhe: 'Sem confirmação confiável',
        Icone: BookOpenCheck,
      },
      {
        em: 4,
        titulo: 'Protegeu a resposta',
        detalhe: 'Não inventou disponibilidade',
        Icone: ShieldCheck,
      },
      {
        em: 5,
        titulo: 'Preparou o contexto',
        detalhe: 'Produto e unidade preservados',
        Icone: ShoppingBasket,
      },
    ],
    resultado: { em: 6, tipo: 'humano', texto: 'Encaminhado à equipe', Icone: UserRoundCheck },
  },
  {
    id: 'preco',
    titulo: 'Preço que pode mudar',
    fim: 5,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'Qual é o preço desse produto hoje?' },
      {
        em: 4,
        autor: 'Otto',
        texto:
          'Esse preço pode mudar e eu não quero te passar um valor errado. Já pedi a confirmação para a equipe.',
        selo: 'Confirmação solicitada',
        resposta: {
          tipo: 'encaminhamento',
          titulo: 'Preço em confirmação',
          itens: ['Produto identificado', 'Resposta nesta conversa'],
        },
      },
    ],
    passos: [
      { em: 1, titulo: 'Detectou dado dinâmico', detalhe: 'Preço atual', Icone: ScanSearch },
      {
        em: 2,
        titulo: 'Não encontrou uma fonte',
        detalhe: 'Valor sem integração confiável',
        Icone: ShieldCheck,
      },
      {
        em: 3,
        titulo: 'Montou a solicitação',
        detalhe: 'Produto e pergunta preservados',
        Icone: Package,
      },
    ],
    resultado: {
      em: 4,
      tipo: 'humano',
      texto: 'Confirmação humana solicitada',
      Icone: UserRoundCheck,
    },
  },
  {
    id: 'reclamacao',
    titulo: 'Reclamação sensível',
    fim: 8,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'Tive um problema com a minha compra.' },
      { em: 2, autor: 'Otto', texto: 'Poxa, sinto muito. Você pode me contar o que aconteceu?' },
      { em: 4, autor: 'Cliente', texto: 'O produto veio danificado.' },
      {
        em: 7,
        autor: 'Otto',
        texto:
          'Entendi. Já enviei seu relato e o contexto da compra para alguém da equipe cuidar disso com você.',
        selo: 'Relato preservado',
        resposta: {
          tipo: 'encaminhamento',
          titulo: 'Atendimento priorizado',
          itens: ['Produto danificado', 'Relato completo enviado'],
        },
      },
    ],
    passos: [
      {
        em: 1,
        titulo: 'Reconheceu o cuidado',
        detalhe: 'Problema após uma compra',
        Icone: Headphones,
      },
      {
        em: 3,
        titulo: 'Pediu apenas o necessário',
        detalhe: 'Descrição do ocorrido',
        Icone: ScanSearch,
      },
      {
        em: 5,
        titulo: 'Preservou o relato',
        detalhe: 'Contexto completo da conversa',
        Icone: ShieldCheck,
      },
      { em: 6, titulo: 'Priorizou uma pessoa', detalhe: 'Caso sensível', Icone: UserRoundCheck },
    ],
    resultado: {
      em: 7,
      tipo: 'humano',
      texto: 'Atendimento humano acionado',
      Icone: UserRoundCheck,
    },
  },
  {
    id: 'pedido-grande',
    titulo: 'Pedido em grande quantidade',
    fim: 8,
    mensagens: [
      { em: 0, autor: 'Cliente', texto: 'Preciso comprar uma grande quantidade para um evento.' },
      {
        em: 2,
        autor: 'Otto',
        texto: 'Posso organizar isso com você. Quais produtos e quantidades precisa?',
      },
      { em: 4, autor: 'Cliente', texto: 'Enviei a lista completa.' },
      {
        em: 7,
        autor: 'Otto',
        texto:
          'Recebi. Deixei tudo organizado e chamei alguém da equipe para combinar as condições com você.',
        selo: 'Pedido organizado',
        resposta: {
          tipo: 'encaminhamento',
          titulo: 'Cotação preparada',
          itens: ['Lista completa', 'Quantidades organizadas'],
        },
      },
    ],
    passos: [
      {
        em: 1,
        titulo: 'Identificou uma negociação',
        detalhe: 'Pedido fora do atendimento comum',
        Icone: ShoppingBasket,
      },
      { em: 3, titulo: 'Coletou os itens', detalhe: 'Produtos e quantidades', Icone: Package },
      {
        em: 5,
        titulo: 'Estruturou a demanda',
        detalhe: 'Resumo pronto para a equipe',
        Icone: BookOpenCheck,
      },
      {
        em: 6,
        titulo: 'Escolheu o especialista',
        detalhe: 'Condição comercial humana',
        Icone: UserRoundCheck,
      },
    ],
    resultado: { em: 7, tipo: 'humano', texto: 'Negociação encaminhada', Icone: UserRoundCheck },
  },
];

function ResultadoNaConversa({ resposta }: { resposta: RespostaVisual }) {
  if (resposta.tipo === 'localizacao') {
    return (
      <div className="border-linha bg-superficie/75 mt-2 overflow-hidden rounded-sm border">
        <div className="bg-superficie-2 relative h-12 overflow-hidden" aria-hidden>
          <span className="bg-linha-firme absolute top-5 left-5 h-px w-20 -rotate-6" />
          <span className="bg-marca absolute top-[1.15rem] left-[5.75rem] h-px w-16 rotate-12" />
          <MapPin className="text-texto-3 absolute top-3 left-3 size-4" strokeWidth={1.5} />
          <span className="bg-marca text-solida-contraste absolute top-2.5 right-5 flex size-6 items-center justify-center rounded-full">
            <Store className="size-3" strokeWidth={1.5} />
          </span>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-texto text-2xs font-semibold">{resposta.titulo}</p>
            <p className="text-texto-3 mt-0.5 text-[10px]">{resposta.apoio}</p>
          </div>
          <Route className="text-marca size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
        </div>
      </div>
    );
  }

  if (resposta.tipo === 'opcoes') {
    return (
      <div className="border-linha bg-superficie/75 mt-2 rounded-sm border px-2.5 py-2">
        <p className="text-texto-3 text-[10px] font-medium">{resposta.titulo}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {resposta.itens.map((item) => (
            <span
              key={item}
              className="border-linha bg-superficie-2 text-texto flex items-center gap-1 rounded-xs border px-1.5 py-1 text-[10px] font-medium"
            >
              {resposta.titulo === 'Formas aceitas' &&
                (item === 'Dinheiro' ? (
                  <Banknote className="text-marca size-3" strokeWidth={1.5} aria-hidden />
                ) : (
                  <CreditCard className="text-marca size-3" strokeWidth={1.5} aria-hidden />
                ))}
              {item}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (resposta.tipo === 'encaminhamento') {
    return (
      <div className="border-atencao/25 bg-atencao-suave/70 mt-2 rounded-sm border px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <UserRoundCheck className="text-atencao size-3.5" strokeWidth={1.5} aria-hidden />
          <p className="text-texto text-2xs font-semibold">{resposta.titulo}</p>
        </div>
        <p className="text-texto-3 mt-1 text-[10px]">{resposta.itens.join(' · ')}</p>
      </div>
    );
  }

  return (
    <div className="border-linha bg-superficie/75 mt-2 flex items-center gap-2.5 rounded-sm border px-2.5 py-2">
      <span className="bg-marca-suave text-marca flex size-7 shrink-0 items-center justify-center rounded-sm">
        {resposta.tipo === 'horario' ? (
          <Clock3 className="size-3.5" strokeWidth={1.5} aria-hidden />
        ) : (
          <Truck className="size-3.5" strokeWidth={1.5} aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-texto-3 text-[10px]">
          {resposta.tipo === 'horario' ? resposta.rotulo : resposta.titulo}
        </p>
        <p className="text-texto text-xs font-semibold tabular-nums">{resposta.valor}</p>
        <p className="text-texto-3 text-[10px]">{resposta.apoio}</p>
      </div>
      <Check className="text-marca size-3.5 shrink-0" strokeWidth={2} aria-hidden />
    </div>
  );
}

function usarMovimentoReduzido() {
  const [reduzido, setReduzido] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    const atualizar = () => setReduzido(consulta.matches);
    atualizar();
    consulta.addEventListener('change', atualizar);
    return () => consulta.removeEventListener('change', atualizar);
  }, []);
  return reduzido;
}

/** Dez caminhos ilustrativos, todos sem inventar dados reais da empresa. */
export function DemonstracaoConversas() {
  const [indiceCenario, setIndiceCenario] = useState(0);
  const [momento, setMomento] = useState(0);
  const [paginaVisivel, setPaginaVisivel] = useState(true);
  const movimentoReduzido = usarMovimentoReduzido();
  const cenario = CENARIOS[indiceCenario]!;

  useEffect(() => {
    const atualizar = () => setPaginaVisivel(document.visibilityState === 'visible');
    atualizar();
    document.addEventListener('visibilitychange', atualizar);
    return () => document.removeEventListener('visibilitychange', atualizar);
  }, []);

  useEffect(() => {
    if (!paginaVisivel || movimentoReduzido) return;
    const terminou = momento >= cenario.fim;
    const temporizador = window.setTimeout(
      () => {
        if (terminou) {
          setIndiceCenario((atual) => (atual + 1) % CENARIOS.length);
          setMomento(0);
        } else setMomento((atual) => atual + 1);
      },
      terminou ? 2800 : 1050,
    );
    return () => window.clearTimeout(temporizador);
  }, [cenario.fim, momento, movimentoReduzido, paginaVisivel]);

  const momentoExibido = movimentoReduzido ? cenario.fim : momento;
  const mensagensVisiveis = useMemo(
    () => cenario.mensagens.filter((mensagem) => mensagem.em <= momentoExibido).slice(-4),
    [cenario, momentoExibido],
  );
  const resultadoVisivel = momentoExibido >= cenario.resultado.em;
  const IconeResultado = cenario.resultado.Icone;
  const progresso = movimentoReduzido ? 1 : (momento + 1) / (cenario.fim + 1);

  function trocarCenario(direcao: number) {
    setIndiceCenario((atual) => (atual + direcao + CENARIOS.length) % CENARIOS.length);
    setMomento(0);
  }

  return (
    <figure
      aria-describedby="descricao-demonstracao-otto"
      className="painel demonstracao-otto bg-superficie/85 mt-10 flex max-h-[34rem] min-h-0 flex-1 flex-col overflow-hidden xl:mt-12"
    >
      <span id="descricao-demonstracao-otto" className="sr-only">
        Demonstração ilustrativa de dez conversas completas. Algumas são resolvidas pelo Otto com
        conhecimento aprovado; outras são encaminhadas para uma pessoa quando não há informação
        confiável ou o caso exige cuidado.
      </span>
      <figcaption className="border-linha flex shrink-0 items-center justify-between border-b px-5 py-3">
        <span className="text-texto flex items-center gap-2 text-xs font-semibold">
          <span className="relative flex size-2" aria-hidden>
            <span className="bg-ok absolute inline-flex size-full animate-ping rounded-full opacity-40 motion-reduce:animate-none" />
            <span className="bg-ok relative inline-flex size-2 rounded-full" />
          </span>
          Dez conversas por dentro
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => trocarCenario(-1)}
            aria-label="Ver conversa anterior"
            className="text-texto-3 hover:bg-superficie-2 hover:text-texto flex size-7 items-center justify-center rounded-sm transition-colors"
          >
            <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.5} />
          </button>
          <span className="text-2xs text-texto-3 min-w-10 text-center font-mono">
            {String(indiceCenario + 1).padStart(2, '0')} / {CENARIOS.length}
          </span>
          <button
            type="button"
            onClick={() => trocarCenario(1)}
            aria-label="Ver próxima conversa"
            className="text-texto-3 hover:bg-superficie-2 hover:text-texto flex size-7 items-center justify-center rounded-sm transition-colors"
          >
            <ChevronRight aria-hidden className="size-3.5" strokeWidth={1.5} />
          </button>
        </span>
      </figcaption>

      <div
        key={cenario.id}
        className="demo-cena-ativa grid min-h-0 flex-1 grid-cols-[minmax(0,1.12fr)_minmax(15rem,0.88fr)]"
      >
        {/*
          `min-h-0` nas duas colunas é o que segura a cena inteira: item de
          grade nasce com `min-height: auto` e cresce pelo conteúdo, então sem
          isto um cenário de quatro passos com resposta longa continuaria
          empurrando a altura — e o defeito voltaria só naquele cenário.
        */}
        <div className="relative flex min-h-0 flex-col overflow-hidden px-5 py-4">
          <div className="text-2xs text-texto-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MessageCircle aria-hidden className="size-3.5" strokeWidth={1.5} />
              {cenario.titulo}
            </span>
            <span>Dados de exemplo</span>
          </div>
          {/*
            Ancorado embaixo, como conversa de verdade: o que entra por último
            é a resposta com fundamento — o ponto da demonstração — e é ela que
            precisa de posição estável. Se faltar altura, quem desaparece é a
            mensagem mais antiga, desbotando no topo em vez de cortar seco.
          */}
          <div className="mt-3 grid min-h-0 flex-1 content-end gap-2 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_2rem)]">
            {mensagensVisiveis.map((mensagem) => {
              const doOtto = mensagem.autor === 'Otto';
              return (
                <div
                  key={`${cenario.id}-${mensagem.em}`}
                  className={cn(
                    'demo-evento-entra max-w-[92%]',
                    doOtto ? 'justify-self-end' : 'justify-self-start',
                  )}
                >
                  <p className={cn('text-2xs text-texto-3 mb-1', doOtto && 'text-right')}>
                    {mensagem.autor}
                  </p>
                  <div
                    className={cn(
                      'rounded-md px-3 py-2 text-xs',
                      doOtto
                        ? 'bg-marca-suave text-texto rounded-br-xs'
                        : 'border-linha bg-superficie-2 text-texto rounded-bl-xs border shadow-[var(--shadow-suspensa)]',
                    )}
                  >
                    <p>{mensagem.texto}</p>
                    {mensagem.resposta && <ResultadoNaConversa resposta={mensagem.resposta} />}
                    {mensagem.selo && (
                      <p className="text-2xs text-marca mt-1.5 flex items-center justify-end gap-1.5 font-medium">
                        <Check aria-hidden className="size-3" strokeWidth={2} />
                        {mensagem.selo}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="border-linha bg-superficie-2/55 flex min-h-0 flex-col border-l px-5 py-4">
          <div className="flex shrink-0 items-center justify-between">
            <p className="text-texto text-xs font-semibold">O que está acontecendo</p>
            <span className="flex items-center gap-2">
              <Assinatura tamanho="sm" apenasMarca />
              <span className="text-2xs text-marca font-mono">
                {resultadoVisivel
                  ? cenario.resultado.tipo === 'resolvido'
                    ? 'RESOLVIDO'
                    : 'ENCAMINHADO'
                  : 'ANALISANDO'}
              </span>
            </span>
          </div>
          <ol className="mt-3 grid min-h-0 content-start gap-0.5 overflow-hidden">
            {cenario.passos.map(({ em, titulo, detalhe, Icone }) => {
              const concluido = momentoExibido > em;
              const ativo = !movimentoReduzido && momentoExibido === em;
              return (
                <li
                  key={titulo}
                  className={cn(
                    'relative flex gap-2.5 rounded-sm px-2 py-1.5 transition-[opacity,background-color,transform] duration-[var(--dur-estado)]',
                    em > momentoExibido && 'translate-x-[-3px] opacity-30',
                    ativo && 'demo-evento-entra bg-marca-suave opacity-100',
                    concluido && 'opacity-75',
                  )}
                >
                  <span className="border-linha-firme bg-superficie text-marca relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm border">
                    <Icone aria-hidden className="size-3" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-texto text-xs font-medium">{titulo}</p>
                    <p className="text-2xs text-texto-3 mt-0.5 leading-relaxed">{detalhe}</p>
                  </div>
                  {concluido && (
                    <Check
                      aria-hidden
                      className="demo-evento-entra text-marca mt-1 ml-auto size-3.5 shrink-0"
                      strokeWidth={2}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          <div
            className={cn(
              'border-linha mt-auto flex shrink-0 items-center gap-3 border-t pt-3 transition-opacity duration-[var(--dur-estado)]',
              resultadoVisivel ? 'demo-evento-entra opacity-100' : 'opacity-25',
            )}
          >
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-sm',
                cenario.resultado.tipo === 'resolvido'
                  ? 'bg-solida text-solida-contraste'
                  : 'bg-atencao-suave text-atencao',
              )}
            >
              <IconeResultado aria-hidden className="size-3.5" strokeWidth={1.5} />
            </span>
            <div>
              <p className="text-2xs text-texto-3">Desfecho</p>
              <p className="text-texto text-xs font-medium">{cenario.resultado.texto}</p>
            </div>
            {cenario.resultado.tipo === 'humano' && (
              <Send aria-hidden className="text-atencao ml-auto size-3.5" strokeWidth={1.5} />
            )}
          </div>
        </aside>
      </div>
      <div className="border-linha bg-superficie-2/70 shrink-0 border-t px-5 py-3">
        <div className="bg-linha relative h-px overflow-hidden">
          <span
            aria-hidden
            style={{ transform: `scaleX(${progresso})` }}
            className="bg-marca absolute inset-y-0 left-0 w-full origin-left transition-transform duration-[var(--dur-estado)] motion-reduce:transition-none"
          />
        </div>
        <div className="text-2xs text-texto-3 mt-2 flex justify-between">
          <span>Mensagem</span>
          <span>Entendimento</span>
          <span>Contexto</span>
          <span>Fonte</span>
          <span>Desfecho</span>
        </div>
      </div>
    </figure>
  );
}
