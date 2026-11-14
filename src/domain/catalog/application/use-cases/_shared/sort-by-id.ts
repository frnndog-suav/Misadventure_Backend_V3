/** Ordem por `id` do CONTRATO FEAT-04: comparação por código de caractere (determinística). */
export function sortById<T extends { readonly id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
