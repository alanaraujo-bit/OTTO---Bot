'use client';

import { LogOut } from 'lucide-react';
import { Botao } from '@otto/ui';

import { acaoSair } from '@/servidor/acoes-sessao.ts';

export function BotaoSair({ rotulo = 'Sair' }: { rotulo?: string }) {
  return (
    <form action={acaoSair}>
      <Botao
        type="submit"
        variante="sutil"
        tamanho="sm"
        icone={<LogOut strokeWidth={1.5} />}
      >
        {rotulo}
      </Botao>
    </form>
  );
}
