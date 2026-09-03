'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, LogOut } from 'lucide-react';
import { cn, Etiqueta, SeletorTema } from '@otto/ui';

import type { Permissao } from '@otto/core/auth';
import { acaoSair, acaoTrocarEmpresa } from '@/servidor/acoes-sessao.ts';
import { Assinatura } from './assinatura.tsx';
import { NAVEGACAO, itemAtivo } from './navegacao.ts';

/**
 * Shell do console.
 *
 * Desktop e celular são composições diferentes da mesma informação, e não a
 * mesma barra encolhida:
 *
 * · **Desktop** — barra lateral fixa e estreita. Aproveita a largura que existe,
 *   deixa tudo a um clique, e o conteúdo ganha a tela inteira.
 * · **Celular** — barra inferior com os quatro destinos mais usados, ao alcance
 *   do polegar. O resto vive no menu da conta. Barra lateral no celular gasta a
 *   largura que a conversa precisa.
 */

export interface EmpresaResumo {
  id: string;
  slug: string;
  nome: string;
  status: string;
}

export interface DadosShell {
  empresa: EmpresaResumo;
  outrasEmpresas: EmpresaResumo[];
  usuario: { nome: string; email: string };
  papelRotulo: string;
  permissoes: Permissao[];
}

export function Shell({ dados, children }: { dados: DadosShell; children: ReactNode }) {
  const pathname = usePathname();
  const ativo = itemAtivo(pathname, dados.empresa.slug);
  const permitidas = new Set(dados.permissoes);
  const itens = NAVEGACAO.filter((i) => permitidas.has(i.permissao));
  const noCelular = itens.filter((i) => i.noCelular).slice(0, 4);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* ── Barra lateral (desktop) ────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh w-[13.5rem] shrink-0 flex-col border-r border-linha bg-superficie md:flex">
        <div className="px-4 py-3.5">
          <Assinatura tamanho="sm" />
        </div>

        <SeletorEmpresa empresa={dados.empresa} outras={dados.outrasEmpresas} />

        <nav aria-label="Seções" className="rolagem flex-1 px-2 py-2">
          <ul className="grid gap-0.5">
            {itens.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/e/${dados.empresa.slug}${item.caminho}`}
                  aria-current={ativo === item.id ? 'page' : undefined}
                  className={cn(
                    'flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-sm',
                    'transition-colors duration-[120ms] ease-[var(--ease-padrao)]',
                    ativo === item.id
                      ? 'bg-superficie-2 font-medium text-texto'
                      : 'text-texto-2 hover:bg-superficie-2 hover:text-texto',
                  )}
                >
                  <item.Icone
                    aria-hidden
                    strokeWidth={1.5}
                    className={cn('size-4 shrink-0', ativo === item.id && 'text-marca')}
                  />
                  <span className="truncate">{item.rotulo}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-linha p-2">
          <div className="flex items-center gap-2 px-1.5 py-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-texto">{dados.usuario.nome}</p>
              <p className="truncate text-2xs text-texto-3">{dados.papelRotulo}</p>
            </div>
            <form action={acaoSair}>
              <button
                type="submit"
                aria-label="Sair da conta"
                title="Sair da conta"
                className="flex size-7 items-center justify-center rounded-sm text-texto-3 transition-colors duration-[120ms] hover:bg-superficie-2 hover:text-texto"
              >
                <LogOut aria-hidden strokeWidth={1.5} className="size-3.5" />
              </button>
            </form>
          </div>
          <div className="mt-1 px-1.5">
            <SeletorTema />
          </div>
        </div>
      </aside>

      {/* ── Cabeçalho (celular) ────────────────────────────────────────────── */}
      <header className="area-segura-topo sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-linha bg-superficie px-4 py-2.5 md:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-texto">{dados.empresa.nome}</p>
          <p className="truncate text-2xs text-texto-3">{dados.papelRotulo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SeletorTema />
          <form action={acaoSair}>
            <button
              type="submit"
              aria-label="Sair da conta"
              className="flex size-9 items-center justify-center rounded-sm text-texto-3 active:bg-superficie-2"
            >
              <LogOut aria-hidden strokeWidth={1.5} className="size-4" />
            </button>
          </form>
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      {/* ── Barra inferior (celular) ───────────────────────────────────────── */}
      <nav
        aria-label="Seções"
        className="area-segura-base fixed inset-x-0 bottom-0 z-20 flex border-t border-linha bg-superficie md:hidden"
      >
        {noCelular.map((item) => {
          const selecionado = ativo === item.id;
          return (
            <Link
              key={item.id}
              href={`/e/${dados.empresa.slug}${item.caminho}`}
              aria-current={selecionado ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2',
                'min-h-[3.25rem] transition-colors duration-[120ms]',
                selecionado ? 'text-marca' : 'text-texto-3 active:text-texto-2',
              )}
            >
              <item.Icone aria-hidden strokeWidth={1.5} className="size-[1.15rem]" />
              <span className="text-[0.625rem] leading-tight font-medium">{item.rotulo}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Troca de empresa.
 *
 * Com uma empresa só, vira um rótulo — um seletor de um item é ruído. Some por
 * inteiro no celular, onde o nome já está no cabeçalho.
 */
function SeletorEmpresa({
  empresa,
  outras,
}: {
  empresa: EmpresaResumo;
  outras: EmpresaResumo[];
}) {
  const [aberto, setAberto] = useState(false);

  if (outras.length === 0) {
    return (
      <div className="mx-2 mb-1 rounded-sm px-2.5 py-1.5">
        <p className="truncate text-sm font-medium text-texto">{empresa.nome}</p>
        {empresa.status === 'suspenso' && (
          <Etiqueta tom="atencao" ponto className="mt-1">
            Suspensa
          </Etiqueta>
        )}
      </div>
    );
  }

  return (
    <div className="relative mx-2 mb-1">
      <button
        type="button"
        aria-expanded={aberto}
        aria-haspopup="listbox"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left transition-colors duration-[120ms] hover:bg-superficie-2"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-texto">
          {empresa.nome}
        </span>
        <ChevronsUpDown aria-hidden strokeWidth={1.5} className="size-3.5 shrink-0 text-texto-3" />
      </button>

      {aberto && (
        <>
          {/* Fecha ao clicar fora, sem prender o foco como um modal faria. */}
          <button
            type="button"
            aria-label="Fechar seletor de empresa"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAberto(false)}
          />
          <ul
            role="listbox"
            className="absolute inset-x-0 top-full z-20 mt-1 grid gap-0.5 rounded-md border border-linha-firme bg-superficie p-1 shadow-[var(--shadow-camada)]"
          >
            {[empresa, ...outras].map((e) => (
              <li key={e.id}>
                <form action={acaoTrocarEmpresa.bind(null, e.slug)}>
                  <button
                    type="submit"
                    role="option"
                    aria-selected={e.id === empresa.id}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-texto-2 transition-colors duration-[120ms] hover:bg-superficie-2 hover:text-texto"
                  >
                    <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                    {e.id === empresa.id && (
                      <Check aria-hidden strokeWidth={2} className="size-3.5 shrink-0 text-marca" />
                    )}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
