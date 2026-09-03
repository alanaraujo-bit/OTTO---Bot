'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AtSign, MessageCircle, Search, FlaskConical } from 'lucide-react';
import { cn, Etiqueta, Vazio, tempoRelativo } from '@otto/ui';

import type { ItemInbox, FiltroStatus } from '@otto/core/conversations';

/**
 * Lista de conversas.
 *
 * No desktop é a coluna esquerda de um painel dividido; no celular é a tela
 * inteira, e abrir uma conversa navega para outra tela. São composições
 * diferentes do mesmo dado, não a mesma tela encolhida.
 */

// Sem logotipos de marca: a biblioteca os removeu, e o design system pede um
// traço único. O arroba identifica o Direct melhor que um logo colorido faria.
const ICONE_CANAL = {
  whatsapp: MessageCircle,
  instagram: AtSign,
  simulador: FlaskConical,
} as const;

const FILTROS: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: 'abertas', rotulo: 'Abertas' },
  { valor: 'aguardando_humano', rotulo: 'Esperando' },
  { valor: 'resolvidas', rotulo: 'Resolvidas' },
  { valor: 'todas', rotulo: 'Todas' },
];

export function ListaConversas({
  conversas,
  empresaSlug,
  conversaAtiva,
  filtroAtual,
}: {
  conversas: ItemInbox[];
  empresaSlug: string;
  conversaAtiva?: string;
  filtroAtual: FiltroStatus;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function trocarFiltro(valor: FiltroStatus) {
    const novos = new URLSearchParams(params.toString());
    if (valor === 'abertas') novos.delete('status');
    else novos.set('status', valor);
    router.push(`${pathname}?${novos.toString()}`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-linha px-3 py-2.5">
        <div
          role="tablist"
          aria-label="Filtrar conversas"
          className="flex gap-0.5 overflow-x-auto"
        >
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              role="tab"
              aria-selected={filtroAtual === f.valor}
              onClick={() => trocarFiltro(f.valor)}
              className={cn(
                'shrink-0 rounded-sm px-2.5 py-1 text-xs font-medium whitespace-nowrap',
                'transition-colors duration-[120ms] ease-[var(--ease-padrao)]',
                'max-md:min-h-9 max-md:px-3',
                filtroAtual === f.valor
                  ? 'bg-superficie-2 text-texto'
                  : 'text-texto-3 hover:bg-superficie-2 hover:text-texto-2',
              )}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>

      {conversas.length === 0 ? (
        <Vazio
          icone={<Search />}
          titulo="Nenhuma conversa aqui"
          descricao={
            filtroAtual === 'aguardando_humano'
              ? 'Nada esperando por uma pessoa no momento. Quando a IA precisar de ajuda, a conversa aparece aqui.'
              : 'Assim que um cliente enviar mensagem por um canal conectado, a conversa aparece nesta lista.'
          }
        />
      ) : (
        <ul className="rolagem min-h-0 flex-1">
          {conversas.map((c) => {
            const Icone = ICONE_CANAL[c.canal as keyof typeof ICONE_CANAL] ?? MessageCircle;
            const ativa = c.id === conversaAtiva;
            const esperando = c.status === 'aguardando_humano';

            return (
              <li key={c.id}>
                <Link
                  href={`/e/${empresaSlug}/conversas/${c.id}`}
                  aria-current={ativa ? 'true' : undefined}
                  className={cn(
                    'flex gap-2.5 border-b border-linha px-3 py-2.5',
                    'transition-colors duration-[120ms] ease-[var(--ease-padrao)]',
                    ativa ? 'bg-superficie-2' : 'hover:bg-superficie-2/60',
                  )}
                >
                  <Icone
                    aria-hidden
                    strokeWidth={1.5}
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      esperando ? 'text-atencao' : 'text-texto-3',
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm',
                          c.naoLidas > 0 ? 'font-semibold text-texto' : 'font-medium text-texto',
                        )}
                      >
                        {c.contatoNome ?? 'Contato sem nome'}
                      </p>
                      {c.ultimaMensagemEm && (
                        <time
                          dateTime={c.ultimaMensagemEm.toISOString()}
                          className="shrink-0 text-2xs text-texto-3"
                        >
                          {tempoRelativo(c.ultimaMensagemEm)}
                        </time>
                      )}
                    </div>

                    <p
                      className={cn(
                        'mt-0.5 truncate text-xs',
                        c.naoLidas > 0 ? 'text-texto-2' : 'text-texto-3',
                      )}
                    >
                      {c.previa ?? 'Sem mensagens'}
                    </p>

                    {(esperando || c.atribuidaA || c.naoLidas > 0) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {esperando && (
                          <Etiqueta tom="atencao" ponto>
                            Esperando você
                          </Etiqueta>
                        )}
                        {c.atribuidaA && <Etiqueta tom="neutro">{c.atribuidaA}</Etiqueta>}
                        {c.naoLidas > 0 && !esperando && (
                          <Etiqueta tom="marca">
                            {c.naoLidas} {c.naoLidas === 1 ? 'nova' : 'novas'}
                          </Etiqueta>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
