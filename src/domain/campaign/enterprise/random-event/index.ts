import { left, right, type Either } from '@/core/error/either'
import { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TAttribute,
  TCard,
  TEquipmentSlot,
  TRandomEventCard,
  TRandomEventRequirement,
  TRandomEventOutcomeStep,
  TZoneType,
} from '@/domain/catalog/enterprise/value-objects/card'
import { quantityOf } from '../effect-payment'
import { effectiveModifiers } from '../effective-modifiers'
import type { TPlayerState } from '../entities/party-member'
import type { TEventPayment } from '../party-action'
import { shuffle } from '../shuffle'

export type TExecutableEvent = Omit<
  TRandomEventCard,
  'requirements' | 'goodOutcome' | 'badOutcome'
> & {
  requirements: readonly TRandomEventRequirement[]
  goodOutcome: { text: string; steps: readonly TRandomEventOutcomeStep[] }
  badOutcome: { text: string; steps: readonly TRandomEventOutcomeStep[] }
}

export function isExecutableEvent(
  card: TCard | undefined
): card is TExecutableEvent {
  return (
    card?.type === 'randomEvent' &&
    'steps' in card.goodOutcome &&
    'steps' in card.badOutcome &&
    card.requirements.length > 0 &&
    card.requirements.every((requirement) => 'kind' in requirement)
  )
}

export type THandCopy = { copyId: string; cardId: string }
export type TEventReceipt = {
  requirementId: string
  handCards?: THandCopy[]
  movedAttributeCards?: THandCopy[]
  equipment?: { slot: TEquipmentSlot; cardId: string }[]
  resources?: { cardId: string; copies: number }[]
  gold?: number
  vigor?: number
  health?: number
}
export type TEventDeck = {
  zoneType: TZoneType
  cards: string[]
  discard: string[]
}
export type TEventEncounter = {
  id: string
  memberId: string
  zoneType: TZoneType
  phase: 'anticipation' | 'encounter' | 'success' | 'setback'
  card: TExecutableEvent | null
  payments: TEventReceipt[]
  decisionDeadlineAt: null
  outcome?: {
    nextStep: number
    nextCopy?: number
    startingPeak: number
    cause: TEventResult['cause']
    escape: TEscapeReceipt | null
  }
}
export type TEscapeReceipt = {
  vigorSpent: number
  naturalRoll: number | null
  total: number | null
  threshold: number
  succeeded: boolean
  actionPointsLost: number
  nextTurnActionPointDebtAdded: number
}
export type TEventResult = {
  encounterId: string
  cardId: string
  resolution: 'success' | 'setback' | 'escaped'
  cause: 'requirementsMet' | 'gaveUp' | 'escapeSucceeded' | 'escapeFailed'
  payments: TEventReceipt[]
  peakDelta: number
  replacement: { requested: number; drawn: number }
  escape: TEscapeReceipt | null
}
export type TMinimumCheck = {
  requirementId: string
  stat: string
  minimum: number
  actual: number
}
export type TEventRefusal =
  | 'eventDeckEmpty'
  | 'staleEncounter'
  | 'wrongEventPhase'
  | 'eventPaymentStarted'
  | 'escapeForbidden'
  | 'requirementPaid'
  | 'requirementNotPayable'
  | 'requirementsNotPaid'
  | 'choicePending'
  | 'noActionPoints'
  | 'zoneActionUnavailable'
  | 'paymentInvalid'
  | 'notEnoughVigor'
  | 'notEnoughGold'
  | 'notEnoughLife'
  | { reason: 'eventMinimumNotMet'; checks: TMinimumCheck[] }

export function handCopiesOf(player: TPlayerState): readonly THandCopy[] {
  return (
    player.handCopies ??
    player.hand.map((cardId, index) => ({
      cardId,
      copyId: `hand-${index + 1}`,
    }))
  )
}

