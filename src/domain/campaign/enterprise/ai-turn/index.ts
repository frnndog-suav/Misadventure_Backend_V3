import type {
  TCard,
  TClassDefinition,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TAiPlayerPriority } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import type { Party } from '../entities/party'
import { maxHealthOf } from '../entities/party-member'
import type { TPartyAction } from '../party-action'
import { aiBuildOptions } from './build'
import { eventPaymentIntents } from './event-payments'
import { movesTowardQuests } from './quest-movement'

type Candidate = {
  action: TPartyAction
  scores?: Partial<Record<TAiPlayerPriority, number>>
}

const MAX_TARGETS = 12

export function aiTurnIntents(
  party: Party,
  cards: ReadonlyMap<string, TCard>,
  canComplete: boolean,
  classes: readonly TClassDefinition[],
  canStartEvent: boolean
): TPartyAction[] {
  const candidates = turnCandidates(
    party,
    cards,
    canComplete,
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
  canComplete: boolean,
  classes: readonly TClassDefinition[],
  canStartEvent: boolean
): Candidate[] {
  const actor = party.members.find(({ id }) => id.equals(party.turn.memberId))
  if (!actor) return []
  const { player } = actor
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
    if (missingHealth > 0 && options.includes('activateCombatEffect')) {
      for (const { effect, effectId, paymentCosts, targetIds } of party
        .combatEffectChoices(cards)
        .slice(0, MAX_TARGETS)) {
        if (
          targetIds.length ||
          paymentCosts.some(({ type }) => type !== 'automatic') ||
          effect.cost.some(
            ({ kind }) => kind !== 'consumeSelf' && kind !== 'spendVigor'
          ) ||
          effect.activation.some(({ kind }) => kind !== 'heal')
        )
          continue
        const healing = effect.activation.reduce(
          (sum, activation) =>
            sum + (activation.kind === 'heal' ? activation.amount : 0),
          0
        )
        if (healing > 0)
          candidates.push({
            action: { type: 'activateCombatEffect', ...ids, effectId },
            scores: {
              avoidKnockout:
                Math.min(healing, missingHealth) / maxHealthOf(player),
            },
          })
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
  if (canComplete)
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
    for (const action of movesTowardQuests(party.dimension.map, player, cards))
      candidates.push({ action, scores: { quests: 0.5 } })
    for (const action of aiBuildOptions(player, cards, classes, party.config))
      candidates.push({ action, scores: { peak: 1 } })
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
