import type { ReactNode } from 'react';

import { ROTULO_PAPEL } from '@otto/core/auth';

import { AoVivo } from '@/componentes/ao-vivo.tsx';
import { Shell } from '@/componentes/shell.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

/**
 * Layout de uma empresa.
 *
 * É aqui que o acesso é verificado, uma vez, para tudo que estiver abaixo.
 * `exigirAcesso` devolve 404 quando a pessoa não pertence à empresa — nunca 403,
 * que confirmaria a existência de um cliente nosso para quem não deveria saber.
 */
export default async function LayoutEmpresa({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ empresa: string }>;
}) {
  const { empresa: slug } = await params;
  const acesso = await exigirAcesso(slug);

  const outras = acesso.sessao.empresas
    .filter((e) => e.id !== acesso.empresa.id)
    .map((e) => ({ id: e.id, slug: e.slug, nome: e.nome, status: e.status }));

  return (
    <Shell
      dados={{
        empresa: {
          id: acesso.empresa.id,
          slug: acesso.empresa.slug,
          nome: acesso.empresa.nome,
          status: acesso.empresa.status,
        },
        outrasEmpresas: outras,
        usuario: { nome: acesso.sessao.usuario.nome, email: acesso.sessao.usuario.email },
        papelRotulo: ROTULO_PAPEL[acesso.empresa.papel].nome,
        permissoes: [...acesso.permissoes],
      }}
    >
      {/* Mantém tudo abaixo em dia sem F5: lista, contadores, estados e ticks. */}
      <AoVivo empresaSlug={acesso.empresa.slug} />
      {children}
    </Shell>
  );
}
