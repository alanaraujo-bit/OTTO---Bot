import {
  BarChart3,
  FlaskConical,
  BookOpen,
  Headset,
  Home,
  Inbox,
  Lightbulb,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { Permissao } from '@otto/core/auth';

/**
 * Navegação do console.
 *
 * Uma fonte só para desktop e celular. As duas superfícies apresentam isto de
 * formas diferentes — barra lateral e barra inferior —, mas divergir na lista de
 * destinos é como um item nasce só em uma das duas.
 *
 * `permissao` esconde o que a pessoa não pode acessar. É conveniência: a
 * barreira de verdade está em `exigirPermissao`, no servidor.
 */

export interface ItemNavegacao {
  id: string;
  rotulo: string;
  /** Sufixo depois de `/e/<empresa>`. Vazio é a Home. */
  caminho: string;
  Icone: LucideIcon;
  permissao: Permissao;
  /** Aparece na barra inferior do celular. No máximo cinco cabem sem apertar. */
  noCelular?: boolean;
}

export const NAVEGACAO: ItemNavegacao[] = [
  { id: 'home', rotulo: 'Início', caminho: '', Icone: Home, permissao: 'empresa.ver', noCelular: true },
  {
    id: 'inbox',
    rotulo: 'Conversas',
    caminho: '/conversas',
    Icone: Inbox,
    permissao: 'conversa.ver',
    noCelular: true,
  },
  {
    id: 'contatos',
    rotulo: 'Clientes',
    caminho: '/clientes',
    Icone: Users,
    permissao: 'contato.ver',
  },
  {
    id: 'conhecimento',
    rotulo: 'Conhecimento',
    caminho: '/conhecimento',
    Icone: BookOpen,
    permissao: 'conhecimento.ver',
    noCelular: true,
  },
  {
    id: 'aprendizado',
    rotulo: 'Melhorias',
    caminho: '/melhorias',
    Icone: Lightbulb,
    permissao: 'sugestao.ver',
  },
  {
    id: 'agente',
    rotulo: 'Atendente virtual',
    caminho: '/atendente',
    Icone: Headset,
    permissao: 'agente.ver',
  },
  {
    id: 'analytics',
    rotulo: 'Análise',
    caminho: '/analise',
    Icone: BarChart3,
    permissao: 'analytics.ver',
    noCelular: true,
  },
  {
    id: 'simulador',
    rotulo: 'Simulador',
    caminho: '/simulador',
    Icone: FlaskConical,
    permissao: 'agente.ver',
  },
  {
    id: 'config',
    rotulo: 'Configurações',
    caminho: '/configuracoes',
    Icone: Settings,
    permissao: 'empresa.ver',
  },
];

/** Resolve o item ativo pelo caminho mais específico que casa. */
export function itemAtivo(pathname: string, empresaSlug: string): string {
  const base = `/e/${empresaSlug}`;
  const resto = pathname.startsWith(base) ? pathname.slice(base.length) : '';

  let melhor = 'home';
  let tamanho = -1;
  for (const item of NAVEGACAO) {
    if (item.caminho === '' ? resto === '' : resto.startsWith(item.caminho)) {
      if (item.caminho.length > tamanho) {
        melhor = item.id;
        tamanho = item.caminho.length;
      }
    }
  }
  return melhor;
}
