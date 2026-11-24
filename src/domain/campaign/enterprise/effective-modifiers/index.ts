import {
  MODIFIERS,
  type TEquipmentCard,
  type TEquipmentSlot,
  type TExecutableAbility,
  type TModifier,
} from '@/domain/catalog/enterprise/value-objects/card'

import { applyEquipmentState, type TWornStates } from '../equipment-state'
import type { TPlayerState } from '../entities/party-member'
import type { TPlayerStatus } from '../player-status'

export type TEffectiveModifiersInput = Readonly<{
  /** Valor base (classe ou padrões; REQ-34, D-76). */
  modifiers: Readonly<Record<TModifier, number>>
  peak: number
  /** Cartas dos equipamentos em uso (o agregado não conhece o catálogo, D-76). */
  equipment: readonly TEquipmentCard[]
  statuses?: readonly TPlayerStatus[]
  /** Estado dos equipamentos em uso (REQ-148); o que falta é o estado padrão. */
  equipmentStates?: TWornStates
  /** `refineBonusPercent` do laboratório (README 25.2). */
  refineBonusPercent?: number
  abilityOwner?: Pick<TPlayerState, 'playerClasses' | 'brokenEquipment'>
  combat?: Readonly<{
    power?: number
    exhaustionPenaltyPercent: number
    projectileAccuracyBonusPercent?: number
  }>
}>

/** Um equipamento em uso funciona se não tem requisito ou o Pico o cumpre (7.3 item 8). */
export function equipmentWorks(card: TEquipmentCard, peak: number): boolean {
  return card.peakRequirement === null || peak >= card.peakRequirement
}

export function abilitySourceWorks(
  card: TEquipmentCard,
  slot: TEquipmentSlot,
  player: Pick<TPlayerState, 'peak' | 'brokenEquipment' | 'statuses'>
): boolean {
  return (
    equipmentWorks(card, player.peak) &&
    !player.brokenEquipment?.includes(slot) &&
    !player.statuses.some(({ activation }) =>
      activation.some(
        (effect) =>
          effect.kind === 'nullifyAbilities' &&
          (!effect.slots.length || effect.slots.includes(slot)) &&
          (!effect.tags.length ||
            effect.tags.some((tag) => card.tags.includes(tag)))
      )
    )
  )
}

export function abilityMatchesOwner(
  ability: TExecutableAbility,
  playerClasses: TPlayerState['playerClasses'],
  inCombat: boolean
) {
  return (
    (ability.timing === 'both' ||
      ability.timing === (inCombat ? 'combat' : 'outsideCombat')) &&
    (ability.classRestriction.length === 0 ||
      playerClasses.some(
        ({ playerClass, deckLockMet }) =>
          deckLockMet && ability.classRestriction.includes(playerClass)
      ))
  )
}

/**
 * Pipeline de README 7.4 (REQ-71, REQ-102): soma fixa, Pico, fator percentual
 * acumulado e piso zero, com arredondamento para baixo só no fim.
 */
export function effectiveModifiers({
  modifiers,
  peak,
  equipment,
  equipmentStates,
  refineBonusPercent = 0,
  statuses = [],
  abilityOwner,
  combat,
}: TEffectiveModifiersInput): Record<TModifier, number> {
  const standing = equipment.filter(
    (card) =>
      equipmentWorks(card, peak) &&
      !abilityOwner?.brokenEquipment?.includes(card.slot)
  )
  const working = standing.map((card) =>
    applyEquipmentState(card, equipmentStates?.[card.slot], refineBonusPercent)
  )
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
    equipment.filter((card) => !standing.includes(card)).map(({ id }) => id)
  )
  const activeStatuses = statuses.filter(
    ({ sourceCardId }) => !disabledIds.has(sourceCardId)
  )
  const passiveAbilities = abilityOwner
    ? working
        .filter((card) =>
          abilitySourceWorks(card, card.slot, {
            peak,
            statuses,
            ...abilityOwner,
          })
        )
        .flatMap((card) =>
          card.abilities.flatMap((ability) =>
            ability.id !== undefined &&
            ability.form === 'passive' &&
            abilityMatchesOwner(
              ability,
              abilityOwner.playerClasses,
              Boolean(combat)
            )
              ? ability.effects.filter(
                  (effect) => effect.trigger === null && !effect.cost.length
                )
              : []
          )
        )
    : []
  const activations = [
    ...passives,
    ...passiveAbilities,
    ...activeStatuses,
  ].flatMap((effect) => effect.activation)
  const result = {} as Record<TModifier, number>
  for (const modifier of MODIFIERS) {
    let fixed = equipmentBonuses
      .filter((entry) => entry.modifier === modifier)
      .reduce((sum, entry) => sum + Math.round(entry.value * 100), 0)
    if (modifier === 'attack') fixed += (combat?.power ?? 0) * 100
    let percent = -(combat?.exhaustionPenaltyPercent ?? 0)
    if (modifier === 'accuracy')
      percent += combat?.projectileAccuracyBonusPercent ?? 0
    for (const activation of activations) {
      if (activation.kind === 'modifierFlat') {
        for (const change of activation.changes) {
          if (change.modifier === modifier) fixed += change.amount * 100
        }
      }
      if (activation.kind === 'modifierPercent') {
        for (const change of activation.changes) {
          if (change.modifier === modifier) percent += change.percent
        }
      }
    }
    // Divisão única evita perder um inteiro por arredondamento intermediário;
    // o fixo vai em centésimos para o refino (decimais) não depender de ponto flutuante.
    const numerator =
      (modifiers[modifier] * 100 + fixed) *
      (100 + peak) *
      Math.max(0, 100 + percent)
    result[modifier] = Math.floor(Math.max(0, numerator) / 1_000_000)
  }
  return result
}
