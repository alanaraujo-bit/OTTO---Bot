import { cn } from './cn.ts';

/**
 * Esqueleto de carregamento.
 *
 * Um bloco calmo na cor da superfície elevada, com um brilho que atravessa uma
 * vez a cada ciclo — não pisca. O ponto é ocupar o espaço exato que o conteúdo
 * vai ocupar, para a tela não pular quando ele chega.
 */
export function Esqueleto({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block overflow-hidden rounded-xs bg-superficie-2',
        'relative isolate',
        'after:absolute after:inset-0 after:-translate-x-full',
        'after:bg-gradient-to-r after:from-transparent after:via-superficie-3 after:to-transparent',
        'after:animate-[brilho_1.6s_ease-in-out_infinite]',
        'motion-reduce:after:hidden',
        className,
      )}
    />
  );
}
