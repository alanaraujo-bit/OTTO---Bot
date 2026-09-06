/**
 * Campo de conversa.
 *
 * O assunto do produto virando a superfície da tela.
 *
 * Não são mensagens: são conversas vistas de tão longe que o texto sumiu e
 * sobrou a forma — blocos de tamanhos diferentes, encostados à esquerda quando
 * alguém pergunta e à direita quando o atendimento responde. Isso é regra, não
 * efeito: `PRODUCT.md` proíbe dado simulado que finge funcionar, e uma conversa
 * falsa com texto legível seria exatamente isso. Sem texto não há o que fingir.
 *
 * São várias colunas, e não uma, porque o produto não atende uma conversa: são
 * centenas por dia, ao mesmo tempo, e é isso que a tela precisa dizer. Uma
 * coluna só seria um aplicativo de mensagem; várias são uma operação.
 *
 * A cor carrega o produto sem uma linha de explicação: quem pergunta é neutro,
 * quem responde tem a cor da marca.
 *
 * As medidas vêm de um gerador com semente fixa, avaliado uma vez no módulo: a
 * mesma sequência no servidor e no cliente (sem divergência de hidratação), a
 * mesma tela em toda visita (sem loteria que às vezes compõe mal) e ritmo de
 * conversa de verdade em vez de grade regular.
 */

type Bloco = {
  /** `false` é a pergunta, à esquerda; `true` é a resposta, à direita. */
  responde: boolean;
  /** Porcentagem da largura da coluna. */
  largura: number;
  /** Altura em px — mensagem curta é um bloco baixo; longa, um bloco alto. */
  altura: number;
  /** Espaço acima, em px. Conversa tem pausa; grade regular não. */
  respiro: number;
  /**
   * Quanto esta resposta já avançou no ciclo, em segundos — vira atraso
   * NEGATIVO. Com atraso positivo todas partem do zero do ciclo e a tela fica
   * onze segundos parada antes do primeiro acender, que é justamente quando a
   * pessoa está olhando. Negativo espalha os eventos por todo o ciclo desde o
   * primeiro quadro.
   */
  avanco?: number;
};

/** Quanto a coluna desce, em px. Sem isso as colunas alinham e viram faixa. */
type Coluna = { blocos: Bloco[]; deslocamento: number };

const COLUNAS: Coluna[] = (() => {
  // Congruente linear com semente fixa — determinístico e sem dependência.
  let semente = 20260904;
  const proximo = () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };

  const colunas = Array.from({ length: 7 }, () => {
    const blocos: Bloco[] = [];
    // Uma conversa vem em turnos, e cada turno pode ter mais de uma mensagem
    // seguida do mesmo lado — quem pergunta complementa, quem responde detalha.
    let responde = proximo() > 0.5;
    while (blocos.length < 17) {
      const seguidas = 1 + Math.floor(proximo() * 2.2);
      for (let i = 0; i < seguidas && blocos.length < 17; i++) {
        blocos.push({
          responde,
          largura: 40 + proximo() * 45,
          altura: 12 + Math.round(proximo() * 19),
          // Espaço curto dentro do turno, largo entre turnos: é a pausa entre
          // a pergunta e a resposta que faz aquilo ler como conversa.
          respiro: i === 0 ? 20 + Math.round(proximo() * 22) : 5,
        });
      }
      responde = !responde;
    }
    // Cada fio começou em um momento diferente: alinhar os topos entregaria a
    // grade e desmontaria a ilusão de conversas independentes.
    return { blocos, deslocamento: Math.round(proximo() * 150) - 75 };
  });

  // Sete respostas acendem ao longo dos 17 s do ciclo, espalhadas por colunas
  // diferentes e igualmente espaçadas no tempo — uma a cada 2,4 s. Mais que
  // isso vira pisca-pisca; menos, e a tela parece parada.
  const respostas = colunas.flatMap((coluna, c) =>
    coluna.blocos
      .map((bloco, b) => ({ bloco, ordem: c * 31 + b }))
      .filter(({ bloco }) => bloco.responde),
  );
  respostas
    .filter((_, indice) => indice % 9 === 3)
    .slice(0, 7)
    .forEach(({ bloco }, ordem) => {
      bloco.avanco = (ordem * 17) / 7;
    });

  return colunas;
})();

export function CampoConversa() {
  return (
    <div
      aria-hidden
      // `fixed` e não `absolute`: o campo é o ambiente da tela, e no celular a
      // página rola. Ambiente que rola junto vira papel de parede deslizando.
      className="pointer-events-none fixed inset-0 -z-10 grid grid-cols-3 items-center gap-x-8 overflow-hidden px-5 [mask-image:radial-gradient(34rem_30rem_at_50%_50%,transparent_46%,#000_100%)] sm:grid-cols-4 sm:gap-x-8 lg:grid-cols-7 lg:gap-x-10 lg:px-10"
    >
      {COLUNAS.map((coluna, indiceColuna) => (
        <div
          key={indiceColuna}
          style={{ transform: `translateY(${coluna.deslocamento}px)` }}
          className={[
            'flex flex-col',
            // As colunas extras só entram quando há largura para elas serem
            // uma conversa, e não uma tira.
            indiceColuna >= 3 && 'max-sm:hidden',
            indiceColuna >= 4 && 'max-lg:hidden',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {coluna.blocos.map((bloco, indiceBloco) => (
            <span
              key={indiceBloco}
              style={{
                width: `${bloco.largura}%`,
                height: `${bloco.altura}px`,
                marginTop: `${bloco.respiro}px`,
                // Acesa continua discreta: sai de onde as paradas estão e sobe
                // umas três vezes, não até o topo. O evento é para ser notado
                // de canto de olho, não para roubar a tela de quem veio digitar
                // a senha.
                ['--calma' as string]:
                  bloco.avanco === undefined ? undefined : 'var(--conversa-resposta)',
                ['--acesa' as string]:
                  bloco.avanco === undefined ? undefined : 'var(--conversa-acesa)',
                ['--atraso' as string]:
                  bloco.avanco === undefined ? undefined : `-${bloco.avanco.toFixed(2)}s`,
              }}
              className={[
                'shrink-0 rounded-xs',
                bloco.responde ? 'self-end bg-marca' : 'self-start bg-texto',
                // A animação escreve a opacidade das que acendem; classe aqui
                // só brigaria com ela.
                bloco.avanco !== undefined
                  ? 'resposta-sai'
                  : bloco.responde
                    ? 'opacity-[var(--conversa-resposta)]'
                    : 'opacity-[var(--conversa-pergunta)]',
              ].join(' ')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
