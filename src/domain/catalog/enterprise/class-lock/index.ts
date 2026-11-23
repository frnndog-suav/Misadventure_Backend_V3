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

export type TSpecializationLockInput = TClassLockInput &
  Readonly<{
    reinforcedAttributes: readonly TAttribute[]
    additionalAttributes: readonly TAttribute[]
    lockSpecializationAdditional: number
    lockSpecializationReinforcement: number
  }>

/**
 * Trava da especialização (README 8.2; REQ-134). Inclui a trava completa da
 * classe: cada essencial exige o mínimo da classe, somado ao reforço se o
 * atributo for reforçado; cada adicional exige o mínimo de adicionais.
 */
export function isSpecializationActive({
  build,
  essentialAttributes,
  reinforcedAttributes,
  additionalAttributes,
  lockOneEssential,
  lockTwoEssentials,
  lockSpecializationAdditional,
  lockSpecializationReinforcement,
}: TSpecializationLockInput): boolean {
  if (essentialAttributes.length === 0) return false

  const classMinimum =
    essentialAttributes.length === 1 ? lockOneEssential : lockTwoEssentials
  const count = (attribute: TAttribute) =>
    build.reduce(
      (sum, { card, copies }) =>
        card.attributes.includes(attribute) ? sum + copies : sum,
      0
    )

  return (
    essentialAttributes.every(
      (attribute) =>
        count(attribute) >=
        classMinimum +
          (reinforcedAttributes.includes(attribute)
            ? lockSpecializationReinforcement
            : 0)
    ) &&
    additionalAttributes.every(
      (attribute) => count(attribute) >= lockSpecializationAdditional
    )
  )
}
