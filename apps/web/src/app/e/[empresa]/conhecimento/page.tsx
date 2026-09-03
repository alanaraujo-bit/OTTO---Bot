import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, Plus } from 'lucide-react';
import { Botao, Etiqueta, Vazio, tempoRelativo } from '@otto/ui';

import { listarItens, type StatusItem } from '@otto/core/knowledge';
import { pode } from '@otto/core/auth';

import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Conhecimento' };

/**
 * Centro de Conhecimento.
 *
 * Responde às quatro perguntas do §4 da missão: o que minha IA sabe, de onde
 * veio, quando mudou, quem mudou. Por isso a lista mostra status, versão e uso
 * real — e não só o título.
 */

const TOM_STATUS: Record<StatusItem, { tom: 'ok' | 'atencao' | 'neutro' | 'marca'; rotulo: string }> =
  {
    publicado: { tom: 'ok', rotulo: 'Publicado' },
    rascunho: { tom: 'neutro', rotulo: 'Rascunho' },
    em_aprovacao: { tom: 'marca', rotulo: 'Aguardando aprovação' },
    desatualizado: { tom: 'atencao', rotulo: 'Desatualizado' },
    arquivado: { tom: 'neutro', rotulo: 'Arquivado' },
  };

const ROTULO_TIPO: Record<string, string> = {
  fato: 'Fato',
  pergunta_frequente: 'Pergunta frequente',
  politica: 'Política',
  procedimento: 'Procedimento',
  servico: 'Serviço',
  horario: 'Horário',
  localizacao: 'Localização',
  documento: 'Documento',
};

export default async function PaginaConhecimento({
  params,
}: {
  params: Promise<{ empresa: string }>;
}) {
  const { empresa: slug } = await params;
  const acesso = await exigirAcesso(slug);
  const itens = await listarItens(acesso.empresa.id);
  const podeEditar = pode(acesso, 'conhecimento.editar');

  const publicados = itens.filter((i) => i.status === 'publicado').length;
  const pendentes = itens.filter(
    (i) => i.status === 'rascunho' || i.status === 'em_aprovacao',
  ).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Conhecimento</h1>
          <p className="mt-0.5 text-sm text-texto-2">
            {itens.length === 0
              ? 'O que o atendente virtual pode responder sobre a sua empresa.'
              : `${publicados} ${publicados === 1 ? 'item publicado' : 'itens publicados'}${
                  pendentes > 0 ? ` · ${pendentes} aguardando publicação` : ''
                }`}
          </p>
        </div>

        {podeEditar && (
          <Botao
            variante="primaria"
            tamanho="sm"
            icone={<Plus strokeWidth={1.5} />}
            // O formulário de criação chega junto com a edição inline; até lá o
            // caminho é o mesmo da edição de um item existente.
            disabled
            title="Em construção"
          >
            Novo item
          </Botao>
        )}
      </header>

      {itens.length === 0 ? (
        <div className="rounded-md border border-linha bg-superficie">
          <Vazio
            icone={<BookOpen />}
            titulo="Nenhum conhecimento cadastrado"
            descricao="O atendente virtual só responde o que estiver aqui. Comece pelo que os clientes mais perguntam: horário, formas de pagamento, entrega e serviços da loja."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-linha bg-superficie">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-left">
                <th scope="col" className="px-3 py-2 text-xs font-medium text-texto-3">
                  Item
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-xs font-medium text-texto-3 sm:table-cell"
                >
                  Situação
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-right text-xs font-medium text-texto-3 md:table-cell"
                >
                  Usos
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-right text-xs font-medium text-texto-3 lg:table-cell"
                >
                  Atualizado
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const status = TOM_STATUS[item.status];
                return (
                  <tr key={item.id} className="border-b border-linha last:border-0">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/e/${slug}/conhecimento/${item.id}`}
                        className="font-medium text-texto hover:text-marca"
                      >
                        {item.titulo}
                      </Link>
                      <p className="mt-0.5 text-2xs text-texto-3">
                        {ROTULO_TIPO[item.tipo] ?? item.tipo}
                        {item.categoria && ` · ${item.categoria}`}
                        {item.status === 'publicado' && ` · versão ${item.versao}`}
                      </p>
                      <div className="mt-1.5 sm:hidden">
                        <Etiqueta tom={status.tom}>{status.rotulo}</Etiqueta>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      <Etiqueta tom={status.tom}>{status.rotulo}</Etiqueta>
                    </td>
                    <td
                      data-numerico
                      className="hidden px-3 py-2.5 text-right tabular-nums text-texto-2 md:table-cell"
                    >
                      {item.usos > 0 ? item.usos : <span className="text-texto-3">—</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right text-xs text-texto-3 lg:table-cell">
                      {tempoRelativo(item.atualizadoEm)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
