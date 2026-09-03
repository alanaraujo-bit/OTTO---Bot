import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { Vazio } from '@otto/ui';

import { Assinatura } from '@/componentes/assinatura.tsx';
import { BotaoSair } from '@/componentes/botao-sair.tsx';
import { exigirSessao } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Sem empresa' };

/**
 * Conta autenticada, mas sem vínculo com nenhuma empresa.
 *
 * Acontece quando alguém é removido enquanto está logado, ou quando a conta foi
 * criada antes do convite. Precisa dizer o que fazer — e oferecer a saída, senão
 * a pessoa fica presa em uma tela sem ação.
 */
export default async function PaginaSemEmpresa() {
  const sessao = await exigirSessao();

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-linha px-6 py-3">
        <Assinatura tamanho="sm" />
        <BotaoSair />
      </header>

      <div className="flex flex-1 items-center justify-center px-6">
        <Vazio
          icone={<Building2 />}
          titulo="Sua conta ainda não está em nenhuma empresa"
          descricao={`Você entrou como ${sessao.usuario.email}. Peça a quem administra a empresa para enviar um convite para este endereço — assim que ele for aceito, o painel aparece aqui.`}
        />
      </div>
    </main>
  );
}
