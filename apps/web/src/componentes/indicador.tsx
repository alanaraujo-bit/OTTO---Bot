import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@otto/ui';

/**
 * Indicador operacional.
 *
 * Deliberadamente **não** é um card: sem borda, sem fundo, sem sombra. Vinte
 * caixas iguais empilhadas é o visual de dashboard de template que o produto
 * recusa. Aqui o número carrega a hierarquia e a linha separa os grupos.
 *
 * `href` existe porque toda métrica precisa levar às conversas que a originaram
 * (§18). Um número que não vai a lugar nenhum é decoração.
 */
export function Indicador({
  rotulo,
  valor,
  apoio,
  href,
  destaque = false,
  atencao = false,
}: {
  rotulo: string;
  valor: string | number;
  /** Contexto curto: o período, a comparação, a unidade. */
  apoio?: string;
  href?: string;
  /** Para o número que interrompe alguém. Um por tela, no máximo. */
  destaque?: boolean;
  atencao?: boolean;
}) {
  const conteudo = (
    <>
      <p className="text-xs text-texto-2">{rotulo}</p>
      <p
        data-numerico
        className={cn(
          'mt-1 font-semibold tracking-[-0.02em] tabular-nums',
          destaque ? 'text-2xl' : 'text-xl',
          atencao && Number(valor) > 0 ? 'text-atencao' : 'text-texto',
        )}
      >
        {valor}
      </p>
      {apoio && <p className="mt-0.5 text-2xs text-texto-3">{apoio}</p>}
    </>
  );

  if (!href) return <div className="min-w-0">{conteudo}</div>;

  return (
    <Link
      href={href}
      className="group min-w-0 rounded-sm transition-colors duration-[120ms] hover:bg-superficie-2 -mx-2 px-2 py-1 -my-1"
    >
      {conteudo}
      <span className="mt-1.5 inline-flex items-center gap-1 text-2xs text-texto-3 transition-colors group-hover:text-marca">
        Ver conversas
        <ArrowRight aria-hidden strokeWidth={1.5} className="size-3" />
      </span>
    </Link>
  );
}