export function reconcileHand(
  previous: TPlayerState,
  changed: TPlayerState
): TPlayerState {
  if (
    changed.hand === previous.hand ||
    changed.handCopies !== previous.handCopies
  )
    return changed
  const available = [...handCopiesOf(previous)]
  let sequence = previous.handCopySequence ?? previous.hand.length
  const handCopies = changed.hand.map((cardId) => {
    const index = available.findIndex((copy) => copy.cardId === cardId)
    if (index >= 0) return available.splice(index, 1)[0]
    return { cardId, copyId: `hand-${++sequence}` }
  })
  return { ...changed, handCopies, handCopySequence: sequence }
}

type TCards = ReadonlyMap<string, TCard>
type TAttributes = {
  specific: Partial<Record<TAttribute, number>>
  any: number
}
type TRequirementProgress = {
  requirementId: string
  status: 'unpaid' | 'partial' | 'paid' | 'check'
  remaining?: TAttributes | { copies: number }
  payable: boolean
  handCardSelection: 'choose' | 'random' | null
  eligibleHandCopyIds: string[]
  eligibleEquipmentSlots: TEquipmentSlot[]
  eligibleResourceCardIds: string[]
  amountDue: number | null
}

function symbols(cardId: string, cards: TCards): readonly TAttribute[] {
  const card = cards.get(cardId)
  return card?.type === 'attribute' ? card.attributes : []
}

function attributeBalance(
  balance: TAttributes,
  attributes: readonly TAttribute[]
): TAttributes {
  const next = { specific: { ...balance.specific }, any: balance.any }
  for (const attribute of attributes) {
    const count = next.specific[attribute] ?? 0
    if (count > 1) next.specific[attribute] = count - 1
    else if (count === 1) delete next.specific[attribute]
    else next.any = Math.max(0, next.any - 1)
  }
  return next
}

type TDiscard = Extract<TRandomEventRequirement, { kind: 'discardFromHand' }>

function matchesDiscard(
  requirement: TDiscard,
  copies: readonly THandCopy[],
  cards: TCards
): boolean {
  const slots = requirement.requirements.flatMap(({ attribute, count }) =>
    Array.from({ length: count }, () => attribute)
  )
  const matches = (
    index: number,
    remaining: readonly (TAttribute | 'any')[],
    used: readonly TAttribute[]
  ): boolean => {
    const copy = copies[index]
    if (!copy) return true
    const attributes = symbols(copy.cardId, cards)
    if (
      attributes.some((attribute) =>
        requirement.excludeAttributes.includes(attribute)
      )
    )
      return false
    return attributes.some((attribute) => {
      if (
        requirement.constraint === 'same' &&
        used.length &&
        used[0] !== attribute
      )
        return false
      if (requirement.constraint === 'distinct' && used.includes(attribute))
        return false
      return remaining.some(
        (slot, position) =>
          (slot === 'any' || slot === attribute) &&
          matches(
            index + 1,
            remaining.filter((_, i) => i !== position),
            [...used, attribute]
          )
      )
    })
  }
  return matches(0, slots, [])
}

function resourceMatches(card: TCard, filter: string): boolean {
  if (card.type !== 'item' && card.type !== 'equipment') return false
  if (filter === 'any' || filter === card.type) return true
  if (filter.startsWith('tag:')) return card.tags.includes(filter.slice(4))
  return card.type === 'item'
    ? card.itemCategory === filter
    : card.slot === filter
}

