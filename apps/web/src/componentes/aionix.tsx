import { ExternalLink } from 'lucide-react';
import { cn } from '@otto/ui';

/** Crédito discreto da empresa criadora — secundário ao acesso ao produto. */
export function ProdutoAionix({ className }: { className?: string }) {
  return (
    <a
      href="https://aionixdev.com"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Desenvolvido por Aionix — abrir site em nova aba"
      className={cn(
        'group text-2xs text-texto-3 inline-flex items-center gap-1.5',
        'hover:text-texto-2 transition-colors duration-[var(--dur-controle)]',
        className,
      )}
    >
      <span>Desenvolvido por</span>
      <span className="text-texto-2 group-hover:text-marca font-medium">Aionix</span>
      <ExternalLink
        aria-hidden
        strokeWidth={1.5}
        className="size-3 transition-transform duration-[var(--dur-controle)] group-hover:translate-x-px group-hover:-translate-y-px"
      />
    </a>
  );
}
