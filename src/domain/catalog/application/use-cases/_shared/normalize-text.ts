/** Minúsculas e sem acentos, para a busca do editor (REQ-46): `Força` casa com `forca`. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
