import type {
  TAbility,
  TCard,
  TEquipmentSlot,
  TExecutableAbility,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TEffect,
  TTrigger,
} from '@/domain/catalog/enterprise/value-objects/effect'
import {
  isExecutableActivation,
  isStatusDuration,
} from '../activatable-effects'
import { applyActivations } from '../effect-activation'
import { quantityOf } from '../effect-payment'

import {
  abilityMatchesOwner,
  abilitySourceWorks,
  mountAbilitiesWork,
} from '../effective-modifiers'
import type { TPlayerState } from '../entities/party-member'
import { mountCardOf, type TMountLimboSink } from '../mount'
import type { TAbilitySource } from '../party-action'

import {
  applyEquipmentState,
  withWornState,
  wornStateOf,
} from '../equipment-state'
import { reconcileHand } from '../random-event'

/** Onde está a habilidade: um slot de equipamento ou a montaria (REQ-157). */
export type TAbilitySlot = TEquipmentSlot | 'mount'

export function abilitySlotOf(source: TAbilitySource): TAbilitySlot {
  return source.mountAbility === true ? 'mount' : source.equipmentSlot
}

/** A carta de origem da habilidade, no que importa para usá-la. */
type TAbilityOwnerCard = Readonly<{
  id: string
  tags: readonly string[]
  abilities: readonly TAbility[]
}>

function abilityOwnerCard(
  player: TPlayerState,
  cards: ReadonlyMap<string, TCard>,
  slot: TAbilitySlot
): TAbilityOwnerCard | null {
  if (slot === 'mount') {
    // A montaria vale como equipamento em uso, sem requisito de Pico (REQ-157).
    const mount = mountCardOf(player, cards)
    return mount && mountAbilitiesWork(player.statuses)
      ? { id: mount.id, tags: [], abilities: mount.abilities }
      : null
  }
  const cardId = player.equipment[slot]
  const card = cardId ? cards.get(cardId) : undefined
  if (card?.type !== 'equipment' || !abilitySourceWorks(card, slot, player))
    return null
  // As habilidades dos encantamentos ligados contam como as da carta (REQ-148).
  return applyEquipmentState(card, player.equipmentStates?.[slot], 0)
}

export function equippedAbility(
  player: TPlayerState,
  cards: ReadonlyMap<string, TCard>,
  slot: TAbilitySlot,
  abilityId: string,
  inCombat: boolean
): { card: TAbilityOwnerCard; ability: TExecutableAbility } | null {
  const resolved = abilityOwnerCard(player, cards, slot)
  if (!resolved) return null
  const ability = resolved.abilities.find(
    (entry): entry is TExecutableAbility => entry.id === abilityId
  )
  if (!ability || !abilityMatchesOwner(ability, player.playerClasses, inCombat))
    return null
  if (
    !inCombat &&
    (ability.target !== 'self' ||
      ability.power !== null ||
      ability.form === 'channeled')
  )
    return null
  return { card: resolved, ability }
}

export function applyAbilityEffect(
  player: TPlayerState,
  effect: Pick<TEffect, 'activation' | 'duration' | 'mark' | 'text'>,
  sourceCardId: string,
  statusId: string,
  purseCapacity: number,
  effectIndex: number,
  limbo?: TMountLimboSink
): TPlayerState {
  const { activation } = effect
  const applied = applyActivations(
    player,
    activation.filter(isExecutableActivation),
    purseCapacity
  )
  if (applied.limbo.length) limbo?.push(...applied.limbo)
  let changed = reconcileHand(player, applied.player)
  if (
    activation.some(
      (entry) => entry.kind === 'repairEquipment' && entry.target === 'self'
    )
  ) {
    // Cada conserto soma 1 marca de reparo (README 5.1; D-134).
    for (const slot of changed.brokenEquipment ?? []) {
      const state = wornStateOf(changed, slot)
      changed = withWornState(changed, slot, {
        ...state,
        broken: false,
        repairMarks: state.repairMarks + 1,
      })
    }
  }
  const status = abilityEffectStatus(
    effect,
    sourceCardId,
    statusId,
    effectIndex
  )
  return status
    ? { ...changed, statuses: [...changed.statuses, status] }
    : changed
}

