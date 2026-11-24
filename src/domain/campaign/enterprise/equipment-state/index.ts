import type {
  TBlacksmithEnchantment,
  TElement,
  TEquipmentCard,
  TEquipmentSlot,
} from '@/domain/catalog/enterprise/value-objects/card'

/**
 * Um encantamento aplicado (README 25.3; REQ-147): a definição é uma cópia da
 * carta de zona no momento do encantamento. `slotIndex` é o índice em
 * `card.enchantment.slots`; `null` é o encantamento extra do Ferreiro Arcano.
 */
export type TAppliedEnchantment = Readonly<{
  enchantment: TBlacksmithEnchantment
  zoneId: string
  slotIndex: number | null
}>

/** Estado de uma cópia de equipamento (README 5.1, 25; REQ-147, D-131). */
export type TEquipmentState = Readonly<{
  /** 0 a 10. */
  refinement: number
  /** Na ordem em que foram aplicados. */
  enchantments: readonly TAppliedEnchantment[]
  repairMarks: number
  broken: boolean
}>

/**
 * O que o jogador guarda do equipamento em uso. O `broken` mora em
 * `brokenEquipment` (D-137); o estado completo se monta com `wornStateOf`.
 */
export type TWornState = Omit<TEquipmentState, 'broken'>
export type TWornStates = Readonly<Partial<Record<TEquipmentSlot, TWornState>>>

export const DEFAULT_EQUIPMENT_STATE: TEquipmentState = {
  refinement: 0,
  enchantments: [],
  repairMarks: 0,
  broken: false,
}

export function isDefaultEquipmentState(
  state: TEquipmentState | TWornState | undefined
): boolean {
  return (
    state === undefined ||
    (state.refinement === 0 &&
      state.enchantments.length === 0 &&
      state.repairMarks === 0 &&
      !('broken' in state && state.broken))
  )
}

/** O estado como se guarda numa cópia: `undefined` quando é o padrão. */
export function compactEquipmentState(
  state: TEquipmentState | undefined
): TEquipmentState | undefined {
  return isDefaultEquipmentState(state) ? undefined : state
}

/** Estado completo do equipamento em uso no `slot`. */
export function wornStateOf(
  player: Readonly<{
    equipmentStates?: TWornStates
    brokenEquipment?: readonly TEquipmentSlot[]
  }>,
  slot: TEquipmentSlot
): TEquipmentState {
  const worn = player.equipmentStates?.[slot] ?? DEFAULT_EQUIPMENT_STATE
  return {
    refinement: worn.refinement,
    enchantments: worn.enchantments,
    repairMarks: worn.repairMarks,
    broken: player.brokenEquipment?.includes(slot) ?? false,
  }
}

type TWornHolder = Readonly<{
  equipmentStates?: TWornStates
  brokenEquipment?: readonly TEquipmentSlot[]
}>

/**
 * Grava o estado do equipamento que ocupa `slot` (ou o limpa, com `undefined`),
 * separando o `broken` em `brokenEquipment` (D-137). Os campos que ficam vazios
 * saem do jogador.
 */
export function withWornState<P extends TWornHolder>(
  player: P,
  slot: TEquipmentSlot,
  state: TEquipmentState | undefined
): P {
  const { equipmentStates, brokenEquipment, ...rest } = player
  const others = Object.fromEntries(
    Object.entries(equipmentStates ?? {}).filter(([key]) => key !== slot)
  ) as TWornStates
  const worn =
    state === undefined || isDefaultEquipmentState({ ...state, broken: false })
      ? others
      : {
          ...others,
          [slot]: {
            refinement: state.refinement,
            enchantments: state.enchantments,
            repairMarks: state.repairMarks,
          },
        }
  const kept = (brokenEquipment ?? []).filter((entry) => entry !== slot)
  const broken = state?.broken ? [...kept, slot] : kept
  return {
    ...rest,
    ...(Object.keys(worn).length > 0 && { equipmentStates: worn }),
    ...((brokenEquipment !== undefined || broken.length > 0) && {
      brokenEquipment: broken,
    }),
  } as P
}

/** Uma cópia de equipamento no inventário ou no cofre, com o estado só se não for o padrão. */
export function copySlot(
  cardId: string,
  state: TEquipmentState | undefined
): Readonly<{ cardId: string; quantity: 1; equipmentState?: TEquipmentState }> {
  const kept = compactEquipmentState(state)
  return { cardId, quantity: 1, ...(kept && { equipmentState: kept }) }
}

/** Ligado: refino ≥ requisito do slot (o extra sempre) e equipamento não quebrado (README 25.3, 5.1). */
export function enchantmentActive(
  applied: TAppliedEnchantment,
  card: TEquipmentCard,
  state: TEquipmentState | TWornState
): boolean {
  if ('broken' in state && state.broken) return false
  if (applied.slotIndex === null) return true
  const slot = card.enchantment?.slots[applied.slotIndex]
  return slot !== undefined && state.refinement >= slot.minRefinement
}

export function activeEnchantments(
  card: TEquipmentCard,
  state: TEquipmentState | TWornState | undefined
): readonly TBlacksmithEnchantment[] {
  if (state === undefined) return []
  return state.enchantments
    .filter((applied) => enchantmentActive(applied, card, state))
    .map(({ enchantment }) => enchantment)
}

/** Bônus de efetividade por elemento dos encantamentos de elemento ligados (README 16.1, 25.3). */
export function elementBonusesOf(
  cards: readonly TEquipmentCard[],
  states: TWornStates | undefined
): Partial<Record<TElement, number>> {
  const bonuses: Partial<Record<TElement, number>> = {}
  for (const card of cards) {
    for (const enchantment of activeEnchantments(card, states?.[card.slot])) {
      if (enchantment.kind === 'element') {
        bonuses[enchantment.element] =
          (bonuses[enchantment.element] ?? 0) + enchantment.bonusPercent
      }
    }
  }
  return bonuses
}

/**
 * A carta como o jogador a tem em uso (REQ-148): o modificador principal (o 1º)
 * ganha `refinement × refineBonusPercent`% do valor base, com decimais (só o fim
 * do pipeline de 7.4 arredonda), e os encantamentos de efeito ligados somam seus
 * efeitos e habilidades. Sem nada a aplicar, devolve a própria carta.
 */
export function applyEquipmentState(
  card: TEquipmentCard,
  state: TEquipmentState | TWornState | undefined,
  refineBonusPercent: number
): TEquipmentCard {
  if (state === undefined) return card
  const enchantments = activeEnchantments(card, state).flatMap((entry) =>
    entry.kind === 'effect' ? [entry] : []
  )
  const refined = state.refinement > 0 && card.modifiers.length > 0
  if (!refined && enchantments.length === 0) return card
  return {
    ...card,
    modifiers: refined
      ? card.modifiers.map((entry, i) =>
          i === 0
            ? {
                ...entry,
                value:
                  (entry.value *
                    (100 + state.refinement * refineBonusPercent)) /
                  100,
              }
            : entry
        )
      : card.modifiers,
    effects: [
      ...card.effects,
      ...enchantments.flatMap(({ effects }) => effects),
    ],
    abilities: [
      ...card.abilities,
      ...enchantments.flatMap(({ abilities }) => abilities),
    ],
  }
}
