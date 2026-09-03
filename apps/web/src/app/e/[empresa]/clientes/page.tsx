import type { Metadata } from 'next';

import { listarClientes } from '@otto/core/contatos';

import { ListaClientes } from '@/componentes/clientes/lista.tsx';
import { PaginaLista } from '@/componentes/pagina.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Clientes' };

export default async function PaginaClientes({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ busca?: string }>;
}) {
  const { empresa: slug } = await params;
  const { busca } = await searchParams;
  const acesso = await exigirAcesso(slug);

  const clientes = await listarClientes(acesso.empresa.id, { busca });
  const totalConversas = clientes.reduce((s, c) => s + c.conversas, 0);

  return (
    <PaginaLista
      cabecalho={
        <>
          <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Clientes</h1>
          <p className="mt-0.5 text-sm text-texto-2">
            {busca
              ? `${clientes.length} ${clientes.length === 1 ? 'resultado' : 'resultados'} para "${busca}"`
              : clientes.length === 0
                ? 'Quem já entrou em contato com a sua empresa.'
                : `${clientes.length} ${
                    clientes.length === 1 ? 'pessoa atendida' : 'pessoas atendidas'
                  } · ${totalConversas} ${totalConversas === 1 ? 'conversa' : 'conversas'} no total`}
          </p>
        </>
      }
    >
      <ListaClientes clientes={clientes} empresaSlug={slug} buscaAtual={busca} />
    </PaginaLista>
  );
}
