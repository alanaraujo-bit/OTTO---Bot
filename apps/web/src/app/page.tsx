import { redirect } from 'next/navigation';

import { sessaoAtual } from '@/servidor/sessao.ts';

/**
 * Porta de entrada.
 *
 * Decide para onde a pessoa vai assim que chega. Uma empresa só — o caso da
 * esmagadora maioria — não merece uma tela de escolha com um item.
 */
export default async function Raiz() {
  const sessao = await sessaoAtual();
  if (!sessao) redirect('/entrar');

  if (sessao.empresas.length === 0) redirect('/sem-empresa');

  // Volta para onde a pessoa estava, se ela ainda tiver acesso.
  const ultima = sessao.ultimaEmpresaId
    ? sessao.empresas.find((e) => e.id === sessao.ultimaEmpresaId)
    : undefined;

  const destino = ultima ?? sessao.empresas[0]!;
  redirect(`/e/${destino.slug}`);
}
