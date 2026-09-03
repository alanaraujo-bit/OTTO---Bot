import type { membershipRoleEnum, platformRoleEnum } from '@otto/db';

/**
 * Papéis e permissões.
 *
 * As permissões vivem em código, versionadas junto das telas que elas protegem —
 * não em uma tabela que alguém edita sem rastro. Um papel novo é uma mudança de
 * código revisada, não uma linha inserida à mão em produção.
 *
 * A verificação de verdade acontece **no servidor**, em `exigir`. Esconder um
 * botão é conveniência para quem usa; não é segurança.
 */

export type PapelEmpresa = (typeof membershipRoleEnum.enumValues)[number];
export type PapelPlataforma = (typeof platformRoleEnum.enumValues)[number];

export const PERMISSOES = [
  // Conversas e atendimento
  'conversa.ver',
  'conversa.responder',
  'conversa.assumir',
  'conversa.transferir',
  'conversa.encerrar',
  'conversa.pausar_ia',

  // Clientes
  'contato.ver',
  'contato.editar',

  // Conhecimento
  'conhecimento.ver',
  'conhecimento.editar',
  'conhecimento.publicar',
  'conhecimento.arquivar',

  // Aprendizado
  'sugestao.ver',
  'sugestao.revisar',

  // Agente
  'agente.ver',
  'agente.editar',
  'agente.publicar',

  // Canais e integrações
  'canal.ver',
  'canal.conectar',
  'canal.desconectar',

  // Empresa
  'empresa.ver',
  'empresa.editar',
  'usuario.ver',
  'usuario.convidar',
  'usuario.remover',
  'usuario.alterar_papel',

  // Análise
  'analytics.ver',
  'custo.ver',
  'auditoria.ver',
] as const;

export type Permissao = (typeof PERMISSOES)[number];

/**
 * O que cada papel pode fazer.
 *
 * Pensado de baixo para cima: o papel mais restrito é a base, e cada degrau
 * acrescenta. Assim a pergunta "o supervisor pode tudo que o atendente pode?"
 * tem resposta estrutural, e não depende de alguém lembrar de copiar a linha.
 */

const VISUALIZACAO: Permissao[] = [
  'conversa.ver',
  'contato.ver',
  'conhecimento.ver',
  'canal.ver',
  'empresa.ver',
  'usuario.ver',
];

const ATENDENTE: Permissao[] = [
  ...VISUALIZACAO,
  'conversa.responder',
  'conversa.assumir',
  'conversa.transferir',
  'conversa.encerrar',
  'conversa.pausar_ia',
  'contato.editar',
  'sugestao.ver',
];

/** Analisa e propõe melhorias, mas não responde cliente nem publica nada. */
const ANALISTA: Permissao[] = [
  ...VISUALIZACAO,
  'sugestao.ver',
  'conhecimento.editar',
  'agente.ver',
  'analytics.ver',
  'custo.ver',
];

const SUPERVISOR: Permissao[] = [
  ...ATENDENTE,
  'conhecimento.editar',
  'conhecimento.publicar',
  'sugestao.revisar',
  'agente.ver',
  'analytics.ver',
  'usuario.convidar',
];

const ADMINISTRADOR: Permissao[] = [
  ...SUPERVISOR,
  'conhecimento.arquivar',
  'agente.editar',
  'agente.publicar',
  'canal.conectar',
  'canal.desconectar',
  'empresa.editar',
  'usuario.remover',
  'usuario.alterar_papel',
  'custo.ver',
  'auditoria.ver',
];

/** Tudo. É o único papel que não pode ser removido da empresa. */
const PROPRIETARIO: Permissao[] = [...PERMISSOES];

const POR_PAPEL: Record<PapelEmpresa, ReadonlySet<Permissao>> = {
  visualizacao: new Set(VISUALIZACAO),
  atendente: new Set(ATENDENTE),
  analista: new Set(ANALISTA),
  supervisor: new Set(SUPERVISOR),
  administrador: new Set(ADMINISTRADOR),
  proprietario: new Set(PROPRIETARIO),
};

/** Ordem de senioridade. Ninguém concede um papel acima do próprio. */
const NIVEL: Record<PapelEmpresa, number> = {
  visualizacao: 0,
  atendente: 1,
  analista: 1,
  supervisor: 2,
  administrador: 3,
  proprietario: 4,
};

export function permissoesDoPapel(papel: PapelEmpresa): ReadonlySet<Permissao> {
  return POR_PAPEL[papel];
}

export function podeNoPapel(papel: PapelEmpresa, permissao: Permissao): boolean {
  return POR_PAPEL[papel].has(permissao);
}

/**
 * Se `autor` pode atribuir `alvo` a outra pessoa.
 *
 * Um administrador não cria um proprietário, e ninguém se promove: isso fecha a
 * escalada de privilégio pela porta da frente, que é a mais usada.
 */
export function podeConcederPapel(autor: PapelEmpresa, alvo: PapelEmpresa): boolean {
  return NIVEL[autor] > NIVEL[alvo] || (autor === 'proprietario' && alvo === 'proprietario');
}

/** Rótulos para a interface. O papel nunca aparece como identificador cru. */
export const ROTULO_PAPEL: Record<PapelEmpresa, { nome: string; descricao: string }> = {
  proprietario: {
    nome: 'Proprietário',
    descricao: 'Controle total, incluindo cobrança e remoção de administradores.',
  },
  administrador: {
    nome: 'Administrador',
    descricao: 'Configura a empresa, os canais, o agente e a equipe.',
  },
  supervisor: {
    nome: 'Supervisor',
    descricao: 'Atende, publica conhecimento e revisa sugestões de melhoria.',
  },
  atendente: {
    nome: 'Atendente',
    descricao: 'Responde conversas e assume atendimentos da IA.',
  },
  analista: {
    nome: 'Analista',
    descricao: 'Acompanha métricas e propõe conhecimento, sem responder clientes.',
  },
  visualizacao: {
    nome: 'Visualização',
    descricao: 'Apenas acompanha. Não responde nem altera nada.',
  },
};
