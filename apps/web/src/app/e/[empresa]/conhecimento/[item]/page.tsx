import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import { Cartao, Etiqueta, tempoRelativo } from '@otto/ui';

import { detalharItem, type StatusItem } from '@otto/core/knowledge';

import { exigirAcesso } from '@/servidor/sessao.ts';
import { Pagina } from '@/componentes/pagina.tsx';

export const metadata: Metadata = { title: 'Item de conhecimento' };

const TOM_STATUS: Record<
  StatusItem,
  { tom: 'ok' | 'atencao' | 'neutro' | 'marca'; rotulo: string; explicacao: string }
> = {
  publicado: {
    tom: 'ok',
    rotulo: 'Publicado',
    explicacao: 'A Bia usa este conteúdo para responder os clientes.',
  },
  rascunho: {
    tom: 'neutro',
    rotulo: 'Rascunho',
    explicacao: 'Ainda não está no ar — a Bia não usa rascunhos.',
  },
  em_aprovacao: {
    tom: 'atencao',
    rotulo: 'Aguardando aprovação',
    explicacao: 'Alguém precisa revisar e publicar para a Bia passar a usar.',
  },
  desatualizado: {
    tom: 'atencao',
    rotulo: 'Desatualizado',
    explicacao: 'Marcado para revisão. A Bia ainda usa, mas o conteúdo pode estar velho.',
  },
  arquivado: {
    tom: 'neutro',
    rotulo: 'Arquivado',
    explicacao: 'Fora de uso. Fica no histórico, mas a Bia não consulta.',
  },
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

const ROTULO_FONTE: Record<string, string> = {
  manual: 'Escrito pela equipe',
  ambiente_de_teste: 'Ambiente de teste',
  sugestao: 'Veio de uma sugestão',
  importacao: 'Importado',
};

export default async function PaginaItemConhecimento({
  params,
}: {
  params: Promise<{ empresa: string; item: string }>;
}) {
  const { empresa: slug, item: itemId } = await params;
  const acesso = await exigirAcesso(slug);

  const item = await detalharItem(acesso.empresa.id, itemId);
  if (!item) notFound();

  const st = TOM_STATUS[item.status];

  return (
    <Pagina largura="padrao" className="max-w-[68rem]">
      <Link
        href={`/e/${slug}/conhecimento`}
        className="entra text-texto-3 hover:text-texto-2 mb-4 inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <ArrowLeft aria-hidden strokeWidth={1.5} className="size-3.5" />
        Conhecimento
      </Link>

      <header className="entra mb-6" style={{ '--atraso': '30ms' } as React.CSSProperties}>
        <div className="flex flex-wrap items-center gap-2">
          <Etiqueta tom={st.tom} ponto={item.status !== 'publicado'}>
            {st.rotulo}
          </Etiqueta>
          <span className="text-2xs text-texto-3">
            {ROTULO_TIPO[item.tipo] ?? item.tipo}
            {item.categoria && ` · ${item.categoria}`}
          </span>
        </div>
        <h1 className="text-texto mt-2 text-xl font-semibold tracking-[-0.015em]">{item.titulo}</h1>
        <p className="text-texto-3 mt-1 text-xs">{st.explicacao}</p>
      </header>

      {/*
        A resposta é o conteúdo do item e fica na coluna larga, com medida de
        leitura própria. Metadado e histórico — que são consulta, não leitura —
        vão para a coluna estreita, em vez de empurrarem a resposta para baixo.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_21rem]">
        <div className="grid gap-4">
          <Cartao
            titulo="Resposta"
            className="entra"
            style={{ '--atraso': '60ms' } as React.CSSProperties}
          >
            <p className="text-texto max-w-[70ch] text-sm leading-relaxed whitespace-pre-wrap">
              {item.corpo}
            </p>
          </Cartao>

          {item.aliases.length > 0 && (
            <Cartao
              titulo="Também responde a"
              descricao="Formas parecidas de perguntar que levam a esta resposta."
              className="entra"
              style={{ '--atraso': '80ms' } as React.CSSProperties}
            >
              <div className="flex flex-wrap gap-1.5">
                {item.aliases.map((a) => (
                  <span
                    key={a}
                    className="bg-superficie-2 text-texto-2 rounded-sm px-2 py-1 text-xs"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </Cartao>
          )}
        </div>

        <div className="grid gap-4">
          <Cartao
            titulo="Detalhes"
            className="entra"
            style={{ '--atraso': '100ms' } as React.CSSProperties}
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Fato rotulo="Versão" valor={String(item.versao)} />
              <Fato rotulo="Usada pela Bia" valor={item.usos > 0 ? `${item.usos}×` : 'ainda não'} />
              <Fato
                rotulo="Última vez"
                valor={item.ultimoUsoEm ? tempoRelativo(item.ultimoUsoEm) : '—'}
              />
              <Fato rotulo="Origem" valor={ROTULO_FONTE[item.fonte] ?? item.fonte} />
            </dl>
          </Cartao>

          {item.historico.length > 0 && (
            <Cartao
              titulo="Histórico de versões"
              className="entra"
              style={{ '--atraso': '120ms' } as React.CSSProperties}
              semPreenchimento
            >
              <ul className="divide-linha divide-y">
                {item.historico.map((h) => (
                  <li key={h.versao} className="flex items-start gap-3 px-4 py-3">
                    <History
                      aria-hidden
                      strokeWidth={1.5}
                      className="text-texto-3 mt-0.5 size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-texto text-sm">
                        Versão {h.versao}
                        {h.nota && <span className="text-texto-2"> — {h.nota}</span>}
                      </p>
                      <p className="text-2xs text-texto-3 mt-0.5">
                        {h.autor ?? 'Sistema'} · {tempoRelativo(h.criadaEm)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>
      </div>
    </Pagina>
  );
}

function Fato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-2xs text-texto-3">{rotulo}</dt>
      <dd data-numerico className="text-texto mt-0.5 text-sm font-medium tabular-nums">
        {valor}
      </dd>
    </div>
  );
}
