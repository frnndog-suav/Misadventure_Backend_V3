import type {
  TAttribute,
  TAttributeCard,
} from '@/domain/catalog/enterprise/value-objects/card'

export type TBuildEntry = Readonly<{ card: TAttributeCard; copies: number }>

export type TClassLockInput = Readonly<{
  build: readonly TBuildEntry[]
  essentialAttributes: readonly TAttribute[]
  lockOneEssential: number
  lockTwoEssentials: number
}>

/**
 * Trava da classe (README 4.3, 8.2; REQ-30). Cada carta conta para cada
 * atributo que tem (`synergy` para todos; `basic` e `enhanced` para o seu).
 * O tamanho da build não entra.
 */
export function isClassActive({
  build,
  essentialAttributes,
  lockOneEssential,
  lockTwoEssentials,
}: TClassLockInput): boolean {
  if (essentialAttributes.length === 0) return false

  const required =
    essentialAttributes.length === 1 ? lockOneEssential : lockTwoEssentials

  return essentialAttributes.every((attribute) => {
    const count = build.reduce(
      (sum, { card, copies }) =>
        card.attributes.includes(attribute) ? sum + copies : sum,
      0
    )
    return count >= required
  })
}
