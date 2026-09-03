import { cn, marca } from '@otto/ui';

/**
 * Assinatura do produto.
 *
 * Uma marca provisória tem uma única obrigação: não fingir ser definitiva. Duas
 * barras de altura desigual — a conversa que chega e a resposta que volta —
 * desenhadas com os tokens do sistema, não um logotipo elaborado que teria de
 * ser jogado fora quando o nome comercial for decidido.
 */
export function Assinatura({
  className,
  tamanho = 'md',
  apenasMarca = false,
}: {
  className?: string;
  tamanho?: 'sm' | 'md';
  /** Só o desenho, sem o nome — para a barra lateral recolhida. */
  apenasMarca?: boolean;
}) {
  const sm = tamanho === 'sm';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span
        aria-hidden
        className={cn('flex items-end gap-[3px]', sm ? 'h-3.5' : 'h-4')}
      >
        <span className="w-[3px] rounded-[1px] bg-marca" style={{ height: '100%' }} />
        <span className="w-[3px] rounded-[1px] bg-marca/40" style={{ height: '62%' }} />
      </span>
      {!apenasMarca && (
        <span
          className={cn(
            'font-semibold tracking-[-0.01em] text-texto',
            sm ? 'text-sm' : 'text-base',
          )}
        >
          {marca.nome}
        </span>
      )}
    </div>
  );
}