export function abilityEffectStatus(
  effect: Pick<TEffect, 'activation' | 'duration' | 'mark' | 'text'>,
  sourceCardId: string,
  statusId: string,
  effectIndex: number
) {
  const { activation, duration, mark, text } = effect
  const combatDuration =
    duration.kind === 'untilOwnCombatTurnEnd' ||
    duration.kind === 'forOwnCombatTurns' ||
    duration.kind === 'forCombatCycles' ||
    duration.kind === 'untilDamageTaken' ||
    duration.kind === 'untilAttackMade' ||
    duration.kind === 'untilAttackMissed' ||
    duration.kind === 'untilAbilityUsed' ||
    duration.kind === 'forAbilitiesUsed' ||
    duration.kind === 'whileAbilityActive' ||
    duration.kind === 'untilNextCombatEnd' ||
    duration.kind === 'forCombats' ||
    duration.kind === 'untilCombatWon'
  if (mark === null || !(combatDuration || isStatusDuration(duration)))
    return null
  return {
    statusId,
    sourceCardId,
    effectIndex,
    text,
    mark,
    activation,
    duration,
    remaining:
      duration.kind === 'forOwnTurns' || duration.kind === 'forOwnCombatTurns'
        ? duration.turns
        : duration.kind === 'forRounds'
          ? duration.rounds
          : duration.kind === 'forCombatCycles'
            ? duration.cycles
            : duration.kind === 'forCombats' ||
                duration.kind === 'forAbilitiesUsed'
              ? duration.count
              : null,
  }
}

export function abilityEffectDuration(
  ability: Pick<TExecutableAbility, 'form' | 'duration'>,
  effect: TEffect
) {
  return ability.form === 'continuous' && ability.duration !== null
    ? { ...effect, duration: ability.duration }
    : effect
}

export function adventureAbilityKey(
  slot: TAbilitySlot,
  cardId: string,
  abilityId: string
) {
  return JSON.stringify([slot, cardId, abilityId])
}

export function abilityWithModifiers(
  ability: TExecutableAbility,
  player: TPlayerState,
  cards: ReadonlyMap<string, TCard>,
  enemyCount = 0
): TExecutableAbility {
  const active = player.statuses.flatMap(({ activation }) => activation)
  const changed = active.findLast(
    (entry) => entry.kind === 'changeNextAbilityElement'
  )
  const granted = active.findLast(
    (entry) => entry.kind === 'grantElementToAbility'
  )
  const element =
    changed?.element ?? ability.element ?? granted?.element ?? null
  const percent = active.reduce(
    (total, entry) =>
      entry.kind === 'elementVigorCostModifier' && entry.element === element
        ? total + entry.percent
        : total,
    0
  )
  const cost =
    percent === 0
      ? ability.cost
      : ability.cost.map((entry) => {
          if (entry.kind !== 'spendVigor') return entry
          const amount = quantityOf(
            entry.amount,
            player,
            cards,
            enemyCount,
            true
          )
          return amount === null
            ? entry
            : {
                ...entry,
                amount: Math.floor((amount * Math.max(0, 100 + percent)) / 100),
              }
        })
  return { ...ability, cost, element }
}

export function matchesAbilityUse(
  trigger: TTrigger | null,
  card: { id: string; tags: readonly string[] },
  slot: TAbilitySlot,
  ability: TExecutableAbility
) {
  const equipmentSlot = slot === 'mount' ? null : slot
  if (trigger?.kind === 'onElementAbilityUsed')
    return trigger.element === ability.element
  return (
    trigger?.kind === 'onAbilityUsed' &&
    (trigger.cardId === null || trigger.cardId === card.id) &&
    (trigger.slots.length === 0 ||
      (equipmentSlot !== null && trigger.slots.includes(equipmentSlot))) &&
    (equipmentSlot === null || !trigger.excludeSlots.includes(equipmentSlot)) &&
    (trigger.tags.length === 0 ||
      trigger.tags.some((tag) => card.tags.includes(tag)))
  )
}
