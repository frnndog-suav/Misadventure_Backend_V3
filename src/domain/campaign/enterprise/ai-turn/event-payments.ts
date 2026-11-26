import type {
  TCard,
  TRandomEventRequirement,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TPlayerState } from '../entities/party-member'
import type { TEventPayment, TRandomEventAction } from '../party-action'
import {
  failedMinimums,
  requirementProgress,
  resourceMatches,
  type TEventEncounter,
} from '../random-event'

export function eventPaymentIntents(
  event: TEventEncounter,
  player: TPlayerState,
  cards: ReadonlyMap<string, TCard>,
  refineBonusPercent: number
): Extract<TRandomEventAction, { type: 'payEventRequirement' }>[] {
  const { card, id: encounterId } = event
  if (
    !card ||
    event.phase !== 'encounter' ||
    event.outcome ||
    failedMinimums(card, player, cards, refineBonusPercent).length
  )
    return []

  const requirements = requirementProgress(event, player, cards).filter(
    ({ status }) => status === 'unpaid' || status === 'partial'
  )
  const intents: Extract<
    TRandomEventAction,
    { type: 'payEventRequirement' }
  >[] = []
  for (const progress of requirements) {
    const requirement = card.requirements.find(
      ({ id }) => id === progress.requirementId
    )
    if (!requirement || !progress.payable) return []
    if (
      requirement.kind === 'donateLife' &&
      (progress.amountDue ?? 0) >= player.health
    )
      return []

    let payment: TEventPayment | undefined
    if (requirement.kind === 'offerResources') {
      const resources = resourceOffer(
        requirement,
        progress.eligibleResourceCardIds,
        player,
        cards
      )
      if (!resources) return []
      payment = { resources }
    } else if (progress.handCardSelection === 'choose') {
      const count =
        requirement.kind === 'manipulateAttributeCards'
          ? Math.min(player.hand.length, requirement.count)
          : 1
      const handCards = progress.eligibleHandCopyIds.slice(0, count)
      if (handCards.length !== count) return []
      payment = { handCards }
    } else if (requirement.kind === 'abandonEquipment' && !requirement.random) {
      payment = {
        equipmentSlots: progress.eligibleEquipmentSlots.slice(
          0,
          requirement.count
        ),
      }
    }
    intents.push({
      type: 'payEventRequirement',
      encounterId,
      requirementId: requirement.id,
      ...(payment && { payment }),
    })
  }
  return intents.slice(0, 12)
}

function resourceOffer(
  requirement: Extract<TRandomEventRequirement, { kind: 'offerResources' }>,
  eligible: readonly string[],
  player: TPlayerState,
  cards: ReadonlyMap<string, TCard>
): TEventPayment['resources'] {
  const total = requirement.requirements.reduce(
    (sum, { count }) => sum + count,
    0
  )
  if (total > 12) return

  const available = new Map<string, number>()
  const eligibleIds = new Set(eligible)
  for (const { cardId, quantity } of player.inventory) {
    if (eligibleIds.has(cardId))
      available.set(cardId, (available.get(cardId) ?? 0) + quantity)
  }
  const filters = requirement.requirements
    .flatMap(({ resource, count }) => {
      const matches = eligible.filter((id) => {
        const card = cards.get(id)
        return card !== undefined && resourceMatches(card, resource)
      })
      return Array.from({ length: count }, () => matches)
    })
    .sort((first, second) => first.length - second.length)

  if (requirement.constraint === 'same') {
    const cardId = filters[0]?.find(
      (id) =>
        (available.get(id) ?? 0) >= total &&
        filters.every((matches) => matches.includes(id))
    )
    return cardId === undefined ? undefined : [{ cardId, copies: total }]
  }

  const selected = new Map<string, number>()
  let remainingAttempts = 256
  if (!assign(0)) return
  return [...selected].map(([cardId, copies]) => ({ cardId, copies }))

  function assign(index: number): boolean {
    if (index === filters.length) return true
    for (const id of filters[index]) {
      if (remainingAttempts-- <= 0) return false
      const used = selected.get(id) ?? 0
      const limit =
        requirement.constraint === 'distinct' ? 1 : (available.get(id) ?? 0)
      if (used >= limit) continue
      selected.set(id, used + 1)
      if (assign(index + 1)) return true
      if (used === 0) selected.delete(id)
      else selected.set(id, used)
    }
    return false
  }
}
