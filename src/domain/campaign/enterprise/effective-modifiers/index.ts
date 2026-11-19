import {
  MODIFIERS,
  type TEquipmentCard,
  type TModifier,
} from '@/domain/catalog/enterprise/value-objects/card'

import type { TPlayerStatus } from '../player-status'

export type TEffectiveModifiersInput = Readonly<{
  /** Valor base (classe ou padrões; REQ-34, D-76). */
  modifiers: Readonly<Record<TModifier, number>>
  peak: number
  /** Cartas dos equipamentos em uso (o agregado não conhece o catálogo, D-76). */
  equipment: readonly TEquipmentCard[]
  statuses?: readonly TPlayerStatus[]
}>

/** Um equipamento em uso funciona se não tem requisito ou o Pico o cumpre (7.3 item 8). */
export function equipmentWorks(card: TEquipmentCard, peak: number): boolean {
  return card.peakRequirement === null || peak >= card.peakRequirement
}

/**
 * Pipeline de README 7.4 (REQ-71, REQ-102): soma fixa, Pico, fator percentual
 * acumulado e piso zero, com arredondamento para baixo só no fim.
 */
export function effectiveModifiers({
  modifiers,
  peak,
  equipment,
  statuses = [],
}: TEffectiveModifiersInput): Record<TModifier, number> {
  const working = equipment.filter((card) => equipmentWorks(card, peak))
  const equipmentBonuses = working.flatMap((card) => card.modifiers)
  const passives = working.flatMap((card) =>
    card.effects.filter(
      (effect) =>
        effect.trigger === null &&
        effect.cost.length === 0 &&
        effect.duration.kind === 'whileSourceActive' &&
        effect.activation.every(
          ({ kind }) => kind === 'modifierFlat' || kind === 'modifierPercent'
        )
    )
  )
  const disabledIds = new Set(
    equipment.filter((card) => !equipmentWorks(card, peak)).map(({ id }) => id)
  )
  const activeStatuses = statuses.filter(
    ({ sourceCardId }) => !disabledIds.has(sourceCardId)
  )
  const activations = [...passives, ...activeStatuses].flatMap(
    (effect) => effect.activation
  )
  const result = {} as Record<TModifier, number>
  for (const modifier of MODIFIERS) {
    let fixed = equipmentBonuses
      .filter((entry) => entry.modifier === modifier)
      .reduce((sum, entry) => sum + entry.value, 0)
    let percent = 0
    for (const activation of activations) {
      if (activation.kind === 'modifierFlat') {
        for (const change of activation.changes) {
          if (change.modifier === modifier) fixed += change.amount
        }
      }
      if (activation.kind === 'modifierPercent') {
        for (const change of activation.changes) {
          if (change.modifier === modifier) percent += change.percent
        }
      }
    }
    // Divisão única evita perder um inteiro por arredondamento intermediário.
    const numerator =
      (modifiers[modifier] + fixed) * (100 + peak) * Math.max(0, 100 + percent)
    result[modifier] = Math.floor(Math.max(0, numerator) / 10_000)
  }
  return result
}