export function requirementProgress(
  encounter: TEventEncounter,
  player: TPlayerState,
  cards: TCards
): TRequirementProgress[] {
  return (encounter.card?.requirements ?? []).map((requirement) => {
    const receipts = encounter.payments.filter(
      ({ requirementId }) => requirementId === requirement.id
    )
    const spent = receipts.flatMap((receipt) => receipt.handCards ?? [])
    const hand = handCopiesOf(player)
    const result: TRequirementProgress = {
      requirementId: requirement.id,
      status: receipts.length ? 'paid' : 'unpaid',
      payable: false,
      handCardSelection: null,
      eligibleHandCopyIds: [],
      eligibleEquipmentSlots: [],
      eligibleResourceCardIds: [],
      amountDue: null,
    }
    switch (requirement.kind) {
      case 'minimum':
        result.status = 'check'
        break
      case 'attributes': {
        const initial = { specific: requirement.specific, any: requirement.any }
        const remaining = spent.reduce(
          (balance, copy) =>
            attributeBalance(balance, symbols(copy.cardId, cards)),
          initial
        )
        const due = (balance: TAttributes) =>
          balance.any +
          Object.values(balance.specific).reduce((sum, count) => sum + count, 0)
        result.remaining = remaining
        result.status =
          due(remaining) === 0 ? 'paid' : spent.length ? 'partial' : 'unpaid'
        result.eligibleHandCopyIds = hand
          .filter(
            (copy) =>
              due(attributeBalance(remaining, symbols(copy.cardId, cards))) <
              due(remaining)
          )
          .map(({ copyId }) => copyId)
        result.handCardSelection = 'choose'
        result.payable = result.eligibleHandCopyIds.length > 0
        break
      }
      case 'discardFromHand': {
        const remaining =
          requirement.requirements.reduce((sum, part) => sum + part.count, 0) -
          spent.length
        const eligible = hand.filter((copy) =>
          matchesDiscard(requirement, [...spent, copy], cards)
        )
        result.remaining = { copies: remaining }
        result.status =
          remaining === 0 ? 'paid' : spent.length ? 'partial' : 'unpaid'
        result.handCardSelection = requirement.random ? 'random' : 'choose'
        result.eligibleHandCopyIds = requirement.random
          ? []
          : eligible.map(({ copyId }) => copyId)
        result.payable = remaining > 0 && eligible.length > 0
        break
      }
      case 'payGold':
      case 'spendVigor':
      case 'donateLife': {
        result.amountDue = quantityOf(requirement.amount, player, cards)
        const field =
          requirement.kind === 'payGold'
            ? 'gold'
            : requirement.kind === 'spendVigor'
              ? 'vigor'
              : 'health'
        result.payable =
          result.amountDue !== null &&
          player[field] >= result.amountDue &&
          (field !== 'vigor' || player.vigor > 0)
        break
      }
      case 'discardHandDownTo':
        result.payable = hand.length - requirement.leave >= requirement.minimum
        break
      case 'discardWholeHand':
        result.payable = hand.length >= requirement.minimum
        break
      case 'abandonEquipment':
        result.eligibleEquipmentSlots = (
          Object.keys(player.equipment) as TEquipmentSlot[]
        ).filter(
          (slot) =>
            player.equipment[slot] !== null &&
            !requirement.excludeSlots.includes(slot) &&
            (!requirement.slots.length || requirement.slots.includes(slot))
        )
        result.payable =
          result.eligibleEquipmentSlots.length >= requirement.count
        break
      case 'offerResources':
        result.eligibleResourceCardIds = [
          ...new Set(
            player.inventory.flatMap(({ cardId }) => {
              const card = cards.get(cardId)
              return card &&
                !requirement.exclude.some((filter) =>
                  resourceMatches(card, filter)
                ) &&
                requirement.requirements.some(({ resource }) =>
                  resourceMatches(card, resource)
                )
                ? [cardId]
                : []
            })
          ),
        ]
        result.payable = result.eligibleResourceCardIds.length > 0
        break
      case 'manipulateAttributeCards': {
        const selection =
          requirement.mode === 'handToTop' ||
          requirement.mode === 'handToBottom'
        const source =
          requirement.mode === 'reshuffleDiscard'
            ? player.discard
            : selection || requirement.mode === 'reshuffleHand'
              ? player.hand
              : player.deck
        result.handCardSelection = selection ? 'choose' : null
        result.eligibleHandCopyIds = selection
          ? hand.map(({ copyId }) => copyId)
          : []
        result.payable =
          source.length >= (requirement.minimum ?? requirement.count)
        break
      }
    }
    return result.status === 'paid' ? { ...result, payable: false } : result
  })
}

export function failedMinimums(
  card: TExecutableEvent,
  player: TPlayerState,
  cards: TCards
): TMinimumCheck[] {
  const equipment = Object.values(player.equipment).flatMap((id) => {
    const card = id ? cards.get(id) : undefined
    return card?.type === 'equipment' ? [card] : []
  })
  const modifiers = effectiveModifiers({ ...player, equipment })
  return card.requirements.flatMap((requirement) => {
    if (requirement.kind !== 'minimum') return []
    const { id, stat, value } = requirement
    const actual =
      stat === 'peak' || stat === 'vigor' ? player[stat] : modifiers[stat]
    return actual < value
      ? [{ requirementId: id, stat, minimum: value, actual }]
      : []
  })
}

