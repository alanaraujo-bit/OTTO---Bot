import { cn, marca } from '@otto/ui';

/**
 * Assinatura do produto.
 *
 * Uma conversa organizada em uma única caixa de entrada: a moldura é a
 * operação; as duas linhas são atendimentos que chegam e seguem para a fila.
 * O desenho continua simples para que o codinome possa ser trocado sem
 * contaminar o produto.
 */
export function Assinatura({
  className,
  tamanho = 'md',
  apenasMarca = false,
  animada = true,
  sobreEscuro = false,
}: {
  className?: string;
  tamanho?: 'sm' | 'md';
  /** Só o desenho, sem o nome — para a barra lateral recolhida. */
  apenasMarca?: boolean;
  /** Mostra, em ciclo discreto, uma conversa chegando à fila. */
  animada?: boolean;
  /**
   * Painel de marca, que é escuro nos dois temas. Aqui os tokens de tema não
   * servem — `text-texto` viraria tinta escura sobre grafite no tema claro.
   */
  sobreEscuro?: boolean;
}) {
  const sm = tamanho === 'sm';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        aria-hidden
        viewBox="0 0 28 24"
        className={cn('shrink-0', sm ? 'h-4 w-[19px]' : 'h-5 w-[23px]', sobreEscuro ? 'text-[#6fd8c9]' : 'text-marca')}
      >
        <g className={animada ? 'marca-fluida' : undefined}>
          <path className="marca-caixa" d="M4.5 5.5A2.5 2.5 0 0 1 7 3h14a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 21 19H11l-5.5 3v-5.5a2.5 2.5 0 0 1-1-2V5.5Z" />
          <path className="marca-linha marca-linha-estavel" d="M9 9.5h9" />
          <path className="marca-linha marca-linha-chegando" d="M9 14h6.5" />
        </g>
      </svg>
      {!apenasMarca && (
        <span
          className={cn(
            'font-semibold tracking-[-0.01em]',
            sobreEscuro ? 'text-white' : 'text-texto',
            sm ? 'text-sm' : 'text-base',
          )}
        >
          {marca.nome}
        </span>
      )}
    </div>
  );
}
