/**
 * Identidade do produto.
 *
 * O nome comercial ainda não foi definido. `Otto` é provisório e vive apenas
 * aqui: nenhum componente, nenhuma copy e nenhum título de página escreve o nome
 * direto. Trocar a marca é trocar este arquivo.
 *
 * Se você está lendo isto porque o nome definitivo chegou: mude `nome`,
 * `descricao` e, se houver, o desenho da marca em `Logotipo`. Mais nada.
 */

export const marca = {
  nome: 'Otto',
  /** Aparece na aba do navegador e no app instalado. */
  nomeCurto: 'Otto',
  descricao: 'Central de atendimento e relacionamento com clientes',
  /** Usado por `<meta name="theme-color">` e pela splash do PWA. */
  corTema: { claro: '#faf9f7', escuro: '#141412' },
} as const;

export type Marca = typeof marca;
