'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AtSign, MessageCircle, Search, FlaskConical, X } from 'lucide-react';
import { cn, Etiqueta, Vazio, tempoRelativo } from '@otto/ui';

import type { ContagemInbox, ItemInbox, FiltroStatus } from '@otto/core/conversations';

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

const FILTROS: { valor: FiltroStatus; rotulo: string; chave: keyof ContagemInbox }[] = [
  { valor: 'abertas', rotulo: 'Abertas', chave: 'abertas' },
  { valor: 'aguardando_humano', rotulo: 'Esperando', chave: 'aguardando_humano' },
  { valor: 'resolvidas', rotulo: 'Resolvidas', chave: 'resolvidas' },
  { valor: 'todas', rotulo: 'Todas', chave: 'todas' },
];

export function ListaConversas({
  conversas,
  contagem,
  empresaSlug,
  conversaAtiva,
  filtroAtual,
  buscaAtual,
}: {
  conversas: ItemInbox[];
  contagem: ContagemInbox;
  empresaSlug: string;
  conversaAtiva?: string;
  filtroAtual: FiltroStatus;
  buscaAtual?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [busca, setBusca] = useState(buscaAtual ?? '');
  const primeiraRenda = useRef(true);

  // Debounce: a busca só vai para a URL depois que a pessoa para de digitar.
  useEffect(() => {
    if (primeiraRenda.current) {
      primeiraRenda.current = false;
      return;
    }
    const t = setTimeout(() => {
      const novos = new URLSearchParams(params.toString());
      if (busca.trim()) novos.set('busca', busca.trim());
      else novos.delete('busca');
      router.replace(`${pathname}?${novos.toString()}`, { scroll: false });
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function trocarFiltro(valor: FiltroStatus) {
    const novos = new URLSearchParams(params.toString());
    if (valor === 'abertas') novos.delete('status');
    else novos.set('status', valor);
    router.push(`${pathname}?${novos.toString()}`, { scroll: false });
  }

  return (
    <div className="bg-superficie flex h-full min-h-0 flex-col">
      <div className="border-linha shrink-0 border-b px-3 pt-2.5 pb-2">
        <div className="relative">
          <Search
            aria-hidden
            strokeWidth={1.5}
            className="text-texto-3 pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar conversas"
            className={cn(
              'border-linha-firme bg-superficie-2/60 text-texto h-9 w-full rounded-sm border pr-8 pl-8 text-sm',
              'placeholder:text-texto-3',
              'transition-colors duration-[var(--dur-controle)]',
              'focus:bg-superficie focus-visible:border-marca focus-visible:ring-marca/20 focus:outline-none focus-visible:ring-2',
              'max-md:h-11',
            )}
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="text-texto-3 hover:text-texto-2 absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-xs"
            >
              <X aria-hidden strokeWidth={1.5} className="size-3.5" />
            </button>
          )}
        </div>

        <div role="tablist" aria-label="Filtrar conversas" className="mt-2 flex gap-0.5">
          {FILTROS.map((f) => {
            const ativo = filtroAtual === f.valor;
            const n = contagem[f.chave];
            // Contador só onde ele muda o que a pessoa faz: na aba ativa (quantas
            // ela está vendo) e sempre em "Esperando" (o tamanho da fila).
            const mostrarN = n > 0 && (ativo || f.valor === 'aguardando_humano');
            return (
              <button
                key={f.valor}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => trocarFiltro(f.valor)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium whitespace-nowrap',
                  'transition-colors duration-[var(--dur-controle)] ease-[var(--ease-padrao)]',
                  'max-md:min-h-9',
                  ativo
                    ? 'bg-superficie-2 text-texto'
                    : 'text-texto-3 hover:bg-superficie-2/60 hover:text-texto-2',
                )}
              >
                {f.rotulo}
                {mostrarN && (
                  <span
                    data-numerico
                    className={cn(
                      'text-2xs rounded-full px-1 tabular-nums',
                      f.valor === 'aguardando_humano'
                        ? 'bg-atencao-suave text-atencao'
                        : 'bg-superficie-3 text-texto-2',
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {conversas.length === 0 ? (
        <Vazio
          icone={<Search />}
          titulo={buscaAtual ? 'Nada encontrado' : 'Nenhuma conversa aqui'}
          descricao={
            buscaAtual
              ? `Nenhuma conversa com "${buscaAtual}". Tente outro nome ou número.`
              : filtroAtual === 'aguardando_humano'
                ? 'Nada esperando por uma pessoa agora. Quando a Bia precisar de ajuda, a conversa aparece aqui.'
                : 'Assim que um cliente enviar mensagem por um canal conectado, a conversa aparece nesta lista.'
          }
        />
      ) : (
        <ul className="rolagem min-h-0 flex-1">
          {conversas.map((c) => {
            const Icone = ICONE_CANAL[c.canal as keyof typeof ICONE_CANAL] ?? MessageCircle;
            const ativa = c.id === conversaAtiva;
            const esperando = c.status === 'aguardando_humano';
            const naoLida = c.naoLidas > 0;

            return (
              <li key={c.id}>
                <Link
                  href={`/e/${empresaSlug}/conversas/${c.id}`}
                  prefetch={false}
                  aria-current={ativa ? 'true' : undefined}
                  className={cn(
                    'border-linha relative flex gap-2.5 border-b px-3 py-2 max-md:py-2.5',
                    'transition-colors duration-[var(--dur-controle)] ease-[var(--ease-padrao)]',
                    ativa ? 'bg-superficie-2' : 'hover:bg-superficie-2/50',
                  )}
                >
                  {ativa && (
                    <span
                      aria-hidden
                      className="bg-marca absolute inset-y-1.5 left-0 w-0.5 rounded-full"
                    />
                  )}

                  <span className="relative mt-0.5 shrink-0">
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full text-xs font-medium',
                        esperando
                          ? 'bg-atencao-suave text-atencao'
                          : 'bg-superficie-3 text-texto-2',
                      )}
                    >
                      {inicial(c.contatoNome)}
                    </span>
                    {(c.canal === 'whatsapp' || c.canal === 'instagram') && (
                      <span className="bg-superficie absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full">
                        <Icone aria-hidden strokeWidth={2} className="text-texto-3 size-2.5" />
                      </span>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm',
                          naoLida ? 'text-texto font-semibold' : 'text-texto font-medium',
                        )}
                      >
                        {c.contatoNome ?? 'Contato sem nome'}
                      </p>
                      {c.ultimaMensagemEm && (
                        <time
                          dateTime={c.ultimaMensagemEm.toISOString()}
                          className={cn(
                            'text-2xs shrink-0 tabular-nums',
                            esperando ? 'text-atencao font-medium' : 'text-texto-3',
                          )}
                        >
                          {tempoRelativo(c.ultimaMensagemEm)}
                        </time>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center gap-2">
                      <p
                        className={cn(
                          'min-w-0 flex-1 truncate text-xs',
                          naoLida ? 'text-texto-2' : 'text-texto-3',
                        )}
                      >
                        {c.ultimaDoCliente ? '' : 'Você: '}
                        {c.previa ?? 'Sem mensagens'}
                      </p>
                      {esperando ? (
                        <Etiqueta tom="atencao" ponto>
                          Esperando
                        </Etiqueta>
                      ) : c.atribuidaA ? (
                        <Etiqueta tom="neutro">{c.atribuidaA}</Etiqueta>
                      ) : naoLida ? (
                        <Etiqueta tom="marca">
                          {c.naoLidas} {c.naoLidas === 1 ? 'nova' : 'novas'}
                        </Etiqueta>
                      ) : null}
                    </div>
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

function inicial(nome: string | null): string {
  return nome?.trim()?.[0]?.toUpperCase() ?? '?';
}
