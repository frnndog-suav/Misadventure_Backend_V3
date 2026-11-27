import type {
  TCard,
  TClassDefinition,
  TDimensionCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TAiPlayerPriority } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { equippedAbility } from '../combat/abilities'
import type { Party } from '../entities/party'
import { maxHealthOf } from '../entities/party-member'
import { sellOffersOf } from '../market-trade'
import { capacitiesOf } from '../markets'
import type { TPartyAction } from '../party-action'
import { aiBuildOptions } from './build'
import { eventPaymentIntents } from './event-payments'
import { movesTowardLocations, movesTowardQuests } from './quest-movement'

type Candidate = {
  action: TPartyAction
  scores?: Partial<Record<TAiPlayerPriority, number>>
}

const MAX_TARGETS = 12

export function aiTurnIntents(
  party: Party,
  cards: ReadonlyMap<string, TCard>,
  dimension: TDimensionCard | null,
  classes: readonly TClassDefinition[],
  canStartEvent: boolean
): TPartyAction[] {
  const candidates = turnCandidates(
    party,
    cards,
    dimension,
    classes,
    canStartEvent
  )
  const { aiPlayerPriorities } = party.config
  return candidates
    .sort((first, second) => {
      for (const priority of aiPlayerPriorities) {
        const difference =
          (second.scores?.[priority] ?? 0) - (first.scores?.[priority] ?? 0)
        if (difference !== 0) return difference
      }
      return 0
    })
    .map(({ action }) => action)
}