export function eventPayment(
  encounter: TEventEncounter,
  requirementId: string,
  payment: TEventPayment | undefined,
  player: TPlayerState,
  cards: TCards,
  rng: SeededRng
): Either<TEventRefusal, { player: TPlayerState; receipt: TEventReceipt }> {
  const requirement = encounter.card?.requirements.find(
    ({ id }) => id === requirementId
  )
  const progress = requirementProgress(encounter, player, cards).find(
    (entry) => entry.requirementId === requirementId
  )
  if (!requirement || !progress || requirement.kind === 'minimum')
    return left('requirementNotPayable')
  if (progress.status === 'paid') return left('requirementPaid')
  const receipt: TEventReceipt = { requirementId }
  const accept = (
    patch: Partial<TPlayerState>
  ): Either<TEventRefusal, { player: TPlayerState; receipt: TEventReceipt }> =>
    right({ player: { ...player, ...patch }, receipt })
  const invalid = () =>
    left<TEventRefusal, { player: TPlayerState; receipt: TEventReceipt }>(
      'paymentInvalid'
    )
  const hand = handCopiesOf(player)
  const remove = (copies: readonly THandCopy[]) => {
    const handCopies = hand.filter(
      ({ copyId }) => !copies.some((copy) => copy.copyId === copyId)
    )
    return { handCopies, hand: handCopies.map(({ cardId }) => cardId) }
  }
  const discard = (copies: THandCopy[]) => {
    receipt.handCards = copies
    return accept({
      ...remove(copies),
      discard: [...player.discard, ...copies.map(({ cardId }) => cardId)],
    })
  }
  const selectedHand = (count: number, eligible: readonly string[]) => {
    const ids = payment?.handCards
    if (
      !ids ||
      Object.keys(payment ?? {}).length !== 1 ||
      ids.length !== count ||
      new Set(ids).size !== count ||
      ids.some((id) => !eligible.includes(id))
    )
      return null
    return ids.flatMap((id) => hand.filter(({ copyId }) => copyId === id))
  }
  switch (requirement.kind) {
    case 'attributes':
    case 'discardFromHand': {
      if (requirement.kind === 'discardFromHand' && requirement.random) {
        if (payment !== undefined) return invalid()
        const spent = encounter.payments
          .filter((entry) => entry.requirementId === requirementId)
          .flatMap((entry) => entry.handCards ?? [])
        const eligible = hand.filter((copy) =>
          matchesDiscard(requirement, [...spent, copy], cards)
        )
        return eligible.length
          ? discard([eligible[rng.nextInt(0, eligible.length - 1)]])
          : invalid()
      }
      const copies = selectedHand(1, progress.eligibleHandCopyIds)
      return copies ? discard(copies) : invalid()
    }
    case 'payGold':
    case 'spendVigor':
    case 'donateLife': {
      if (payment !== undefined || progress.amountDue === null) return invalid()
      const field =
        requirement.kind === 'payGold'
          ? 'gold'
          : requirement.kind === 'spendVigor'
            ? 'vigor'
            : 'health'
      if (!progress.payable)
        return left(
          field === 'gold'
            ? 'notEnoughGold'
            : field === 'vigor'
              ? 'notEnoughVigor'
              : 'notEnoughLife'
        )
      receipt[field] = progress.amountDue
      return accept({ [field]: player[field] - progress.amountDue })
    }
    case 'discardHandDownTo':
    case 'discardWholeHand':
      return payment === undefined && progress.payable
        ? discard(
            hand.slice(
              0,
              requirement.kind === 'discardWholeHand'
                ? hand.length
                : hand.length - requirement.leave
            )
          )
        : invalid()
    case 'abandonEquipment': {
      if (!progress.payable) return invalid()
      const slots = requirement.random
        ? payment === undefined
          ? shuffle(progress.eligibleEquipmentSlots, rng).slice(
              0,
              requirement.count
            )
          : null
        : payment?.equipmentSlots
      if (
        !slots ||
        (!requirement.random && Object.keys(payment ?? {}).length !== 1) ||
        slots.length !== requirement.count ||
        new Set(slots).size !== slots.length ||
        slots.some((slot) => !progress.eligibleEquipmentSlots.includes(slot))
      )
        return invalid()
      const equipment = { ...player.equipment }
      receipt.equipment = slots.map((slot) => {
        const cardId = equipment[slot]!
        equipment[slot] = null
        return { slot, cardId }
      })
      return accept({ equipment })
    }
    case 'offerResources': {
      const resources = payment?.resources
      if (
        !resources ||
        Object.keys(payment ?? {}).length !== 1 ||
        new Set(resources.map(({ cardId }) => cardId)).size !==
          resources.length ||
        resources.some(
          ({ cardId, copies }) =>
            !progress.eligibleResourceCardIds.includes(cardId) ||
            copies >
              player.inventory
                .filter((slot) => slot.cardId === cardId)
                .reduce((sum, slot) => sum + slot.quantity, 0)
        )
      )
        return invalid()
      const offered = resources.flatMap(({ cardId, copies }) =>
        Array.from({ length: copies }, () => cardId)
      )
      const filters = requirement.requirements.flatMap(({ resource, count }) =>
        Array.from({ length: count }, () => resource)
      )
      const matches = (
        index: number,
        remaining: readonly string[]
      ): boolean => {
        const filter = filters[index]
        if (filter === undefined) return remaining.length === 0
        return remaining.some(
          (id, position) =>
            resourceMatches(cards.get(id)!, filter) &&
            matches(
              index + 1,
              remaining.filter((_, i) => i !== position)
            )
        )
      }
      if (
        offered.length !== filters.length ||
        (requirement.constraint === 'same' && new Set(offered).size !== 1) ||
        (requirement.constraint === 'distinct' &&
          new Set(offered).size !== offered.length) ||
        !matches(0, offered)
      )
        return invalid()
      const remaining = new Map(
        resources.map(({ cardId, copies }) => [cardId, copies])
      )
      const inventory = player.inventory.flatMap((slot) => {
        const due = remaining.get(slot.cardId) ?? 0
        const taken = Math.min(due, slot.quantity)
        remaining.set(slot.cardId, due - taken)
        return taken === slot.quantity
          ? []
          : [{ ...slot, quantity: slot.quantity - taken }]
      })
      receipt.resources = resources
      return accept({ inventory })
    }
    case 'manipulateAttributeCards': {
      if (!progress.payable) return invalid()
      const { mode } = requirement
      if (mode === 'handToTop' || mode === 'handToBottom') {
        const copies = selectedHand(
          Math.min(hand.length, requirement.count),
          progress.eligibleHandCopyIds
        )
        if (!copies) return invalid()
        receipt.movedAttributeCards = copies
        const ids = copies.map(({ cardId }) => cardId)
        return accept({
          ...remove(copies),
          deck:
            mode === 'handToTop'
              ? [...ids, ...player.deck]
              : [...player.deck, ...ids],
        })
      }
      if (payment !== undefined) return invalid()
      if (mode === 'reshuffleHand') {
        const copies = hand.slice(0, requirement.count)
        receipt.movedAttributeCards = copies
        return accept({
          ...remove(copies),
          deck: shuffle(
            [...player.deck, ...copies.map(({ cardId }) => cardId)],
            rng
          ),
        })
      }
      if (mode === 'reshuffleDiscard') {
        const cards = player.discard.slice(0, requirement.count)
        return accept({
          discard: player.discard.slice(cards.length),
          deck: shuffle([...player.deck, ...cards], rng),
        })
      }
      const count = Math.min(player.deck.length, requirement.count)
      const cut = mode === 'millTop' ? count : player.deck.length - count
      const [head, tail] = [player.deck.slice(0, cut), player.deck.slice(cut)]
      return accept({
        deck: mode === 'millTop' ? tail : head,
        discard: [...player.discard, ...(mode === 'millTop' ? head : tail)],
      })
    }
  }
}
