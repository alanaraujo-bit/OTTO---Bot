'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Search, Users, X } from 'lucide-react';
import { cn, Etiqueta, Vazio, formatarTelefone, tempoRelativo } from '@otto/ui';

import type { ClienteListado } from '@otto/core/contatos';
import { CartaoRolavel } from '@/componentes/pagina.tsx';

/**
 * Lista de clientes.
 *
 * Um CRM operacional, não um CRM: o que a lista mostra é o que ajuda a atender —
 * quem é, por onde falou, quando foi a última vez, e o atalho para a conversa.
 */

const ROTULO_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  simulador: 'Teste',
};

export function ListaClientes({
  clientes,
  empresaSlug,
  buscaAtual,
}: {
  clientes: ClienteListado[];
  empresaSlug: string;
  buscaAtual?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [busca, setBusca] = useState(buscaAtual ?? '');
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
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

  return (
    <>
      <div className="relative mb-3 shrink-0">
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
          aria-label="Buscar clientes"
          className={cn(
            'border-linha-firme bg-superficie text-texto h-9 w-full rounded-sm border px-8 text-sm',
            'placeholder:text-texto-3 transition-colors duration-[var(--dur-controle)]',
            'focus-visible:border-marca focus-visible:ring-marca/20 focus:outline-none focus-visible:ring-2',
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

      {clientes.length === 0 ? (
        <div className="border-linha bg-superficie rounded-md border">
          <Vazio
            icone={<Users />}
            titulo={buscaAtual ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
            descricao={
              buscaAtual
                ? 'Tente outro nome ou número de telefone.'
                : 'Cada pessoa que mandar mensagem por um canal conectado aparece aqui, com o histórico completo das conversas.'
            }
          />
        </div>
      ) : (
        <CartaoRolavel>
          <ul className="divide-linha divide-y">
            {clientes.map((c) => {
              const esperando = c.ultimoStatus === 'aguardando_humano';
              return (
                <li key={c.id}>
                  <Link
                    href={`/e/${empresaSlug}/clientes/${c.id}`}
                    prefetch={false}
                    className="group hover:bg-superficie-2 flex items-center gap-3 px-3 py-2 transition-colors duration-[var(--dur-controle)] md:px-4"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                        esperando
                          ? 'bg-atencao-suave text-atencao'
                          : 'bg-superficie-3 text-texto-2',
                      )}
                    >
                      {c.nome?.trim()?.[0]?.toUpperCase() ?? '?'}
                    </span>

                    <div className="grid min-w-0 flex-1 gap-x-2.5 md:grid-cols-[minmax(0,15rem)_1fr] md:items-baseline">
                      <div className="flex items-baseline gap-2">
                        <p className="text-texto min-w-0 truncate text-sm font-medium">
                          {c.nome ?? 'Contato sem nome'}
                        </p>
                        <span className="text-2xs text-texto-3 hidden shrink-0 md:inline">
                          {c.telefone ? formatarTelefone(c.telefone) : 'sem telefone'}
                        </span>
                      </div>
                      <p className="text-texto-3 mt-0.5 truncate text-xs md:mt-0">
                        {c.ultimaMensagem ?? 'Sem mensagens'}
                      </p>
                    </div>

                    <div className="hidden shrink-0 items-center gap-3 sm:flex">
                      {esperando && (
                        <Etiqueta tom="atencao" ponto>
                          Esperando
                        </Etiqueta>
                      )}
                      {c.canais
                        .filter((canal) => canal !== 'simulador')
                        .map((canal) => (
                          <Etiqueta key={canal} tom="neutro">
                            {ROTULO_CANAL[canal] ?? canal}
                          </Etiqueta>
                        ))}
                      <span
                        data-numerico
                        className="text-2xs text-texto-3 w-24 text-right whitespace-nowrap tabular-nums"
                      >
                        {c.conversas} {c.conversas === 1 ? 'conversa' : 'conversas'}
                      </span>
                    </div>

                    {c.ultimaInteracao && (
                      <time
                        dateTime={c.ultimaInteracao.toISOString()}
                        className={cn(
                          'text-2xs w-24 shrink-0 text-right whitespace-nowrap tabular-nums',
                          esperando ? 'text-atencao font-medium' : 'text-texto-3',
                        )}
                      >
                        {tempoRelativo(c.ultimaInteracao)}
                      </time>
                    )}

                    <ChevronRight
                      aria-hidden
                      strokeWidth={1.5}
                      className="text-texto-3 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </CartaoRolavel>
      )}
    </>
  );
}
