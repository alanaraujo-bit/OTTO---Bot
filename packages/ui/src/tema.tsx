'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { cn } from './cn.ts';

/**
 * Tema.
 *
 * Três estados, não dois: claro, escuro e "seguir o sistema". Seguir o sistema é
 * o padrão, e é um estado real — não a ausência de escolha —, porque o aparelho
 * do Sr. Fernando muda sozinho à noite.
 *
 * A escolha vai para `localStorage` e é aplicada por um script inline antes da
 * primeira pintura (ver `ScriptTema`), senão a tela pisca branca ao carregar no
 * escuro. Esse piscar é a diferença mais visível entre um app e um site.
 */

export type Tema = 'claro' | 'escuro' | 'sistema';

const CHAVE = 'otto:tema';

interface ContextoTema {
  tema: Tema;
  definir: (tema: Tema) => void;
}

const Contexto = createContext<ContextoTema | null>(null);

/**
 * Roda antes da hidratação. Precisa ser pequeno, síncrono e não lançar erro em
 * navegador com armazenamento bloqueado.
 */
export const scriptTema = `
(function(){
  try {
    var t = localStorage.getItem('${CHAVE}');
    if (t === 'claro' || t === 'escuro') {
      document.documentElement.dataset.tema = t;
    }
  } catch (e) {}
})();
`;

export function ProvedorTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>('sistema');

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo === 'claro' || salvo === 'escuro') setTema(salvo);
    } catch {
      /* armazenamento bloqueado: seguimos o sistema */
    }
  }, []);

  const definir = useCallback((novo: Tema) => {
    setTema(novo);
    const raiz = document.documentElement;

    if (novo === 'sistema') {
      delete raiz.dataset.tema;
    } else {
      raiz.dataset.tema = novo;
    }

    try {
      if (novo === 'sistema') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, novo);
    } catch {
      /* a escolha vale para esta sessão */
    }
  }, []);

  return <Contexto.Provider value={{ tema, definir }}>{children}</Contexto.Provider>;
}

export function useTema(): ContextoTema {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useTema precisa estar dentro de <ProvedorTema>.');
  return ctx;
}

const OPCOES: { valor: Tema; rotulo: string; Icone: typeof Sun }[] = [
  { valor: 'claro', rotulo: 'Tema claro', Icone: Sun },
  { valor: 'sistema', rotulo: 'Seguir o sistema', Icone: Monitor },
  { valor: 'escuro', rotulo: 'Tema escuro', Icone: Moon },
];

/** Alternador de três posições. O estado atual é dito por `aria-checked`. */
export function SeletorTema({ className }: { className?: string }) {
  const { tema, definir } = useTema();

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm border border-linha bg-superficie-2 p-0.5',
        className,
      )}
    >
      {OPCOES.map(({ valor, rotulo, Icone }) => {
        const ativo = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={rotulo}
            title={rotulo}
            onClick={() => definir(valor)}
            className={cn(
              'flex size-6 items-center justify-center rounded-xs',
              'transition-colors duration-[120ms] ease-[var(--ease-padrao)]',
              ativo
                ? 'bg-superficie text-texto shadow-[var(--shadow-suspensa)]'
                : 'text-texto-3 hover:text-texto-2',
            )}
          >
            <Icone aria-hidden className="size-3.5" strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
