import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SeletorTema } from '@otto/ui';

import { ehPlataforma } from '@otto/core/plataforma';

import { Assinatura } from '@/componentes/assinatura.tsx';
import { BotaoSair } from '@/componentes/botao-sair.tsx';
import { exigirSessao } from '@/servidor/sessao.ts';

/**
 * Backoffice da plataforma.
 *
 * Quem não tem papel de plataforma recebe 404, e não 403: a existência do
 * backoffice não é confirmada para quem não deveria saber que ele existe.
 *
 * O visual é o mesmo sistema, com um pouco mais de densidade — é uma ferramenta
 * técnica usada por nós, não por clientes.
 */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  const sessao = await exigirSessao('/admin');
  if (!ehPlataforma(sessao.usuario.papelPlataforma)) notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-linha bg-superficie px-4 py-2.5">
        <Assinatura tamanho="sm" />
        <span className="rounded-xs border border-linha-firme px-1.5 py-0.5 text-2xs tracking-[0.06em] text-texto-2 uppercase">
          Plataforma
        </span>

        <nav aria-label="Seções do backoffice" className="flex gap-0.5">
          {[
            { href: '/admin', rotulo: 'Visão geral' },
            { href: '/admin/empresas', rotulo: 'Empresas' },
            { href: '/admin/auditoria', rotulo: 'Auditoria' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-sm px-2.5 py-1 text-xs font-medium text-texto-2 transition-colors duration-[120ms] hover:bg-superficie-2 hover:text-texto"
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-2xs text-texto-3 sm:inline">{sessao.usuario.nome}</span>
          <SeletorTema />
          <BotaoSair rotulo="" />
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
