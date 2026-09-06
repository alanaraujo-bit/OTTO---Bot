import { Assinatura } from '@/componentes/assinatura.tsx';
import { DemonstracaoConversas } from './demonstracao-viva.tsx';

/**
 * Apresentação do produto na porta de entrada.
 *
 * O fluxo não simula uma conversa nem inventa métricas: ele mostra o mecanismo
 * real que diferencia o produto — canal, fundamento e decisão supervisionada.
 */
export function ApresentacaoEntrada() {
  return (
    <section className="luz-de-cima border-linha bg-superficie-2 relative hidden min-h-dvh overflow-hidden border-r lg:flex lg:flex-col">
      <div aria-hidden className="grao pointer-events-none absolute inset-0" />

      {/*
        `h-dvh`, e não `min-h-dvh`: com altura mínima, o painel de conversas
        empurrava a coluna para além da janela conforme as mensagens entravam —
        a página ganhava barra de rolagem, o conteúdo deslizava na horizontal e
        o formulário de acesso, centrado por `my-auto`, subia junto. A altura
        fixa transforma o espaço em orçamento: sobra é distribuída, não criada.
      */}
      <div className="relative flex h-dvh flex-col px-10 py-8 xl:px-14 xl:py-10 2xl:px-20">
        <header className="flex items-center justify-between">
          <Assinatura tamanho="md" />
          <span className="text-2xs text-texto-3 flex items-center gap-2 font-medium">
            <span aria-hidden className="bg-ok size-1.5 rounded-full" />
            Operação acompanhada em tempo real
          </span>
        </header>

        {/*
          O título e o parágrafo não encolhem; só a demonstração absorve a
          variação de espaço. `justify-center` preserva a composição centrada
          quando sobra altura, e `min-h-0` é o que permite ao filho encolher
          abaixo do próprio conteúdo — sem isso, um item de flex nunca cede.
        */}
        <div className="flex w-full max-w-[48rem] min-h-0 flex-1 flex-col justify-center py-12">
          <h1 className="text-texto max-w-[13ch] shrink-0 text-[clamp(2.25rem,4.2vw,4.5rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-balance">
            Cada conversa segue o caminho certo.
          </h1>
          <p className="text-texto-2 mt-6 max-w-[42rem] shrink-0 text-[clamp(1rem,1.35vw,1.25rem)] leading-relaxed">
            O Otto reúne seus canais, consulta o conhecimento oficial da empresa e sabe quando
            responder ou trazer uma pessoa para a conversa.
          </p>

          <DemonstracaoConversas />
        </div>

        <footer className="border-linha text-texto-2 grid grid-cols-3 border-t pt-5 text-xs">
          <p>Fundamento antes da resposta</p>
          <p className="text-center">Aprendizado com aprovação</p>
          <p className="text-right">Humano sempre no controle</p>
        </footer>
      </div>
    </section>
  );
}
