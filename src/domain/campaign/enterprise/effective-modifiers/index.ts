import {
  MODIFIERS,
  type TEquipmentCard,
  type TModifier,
} from '@/domain/catalog/enterprise/value-objects/card'

export type TEffectiveModifiersInput = Readonly<{
  /** Valor base (classe ou padrões; REQ-34, D-76). */
  modifiers: Readonly<Record<TModifier, number>>
  peak: number
  /** Cartas dos equipamentos em uso (o agregado não conhece o catálogo, D-76). */
  equipment: readonly TEquipmentCard[]
}>

/** Um equipamento em uso funciona se não tem requisito ou o Pico o cumpre (7.3 item 8). */
export function equipmentWorks(card: TEquipmentCard, peak: number): boolean {
  return card.peakRequirement === null || peak >= card.peakRequirement
}

/**
 * Pipeline de README 7.4 com o que existe hoje (REQ-71, D-76): etapa 1 (base +
 * equipamentos que funcionam), 2 (× (100 + Pico) ÷ 100) e 5 (piso 0),
 * arredondado para baixo só no fim.
 */
export function effectiveModifiers({
  modifiers,
  peak,
  equipment,
}: TEffectiveModifiersInput): Record<TModifier, number> {
  const working = equipment.filter((card) => equipmentWorks(card, peak))
  const result = {} as Record<TModifier, number>
  for (const modifier of MODIFIERS) {
    const bonus = working
      .flatMap((card) => card.modifiers)
      .filter((entry) => entry.modifier === modifier)
      .reduce((sum, entry) => sum + entry.value, 0)
    result[modifier] = Math.floor(
      (Math.max(0, modifiers[modifier] + bonus) * (100 + peak)) / 100
    )
  }
  return result
}
