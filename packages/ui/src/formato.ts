/**
 * Formatação de dado para leitura.
 *
 * Número de telefone é o caso mais comum: chega do canal como uma sequência de
 * dígitos (`5594911110001`) e precisa aparecer do jeito que a pessoa reconhece.
 */

/** `5594911110001` → `+55 94 91111-0001`. Deixa passar o que não reconhece. */
export function formatarTelefone(bruto: string | null | undefined): string {
  if (!bruto) return '';
  const d = bruto.replace(/\D/g, '');

  // Brasil, com código do país.
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith('55')) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  // Brasil, sem código do país.
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;

  return bruto;
}