function turnCandidates(
  party: Party,
  cards: ReadonlyMap<string, TCard>,
  dimension: TDimensionCard | null,
  classes: readonly TClassDefinition[],
  canStartEvent: boolean
): Candidate[] {
  const actor = party.members.find(({ id }) => id.equals(party.turn.memberId))
  if (!actor) return []
  const { player } = party.combatActor || actor
  const trigger = party.triggeredEffectChoice
  const effect = trigger?.effects[0]
  if (trigger && effect) {
    return [
      {
        action: {
          type: 'resolveTriggeredEffect',
          choiceId: trigger.choiceId,
          effectId: effect.effectId,
          decision: effect.mode === 'automatic' ? 'resolve' : 'decline',
        },
      },
    ]
  }

  const combat = party.describeCombat(cards)
  if (combat) {
    const options = party.combatActions(combat)
    const ids = { combatId: combat.id, turnId: combat.turn.id }
    const targetIds = combat.attackTargetIds.slice(0, MAX_TARGETS)
    const candidates: Candidate[] = targetIds.map((targetId) => {
      const target = combat.enemies.find(({ id }) => id === targetId)!
      return {
        action: { type: 'combatAttack', ...ids, targetId },
        scores: {
          avoidKnockout:
            target.effectiveModifiers.reflection >= player.health ? -1 : 0,
          dimensionCompletion: combat.finalBoss ? 1 : 0,
          quests: party.questAttempt ? 1 : 0,
          peak: 1 / Math.max(1, target.health),
        },
      }
    })
    const missingHealth = maxHealthOf(player) - player.health
    if (options.includes('useAbility')) {
      for (const option of combat.abilities.slice(0, MAX_TARGETS)) {
        const slot = 'mountAbility' in option ? 'mount' : option.equipmentSlot
        if (
          !slot ||
          option.paymentCosts.some(({ type }) => type !== 'automatic')
        )
          continue
        const source = equippedAbility(
          player,
          cards,
          slot,
          option.abilityId,
          true
        )
        const ability = source?.ability
        if (
          !ability ||
          ability.form !== 'targeted' ||
          ability.power !== null ||
          ability.cost.some(({ kind }) => kind !== 'spendVigor') ||
          ability.effects.some(
            (effect) =>
              effect.trigger !== null || effect.duration.kind !== 'immediate'
          )
        )
          continue

        const action = {
          type: 'useAbility' as const,
          ...ids,
          abilityId: option.abilityId,
          ...(slot === 'mount'
            ? { mountAbility: true as const }
            : { equipmentSlot: slot }),
        }
        const activations = ability.effects.flatMap(
          ({ activation }) => activation
        )
        if (
          ability.target === 'opponent' &&
          activations.every(({ kind }) => kind === 'effectDamage')
        ) {
          const damage = activations.reduce(
            (sum, activation) =>
              sum +
              (activation.kind === 'effectDamage' ? activation.amount : 0),
            0
          )
          addDamage(action, option.targetIds, damage)
        }
        if (
          ability.target !== 'self' ||
          missingHealth <= 0 ||
          activations.some(({ kind }) => kind !== 'heal')
        )
          continue

        const healing = activations.reduce(
          (sum, activation) =>
            sum + (activation.kind === 'heal' ? activation.amount : 0),
          0
        )
        if (healing <= 0) continue
        candidates.push({
          action,
          scores: {
            avoidKnockout:
              Math.min(healing, missingHealth) / maxHealthOf(player),
          },
        })
      }
    }
    if (options.includes('activateCombatEffect')) {
      for (const { effect, effectId, paymentCosts, targetIds } of party
        .combatEffectChoices(cards)
        .slice(0, MAX_TARGETS)) {
        if (
          paymentCosts.some(({ type }) => type !== 'automatic') ||
          effect.cost.some(
            ({ kind }) => kind !== 'consumeSelf' && kind !== 'spendVigor'
          )
        )
          continue
        if (
          missingHealth > 0 &&
          !targetIds.length &&
          effect.activation.every(({ kind }) => kind === 'heal')
        ) {
          const healing = effect.activation.reduce(
            (sum, activation) =>
              sum + (activation.kind === 'heal' ? activation.amount : 0),
            0
          )
          if (healing <= 0) continue
          candidates.push({
            action: { type: 'activateCombatEffect', ...ids, effectId },
            scores: {
              avoidKnockout:
                Math.min(healing, missingHealth) / maxHealthOf(player),
            },
          })
        }
        if (
          targetIds.length &&
          effect.activation.every(({ kind }) => kind === 'effectDamage')
        ) {
          const damage = effect.activation.reduce(
            (sum, activation) =>
              sum +
              (activation.kind === 'effectDamage' ? activation.amount : 0),
            0
          )
          addDamage(
            { type: 'activateCombatEffect', ...ids, effectId },
            targetIds,
            damage
          )
        }
      }
    }
    if (options.includes('escapeCombat'))
      candidates.push({ action: { type: 'escapeCombat', ...ids } })
    if (options.includes('endCombatTurn'))
      candidates.push({
        action: { type: 'endCombatTurn', ...ids },
        scores: { avoidKnockout: -1 },
      })
    return candidates

    function addDamage(
      action: Extract<
        TPartyAction,
        { type: 'activateCombatEffect' | 'useAbility' }
      >,
      targets: readonly string[],
      damage: number
    ) {
      if (!combat || damage <= 0) return
      for (const targetId of targets.slice(0, MAX_TARGETS)) {
        const target = combat.enemies.find(({ id }) => id === targetId)
        if (!target?.health) continue
        candidates.push({
          action: { ...action, targetId },
          scores: {
            avoidKnockout:
              damage >= target.health
                ? target.effectiveModifiers.reflection / maxHealthOf(player)
                : 0,
            dimensionCompletion: combat.finalBoss ? 1 : 0,
            quests: party.questAttempt ? 1 : 0,
            peak: Math.min(1, damage / target.health),
          },
        })
      }
    }
  }

  const reward = party.pendingRewards[0]
  if (reward) {
    const rewardId = reward.id
    return [
      {
        action: {
          type: 'resolveReward',
          rewardId,
          choice: 'keep',
          discard: [],
        },
      },
      { action: { type: 'resolveReward', rewardId, choice: 'leave' } },
    ]
  }

  const event = party.eventEncounter
  if (event) {
    const encounterId = event.id
    if (event.phase === 'anticipation')
      return [{ action: { type: 'revealEvent', encounterId } }]
    return [
      { action: { type: 'resolveEvent', encounterId } },
      ...eventPaymentIntents(
        event,
        player,
        cards,
        party.config.refineBonusPercent
      ).map((action) => ({ action })),
      { action: { type: 'giveUpEvent', encounterId } },
    ]
  }

  const candidates: Candidate[] = []
  const currentZone = cards.get(player.zoneId)
  if (
    party.canCompleteDimension(
      currentZone?.type === 'zone' ? currentZone : null,
      dimension
    )
  )
    candidates.push({
      action: { type: 'completeDimension' },
      scores: { dimensionCompletion: 1 },
    })
  const seenGeneric = new Set<'takeTrialQuest' | 'trainWithMentor'>()
  const { questChoices } = party.questState(actor, cards, classes)
  for (const { actionPoints: _cost, gold, ...action } of questChoices) {
    if (action.type === 'abandonQuest') continue
    if (action.type === 'takeTrialQuest' || action.type === 'trainWithMentor') {
      if (seenGeneric.has(action.type)) continue
      seenGeneric.add(action.type)
    }
    const progress =
      action.type === 'finishQuest'
        ? 3
        : action.type === 'continueQuest'
          ? 2
          : 1
    candidates.push({ action, scores: { quests: progress, gold: -gold } })
  }
  if (party.turn.actionPoints > 0) {
    const completion = dimension?.completion
    if (
      completion &&
      currentZone?.type === 'zone' &&
      currentZone.title !== completion.zoneTitle
    ) {
      const goal = party.dimension.map.zones
        .map(({ zoneId }) => cards.get(zoneId))
        .find(
          (card) => card?.type === 'zone' && card.title === completion.zoneTitle
        )
      if (
        goal?.type === 'zone' &&
        party.canCompleteDimension(goal, dimension)
      ) {
        for (const action of movesTowardLocations(
          party.dimension.map,
          player,
          cards,
          [{ type: 'zoneTitle', title: completion.zoneTitle }]
        )) {
          candidates.push({ action, scores: { dimensionCompletion: 0.5 } })
        }
      }
    }
    for (const action of movesTowardQuests(party.dimension.map, player, cards))
      candidates.push({ action, scores: { quests: 0.5 } })
    for (const action of aiBuildOptions(player, cards, classes, party.config))
      candidates.push({ action, scores: { peak: 1 } })
    const config = party.config
    if (player.brokenEquipment?.length) {
      const services = party.describeBlacksmith(actor, cards)?.blacksmith
      for (const { target, repair } of services?.equipment ?? []) {
        if (
          target.location !== 'equipment' ||
          !repair ||
          repair.gold > player.gold
        )
          continue
        candidates.push({
          action: {
            type: 'visitBlacksmith',
            operations: [{ operation: 'repair', target }],
          },
          scores: { avoidKnockout: 0.2, peak: 1, gold: -repair.gold },
        })
      }
    }
    const purseRoom =
      capacitiesOf(config, player.expansions).purse - player.gold
    if (
      purseRoom > 0 &&
      currentZone?.type === 'zone' &&
      currentZone.zoneActions.includes('visitMarket')
    ) {
      for (const { source, cardId, lotSize, price } of sellOffersOf(
        config,
        player,
        cards
      )) {
        const card = cards.get(cardId)
        if (
          card?.type !== 'item' ||
          card.itemCategory !== 'treasure' ||
          price <= 0
        )
          continue
        candidates.push({
          action: {
            type: 'visitMarket',
            operations: [
              { operation: 'sell', source, cardId, quantity: lotSize },
            ],
          },
          scores: { gold: Math.min(price, purseRoom) },
        })
      }
    }
    if (canStartEvent)
      candidates.push({
        action: { type: 'startEvent' },
        scores: {
          avoidKnockout: player.health < maxHealthOf(player) / 2 ? -1 : 0,
          peak: 0.5,
        },
      })
  }
  if (
    party.turn.actionPoints > 0 &&
    (player.health < maxHealthOf(player) || player.vigor < player.peak)
  )
    candidates.push({
      action: { type: 'recover', option: 'drawToHand' },
      scores: { avoidKnockout: 1 - player.health / maxHealthOf(player) },
    })
  candidates.push({ action: { type: 'endTurn' } })
  return candidates
}
