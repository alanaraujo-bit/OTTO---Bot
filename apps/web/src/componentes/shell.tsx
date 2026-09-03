'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Menu as MenuIcone,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
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
 * · **Desktop** — barra lateral fixa. Pode recolher para uma faixa de ícones
 *   quando a pessoa quer a tela inteira para o conteúdo; a escolha fica salva.
 * · **Celular** — barra inferior com os destinos mais usados, ao alcance do
 *   polegar. O resto vive no menu da conta. Cada troca de tela entra com um
 *   gesto curto, como em um aplicativo — não recarrega como um site.
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

const CHAVE_RECOLHIDA = 'otto:menu-recolhido';

export function Shell({ dados, children }: { dados: DadosShell; children: ReactNode }) {
  const pathname = usePathname();
  const ativo = itemAtivo(pathname, dados.empresa.slug);
  const permitidas = new Set(dados.permissoes);
  const itens = NAVEGACAO.filter((i) => permitidas.has(i.permissao));
  const noCelular = itens.filter((i) => i.noCelular).slice(0, 4);

  const noCelularIds = new Set(noCelular.map((i) => i.id));
  const noMenu = itens.filter((i) => !noCelularIds.has(i.id));

  // Dentro de uma conversa aberta, o celular entra em modo imersivo: sem
  // cabeçalho e sem barra inferior do console. A conversa tem o próprio
  // cabeçalho com "voltar" e ocupa a tela toda, como um aplicativo de mensagem.
  const imersivoCelular = /\/conversas\/[^/]+$/.test(pathname);

  const [recolhida, setRecolhida] = useState(false);
  const [montado, setMontado] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  // Fecha o menu ao trocar de tela.
  useEffect(() => setMenuAberto(false), [pathname]);

  // Trava a rolagem do fundo enquanto o menu está aberto — comportamento de app.
  useEffect(() => {
    if (!menuAberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [menuAberto]);

  useEffect(() => {
    try {
      setRecolhida(localStorage.getItem(CHAVE_RECOLHIDA) === '1');
    } catch {
      /* armazenamento bloqueado: barra aberta */
    }
    setMontado(true);
  }, []);

  function alternar() {
    setRecolhida((r) => {
      const novo = !r;
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, novo ? '1' : '0');
      } catch {
        /* vale só para esta sessão */
      }
      return novo;
    });
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* ── Barra lateral (desktop) ────────────────────────────────────────── */}
      <aside
        data-recolhida={recolhida || undefined}
        style={{ width: recolhida ? '3.75rem' : '13.75rem' }}
        className={cn(
          'group/barra sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-linha bg-superficie md:flex',
          montado && 'transition-[width] duration-[var(--dur-camada)] ease-[var(--ease-saida)] motion-reduce:transition-none',
        )}
      >
        <div className={cn('flex h-[3.25rem] items-center', recolhida ? 'justify-center px-0' : 'px-4')}>
          {recolhida ? <Assinatura tamanho="sm" apenasMarca /> : <Assinatura tamanho="sm" />}
        </div>

        <SeletorEmpresa
          empresa={dados.empresa}
          outras={dados.outrasEmpresas}
          recolhida={recolhida}
        />

        <nav aria-label="Seções" className="rolagem flex-1 px-2 py-2">
          <ul className="grid gap-0.5">
            {itens.map((item) => {
              const selecionado = ativo === item.id;
              return (
                <li key={item.id}>
                  <Link
                    href={`/e/${dados.empresa.slug}${item.caminho}`}
                    aria-current={selecionado ? 'page' : undefined}
                    title={recolhida ? item.rotulo : undefined}
                    className={cn(
                      'relative flex h-8 items-center rounded-sm text-sm',
                      'transition-colors duration-[var(--dur-controle)] ease-[var(--ease-padrao)]',
                      recolhida ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                      selecionado
                        ? 'bg-superficie-2 font-medium text-texto'
                        : 'text-texto-2 hover:bg-superficie-2 hover:text-texto',
                    )}
                  >
                    {selecionado && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-marca"
                      />
                    )}
                    <item.Icone
                      aria-hidden
                      strokeWidth={1.5}
                      className={cn('size-4 shrink-0', selecionado && 'text-marca')}
                    />
                    {!recolhida && <span className="truncate">{item.rotulo}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-linha p-2">
          <button
            type="button"
            onClick={alternar}
            aria-pressed={recolhida}
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'flex h-8 w-full items-center rounded-sm text-texto-3',
              'transition-colors duration-[var(--dur-controle)] hover:bg-superficie-2 hover:text-texto-2',
              recolhida ? 'justify-center px-0' : 'gap-2.5 px-2.5',
            )}
          >
            {recolhida ? (
              <PanelLeftOpen aria-hidden strokeWidth={1.5} className="size-4" />
            ) : (
              <>
                <PanelLeftClose aria-hidden strokeWidth={1.5} className="size-4 shrink-0" />
                <span className="text-xs">Recolher menu</span>
              </>
            )}
          </button>

          <div
            className={cn(
              'mt-1 flex items-center gap-2',
              recolhida ? 'flex-col' : 'px-1.5 py-1',
            )}
          >
            {!recolhida && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-texto">{dados.usuario.nome}</p>
                <p className="truncate text-2xs text-texto-3">{dados.papelRotulo}</p>
              </div>
            )}
            <form action={acaoSair} className={recolhida ? 'w-full' : undefined}>
              <button
                type="submit"
                aria-label="Sair da conta"
                title="Sair da conta"
                className={cn(
                  'flex items-center justify-center rounded-sm text-texto-3',
                  'transition-colors duration-[var(--dur-controle)] hover:bg-superficie-2 hover:text-texto',
                  recolhida ? 'h-8 w-full' : 'size-7',
                )}
              >
                <LogOut aria-hidden strokeWidth={1.5} className="size-3.5" />
              </button>
            </form>
          </div>

          {!recolhida && (
            <div className="mt-1 px-1.5">
              <SeletorTema />
            </div>
          )}
        </div>
      </aside>

      {/* ── Cabeçalho (celular) ────────────────────────────────────────────── */}
      <header
        className={cn(
          'area-segura-topo sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-linha bg-superficie px-4 py-2.5 md:hidden',
          imersivoCelular && 'hidden',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Assinatura tamanho="sm" apenasMarca />
          <p className="truncate text-sm font-semibold text-texto">{dados.empresa.nome}</p>
        </div>
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-sm text-texto-2 active:bg-superficie-2"
        >
          <MenuIcone aria-hidden strokeWidth={1.5} className="size-5" />
        </button>
      </header>

      <main
        key={pathname}
        // A largura útil do conteúdo é uma variável, e ela cresce quando a barra
        // recolhe: quem esconde o menu quer a tela para o conteúdo, não uma
        // margem maior. As páginas leem `--w-conteudo` / `--w-conteudo-amplo`.
        style={
          {
            '--w-conteudo': recolhida ? '92rem' : '84rem',
            '--w-conteudo-amplo': recolhida ? '112rem' : '104rem',
          } as React.CSSProperties
        }
        className={cn(
          // No desktop o console é uma aplicação, não um documento: a janela não
          // rola. `main` trava na altura da tela e cada tela cuida da própria
          // rolagem — cabeçalho e busca ficam parados, só a lista desce. No
          // celular a página rola normalmente, que é o gesto esperado ali.
          'min-w-0 flex-1 max-md:entra md:h-dvh md:overflow-hidden md:pb-0',
          imersivoCelular ? 'pb-0' : 'pb-[calc(3.75rem+env(safe-area-inset-bottom))]',
        )}
      >
        {children}
      </main>

      {/* ── Barra inferior (celular) ───────────────────────────────────────── */}
      <nav
        aria-label="Seções"
        className={cn(
          'area-segura-base fixed inset-x-0 bottom-0 z-20 flex border-t border-linha bg-superficie md:hidden',
          imersivoCelular && 'hidden',
        )}
      >
        {noCelular.map((item) => {
          const selecionado = ativo === item.id;
          return (
            <Link
              key={item.id}
              href={`/e/${dados.empresa.slug}${item.caminho}`}
              aria-current={selecionado ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2',
                'min-h-[3.25rem] transition-colors duration-[var(--dur-controle)]',
                selecionado ? 'text-marca' : 'text-texto-3 active:text-texto-2',
              )}
            >
              {selecionado && (
                <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-marca" />
              )}
              <item.Icone aria-hidden strokeWidth={1.5} className="size-[1.15rem]" />
              <span className="text-[0.625rem] leading-tight font-medium">{item.rotulo}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-0.5 py-2',
            'min-h-[3.25rem] transition-colors duration-[var(--dur-controle)]',
            menuAberto ? 'text-marca' : 'text-texto-3 active:text-texto-2',
          )}
        >
          <MenuIcone aria-hidden strokeWidth={1.5} className="size-[1.15rem]" />
          <span className="text-[0.625rem] leading-tight font-medium">Menu</span>
        </button>
      </nav>

      {menuAberto && (
        <MenuCelular
          dados={dados}
          itens={noMenu}
          ativo={ativo}
          aoFechar={() => setMenuAberto(false)}
        />
      )}
    </div>
  );
}

/**
 * Menu do celular.
 *
 * Sobe de baixo, cobre a tela e trava a rolagem do fundo — não é um dropdown de
 * site. Reúne o que não coube na barra inferior: as outras seções, a troca de
 * empresa, o tema e a saída.
 */
function MenuCelular({
  dados,
  itens,
  ativo,
  aoFechar,
}: {
  dados: DadosShell;
  itens: typeof NAVEGACAO;
  ativo: string;
  aoFechar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={aoFechar}
        className="absolute inset-0 bg-texto/30 [animation:aparece_var(--dur-estado)_var(--ease-saida)] motion-reduce:animate-none"
      />
      <div className="area-segura-base absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-lg border-t border-linha-firme bg-superficie shadow-[var(--shadow-camada)] [animation:sobe-de-baixo_var(--dur-camada)_var(--ease-saida)] motion-reduce:animate-none">
        <div className="area-segura-topo sticky top-0 flex items-center justify-between border-b border-linha bg-superficie px-4 py-3">
          <p className="text-sm font-semibold text-texto">{dados.empresa.nome}</p>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar menu"
            className="-mr-1.5 flex size-9 items-center justify-center rounded-sm text-texto-2 active:bg-superficie-2"
          >
            <X aria-hidden strokeWidth={1.5} className="size-5" />
          </button>
        </div>

        <nav aria-label="Mais seções" className="grid grid-cols-2 gap-2 p-4">
          {itens.map((item) => {
            const selecionado = ativo === item.id;
            return (
              <Link
                key={item.id}
                href={`/e/${dados.empresa.slug}${item.caminho}`}
                aria-current={selecionado ? 'page' : undefined}
                className={cn(
                  'flex min-h-[4.5rem] flex-col justify-center gap-1.5 rounded-md border p-3',
                  selecionado
                    ? 'border-marca/40 bg-marca-suave/60 text-texto'
                    : 'border-linha bg-superficie text-texto-2 active:bg-superficie-2',
                )}
              >
                <item.Icone
                  aria-hidden
                  strokeWidth={1.5}
                  className={cn('size-5', selecionado && 'text-marca')}
                />
                <span className="text-xs font-medium">{item.rotulo}</span>
              </Link>
            );
          })}
        </nav>

        {dados.outrasEmpresas.length > 0 && (
          <div className="border-t border-linha px-4 py-3">
            <p className="mb-2 text-2xs font-medium tracking-[0.04em] text-texto-3 uppercase">
              Trocar de empresa
            </p>
            <ul className="grid gap-1">
              {dados.outrasEmpresas.map((e) => (
                <li key={e.id}>
                  <form action={acaoTrocarEmpresa.bind(null, e.slug)}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-texto-2 active:bg-superficie-2"
                    >
                      <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-linha px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-texto">{dados.usuario.nome}</p>
            <p className="truncate text-2xs text-texto-3">{dados.papelRotulo}</p>
          </div>
          <SeletorTema />
        </div>

        <div className="border-t border-linha p-3">
          <form action={acaoSair}>
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-sm text-sm font-medium text-falha active:bg-falha-suave"
            >
              <LogOut aria-hidden strokeWidth={1.5} className="size-4" />
              Sair da conta
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Troca de empresa.
 *
 * Com uma empresa só, vira um rótulo — um seletor de um item é ruído. Some por
 * inteiro no celular, onde o nome já está no cabeçalho, e vira um ícone quando a
 * barra está recolhida.
 */
function SeletorEmpresa({
  empresa,
  outras,
  recolhida,
}: {
  empresa: EmpresaResumo;
  outras: EmpresaResumo[];
  recolhida: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  if (recolhida) {
    return (
      <div className="mx-auto mb-1 flex size-9 items-center justify-center" title={empresa.nome}>
        <span className="flex size-7 items-center justify-center rounded-sm bg-superficie-2 text-xs font-semibold text-texto-2">
          {empresa.nome.slice(0, 1).toUpperCase()}
        </span>
      </div>
    );
  }

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
        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left transition-colors duration-[var(--dur-controle)] hover:bg-superficie-2"
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
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-texto-2 transition-colors duration-[var(--dur-controle)] hover:bg-superficie-2 hover:text-texto"
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
