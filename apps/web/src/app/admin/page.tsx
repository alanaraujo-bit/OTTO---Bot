import type { Metadata } from 'next';
import Link from 'next/link';
import { cn, Etiqueta, tempoRelativo } from '@otto/ui';

import { formatarCusto } from '@otto/core/metricas';
import { listarEmpresas, saudeDaPlataforma } from '@otto/core/plataforma';

export const metadata: Metadata = { title: 'Plataforma' };

/**
 * Visão geral da plataforma.
 *
 * Alarmes primeiro. Cada número da seção de atenção deveria ser zero — se não
 * for, alguém precisa agir agora. Volume e custo vêm depois, como contexto.
 */
export default async function PaginaAdmin() {
  const [saude, empresas] = await Promise.all([saudeDaPlataforma(), listarEmpresas()]);

  const alarmes = [
    {
      rotulo: 'Envios travados',
      valor: saude.enviosPresos,
      ajuda: 'Pendentes há mais de 5 minutos',
    },
    { rotulo: 'Envios com falha', valor: saude.enviosFalhos, ajuda: 'Últimas 24 horas' },
    { rotulo: 'Erros de IA', valor: saude.errosDeIa, ajuda: 'Últimas 24 horas' },
    { rotulo: 'Canais com problema', valor: saude.canaisComProblema, ajuda: 'Degradados ou fora' },
  ];

  const tudoLimpo = alarmes.every((a) => a.valor === 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-texto">Visão geral</h1>
        <p className="mt-0.5 text-sm text-texto-2">
          {saude.empresasAtivas} {saude.empresasAtivas === 1 ? 'empresa ativa' : 'empresas ativas'}
          {saude.empresasSuspensas > 0 && ` · ${saude.empresasSuspensas} suspensa`}
        </p>
      </header>

      <section className="mb-7">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
          Precisa de atenção
          {tudoLimpo && <Etiqueta tom="ok">tudo certo</Etiqueta>}
        </h2>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {alarmes.map((a) => (
            <div key={a.rotulo}>
              <p className="text-xs text-texto-2">{a.rotulo}</p>
              <p
                data-numerico
                className={cn(
                  'mt-1 text-xl font-semibold tabular-nums',
                  a.valor > 0 ? 'text-falha' : 'text-texto-3',
                )}
              >
                {a.valor}
              </p>
              <p className="mt-0.5 text-2xs text-texto-3">{a.ajuda}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
          Últimas 24 horas
        </h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Numero rotulo="Conversas" valor={saude.conversasHoje} />
          <Numero rotulo="Mensagens" valor={saude.mensagensHoje} />
          <Numero rotulo="Custo de IA" valor={formatarCusto(saude.custoHojeMicroUsd)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium tracking-[0.04em] text-texto-3 uppercase">
          Empresas
        </h2>

        <div className="overflow-x-auto rounded-md border border-linha bg-superficie">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-linha text-left">
                {['Empresa', 'Situação', 'Canais', 'Conversas (7d)', 'Custo (7d)', 'Atividade'].map(
                  (c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={cn(
                        'px-3 py-2 text-xs font-medium text-texto-3',
                        i >= 2 && 'text-right',
                      )}
                    >
                      {c}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className="border-b border-linha last:border-0">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/empresas/${e.id}`}
                      className="font-medium text-texto hover:text-marca"
                    >
                      {e.nome}
                    </Link>
                    <p className="mt-0.5 font-mono text-2xs text-texto-3">{e.slug}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <Etiqueta tom={e.status === 'ativo' ? 'ok' : 'atencao'}>
                      {e.status === 'ativo'
                        ? 'Ativa'
                        : e.status === 'suspenso'
                          ? 'Suspensa'
                          : 'Implantação'}
                    </Etiqueta>
                  </td>
                  <td data-numerico className="px-3 py-2.5 text-right tabular-nums text-texto-2">
                    {e.canaisConectados}/{e.canais}
                  </td>
                  <td data-numerico className="px-3 py-2.5 text-right tabular-nums text-texto-2">
                    {e.conversas7dias}
                  </td>
                  <td data-numerico className="px-3 py-2.5 text-right tabular-nums text-texto-2">
                    {formatarCusto(e.custo7diasMicroUsd)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-texto-3">
                    {e.ultimaAtividade ? tempoRelativo(e.ultimaAtividade) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div>
      <p className="text-xs text-texto-2">{rotulo}</p>
      <p data-numerico className="mt-1 text-xl font-semibold tabular-nums text-texto">
        {valor}
      </p>
    </div>
  );
}
