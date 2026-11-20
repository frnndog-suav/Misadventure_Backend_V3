import { left, right, type Either } from '@/core/error/either'
import { SeededRng, type RngState } from '@/core/rng/seeded-rng'
import {
  EQUIPMENT_SLOTS,
  type TEquipmentSlot,
  type TCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TCost,
  TResourceOffer,
} from '@/domain/catalog/enterprise/value-objects/effect'
import {
  EXECUTABLE_COSTS,
  payEffectCosts,
  quantityOf,
  type TPaymentRefusal,
} from '../effect-payment'
import {
  describeHandPayment,
  handCount,
  matchingHands,
} from '../effect-payment/hand-payment'
import type { TPlayerState } from '../entities/party-member'
import type { TEventPayment } from '../party-action'
import { handCopiesOf, resourceMatches } from '../random-event'
import { shuffle } from '../shuffle'

type Cards = ReadonlyMap<string, TCard>
type Resources = { cardId: string; copies: number }[]
type CostOption = { costIndex: number; text: string } & (
  | { type: 'automatic' }
  | { type: 'handCards'; count: number; eligibleCopyIds: string[] }
  | { type: 'equipmentSlots'; count: number; eligibleSlots: TEquipmentSlot[] }
  | {
      type: 'resources'
      count: number
      eligibleResources: { cardId: string; maxCopies: number }[]
    }
)
type Payment = { player: TPlayerState; rngState: RngState }

function handOptions(
  player: TPlayerState,
  cost: Extract<TCost, { kind: 'discardFromHand' }>,
  cards: Cards,
  ids: readonly string[]
) {
  const catalog = new Map<string, TCard>()
  for (const { cardId, copyId } of handCopiesOf(player)) {
    const card = cards.get(cardId)
    if (card) catalog.set(copyId, card)
  }
  return matchingHands(cost, ids, catalog)
}

function discardHand(
  player: TPlayerState,
  ids: readonly string[]
): TPlayerState {
  const copies = handCopiesOf(player)
  const handCopies = copies.filter(({ copyId }) => !ids.includes(copyId))
  return {
    ...player,
    handCopies,
    hand: handCopies.map(({ cardId }) => cardId),
    discard: [
      ...player.discard,
      ...ids.flatMap((id) =>
        copies.filter(({ copyId }) => copyId === id).map(({ cardId }) => cardId)
      ),
    ],
  }
}

function eligibleSlots(
  player: TPlayerState,
  cost: Extract<TCost, { kind: 'abandonEquipment' }>
) {
  return EQUIPMENT_SLOTS.filter(
    (slot) =>
      player.equipment[slot] !== null &&
      !cost.excludeSlots.includes(slot) &&
      (!cost.slots.length || cost.slots.includes(slot))
  )
}

function* selections<T>(slots: readonly T[], count: number): Generator<T[]> {
  if (count === 0) {
    yield []
    return
  }
  for (let index = 0; index <= slots.length - count; index++)
    for (const rest of selections(slots.slice(index + 1), count - 1))
      yield [slots[index], ...rest]
}

function eligibleResources(
  player: TPlayerState,
  cost: TResourceOffer,
  cards: Cards
) {
  const counts = new Map<string, number>()
  for (const { cardId, quantity } of player.inventory) {
    const card = cards.get(cardId)
    if (
      card &&
      !cost.exclude.some((filter) => resourceMatches(card, filter)) &&
      cost.requirements.some(({ resource }) => resourceMatches(card, resource))
    )
      counts.set(cardId, (counts.get(cardId) ?? 0) + quantity)
  }
  return counts
}

function* resourceChoices(
  cost: TResourceOffer,
  cards: Cards,
  counts: Map<string, number>
): Generator<Resources> {
  const filters = cost.requirements.flatMap(({ resource, count }) =>
    Array<string>(count).fill(resource)
  )
  const chosen = new Map<string, number>()
  const yielded = new Set<string>()
  function* assign(index: number): Generator<Resources> {
    if (index === filters.length) {
      const key = JSON.stringify([...chosen].sort())
      if (!yielded.has(key)) {
        yielded.add(key)
        yield [...chosen].map(([cardId, copies]) => ({ cardId, copies }))
      }
      return
    }
    for (const [cardId, count] of counts) {
      const used = chosen.get(cardId) ?? 0
      if (used >= count || !resourceMatches(cards.get(cardId)!, filters[index]))
        continue
      if (cost.constraint === 'same' && index > 0 && used === 0) continue
      if (cost.constraint === 'distinct' && used > 0) continue
      chosen.set(cardId, used + 1)
      yield* assign(index + 1)
      if (used) chosen.set(cardId, used)
      else chosen.delete(cardId)
    }
  }
  yield* assign(0)
}

function subtractResources(
  inventory: TPlayerState['inventory'],
  resources: Resources
) {
  const remaining = new Map(
    resources.map(({ cardId, copies }) => [cardId, copies])
  )
  return inventory.flatMap(({ cardId, quantity }) => {
    const taken = Math.min(quantity, remaining.get(cardId) ?? 0)
    remaining.set(cardId, (remaining.get(cardId) ?? 0) - taken)
    return quantity > taken ? [{ cardId, quantity: quantity - taken }] : []
  })
}

/** A mesma alocação valida o lote enviado e simula a elegibilidade das opções. */
export function payAbility(
  player: TPlayerState,
  cardId: string,
  costs: readonly TCost[],
  cards: Cards,
  rngState: RngState,
  payment?: TEventPayment,
  {
    simulate = false,
    enemyCount = 0,
  }: { simulate?: boolean; enemyCount?: number } = {}
): Either<TPaymentRefusal, Payment> {
  const invalid = () =>
    left<TPaymentRefusal, Payment>({ reason: 'paymentInvalid' })
  const manualHand = payment?.handCards ?? []
  const manualSlots = payment?.equipmentSlots ?? []
  const resources = payment?.resources ?? []
  if (
    new Set(manualHand).size !== manualHand.length ||
    new Set(manualSlots).size !== manualSlots.length ||
    new Set(resources.map((entry) => entry.cardId)).size !== resources.length
  )
    return invalid()
  function pay(
    index: number,
    current: TPlayerState,
    state: RngState,
    handLeft: readonly string[],
    slotsLeft: readonly TEquipmentSlot[],
    resourcesLeft: Resources
  ): Either<TPaymentRefusal, Payment> {
    const cost = costs[index]
    if (!cost)
      return handLeft.length || slotsLeft.length || resourcesLeft.length
        ? invalid()
        : right({ player: current, rngState: state })
    const next = (
      patch: Partial<TPlayerState>,
      nextState = state,
      hand = handLeft,
      slots = slotsLeft,
      items = resourcesLeft
    ) => pay(index + 1, { ...current, ...patch }, nextState, hand, slots, items)
    const rng = SeededRng.fromState(state)
    switch (cost.kind) {
      case 'discardFromHand': {
        const available = handCopiesOf(current)
          .map(({ copyId }) => copyId)
          .filter(
            (id) =>
              simulate ||
              (cost.random ? !handLeft.includes(id) : handLeft.includes(id))
          )
        const ordered =
          cost.random && !simulate ? shuffle(available, rng) : available
        for (const choice of handOptions(current, cost, cards, ordered)) {
          const result = next(
            discardHand(current, choice),
            rng.state(),
            handLeft.filter((id) => !choice.includes(id))
          )
          if (result.isRight() || result.value.reason !== 'paymentInvalid')
            return result
        }
        return invalid()
      }
      case 'discardWholeHand':
      case 'discardHandDownTo': {
        const count =
          current.hand.length -
          (cost.kind === 'discardWholeHand' ? 0 : cost.leave)
        if (count < cost.minimum) return left({ reason: 'minimumNotMet' })
        const copies = handCopiesOf(current)
          .map(({ copyId }) => copyId)
          .filter((id) => !handLeft.includes(id))
        if (copies.length < count) return invalid()
        const ordered =
          cost.kind === 'discardWholeHand' || simulate
            ? copies
            : shuffle(copies, rng)
        for (const picked of selections(ordered, count)) {
          const result = next(discardHand(current, picked), rng.state())
          if (result.isRight() || result.value.reason !== 'paymentInvalid')
            return result
        }
        return invalid()
      }
      case 'abandonEquipment': {
        const slots = eligibleSlots(current, cost).filter(
          (slot) =>
            simulate ||
            (cost.random ? !slotsLeft.includes(slot) : slotsLeft.includes(slot))
        )
        const ordered = cost.random && !simulate ? shuffle(slots, rng) : slots
        for (const chosen of selections(ordered, cost.count)) {
          const equipment = { ...current.equipment }
          for (const slot of chosen) equipment[slot] = null
          const result = next(
            {
              equipment,
              brokenEquipment: current.brokenEquipment?.filter(
                (slot) => !chosen.includes(slot)
              ),
            },
            rng.state(),
            handLeft,
            slotsLeft.filter((slot) => !chosen.includes(slot))
          )
          if (result.isRight() || result.value.reason !== 'paymentInvalid')
            return result
        }
        return invalid()
      }
      case 'offerResources': {
        const available = eligibleResources(current, cost, cards)
        const counts = simulate
          ? available
          : new Map(
              resourcesLeft.map(({ cardId, copies }) => [
                cardId,
                Math.min(copies, available.get(cardId) ?? 0),
              ])
            )
        for (const choice of resourceChoices(cost, cards, counts)) {
          const remaining = subtractResources(
            resourcesLeft.map(({ cardId, copies }) => ({
              cardId,
              quantity: copies,
            })),
            choice
          )
          const result = next(
            { inventory: subtractResources(current.inventory, choice) },
            state,
            handLeft,
            slotsLeft,
            remaining.map(({ cardId, quantity }) => ({
              cardId,
              copies: quantity,
            }))
          )
          if (result.isRight() || result.value.reason !== 'paymentInvalid')
            return result
        }
        return invalid()
      }
      case 'manipulateAttributeCards': {
        const { mode, minimum } = cost
        const source =
          mode === 'reshuffleDiscard'
            ? current.discard
            : mode === 'millTop' || mode === 'millBottom'
              ? current.deck
              : current.hand
        if (source.length < (minimum ?? 0))
          return left({ reason: 'minimumNotMet' })
        const count = Math.min(source.length, cost.count)
        if (mode === 'millTop' || mode === 'millBottom') {
          const cut = mode === 'millTop' ? count : source.length - count
          const [head, tail] = [source.slice(0, cut), source.slice(cut)]
          return next({
            deck: mode === 'millTop' ? tail : head,
            discard: [
              ...current.discard,
              ...(mode === 'millTop' ? head : tail),
            ],
          })
        }
        if (mode === 'reshuffleDiscard')
          return next(
            {
              discard: source.slice(count),
              deck: shuffle([...current.deck, ...source.slice(0, count)], rng),
            },
            rng.state()
          )
        const copies = handCopiesOf(current)
        if (mode === 'reshuffleHand') {
          const moved = copies
            .filter(({ copyId }) => !handLeft.includes(copyId))
            .slice(0, count)
          if (moved.length !== count) return invalid()
          return next(
            {
              ...discardHand(
                current,
                moved.map(({ copyId }) => copyId)
              ),
              discard: current.discard,
              deck: shuffle(
                [...current.deck, ...moved.map(({ cardId }) => cardId)],
                rng
              ),
            },
            rng.state()
          )
        }
        const available = simulate
          ? copies
          : copies.filter(({ copyId }) => handLeft.includes(copyId))
        for (const chosen of selections(available, count)) {
          const chosenIds = chosen.map(({ copyId }) => copyId)
          const ordered = simulate
            ? chosen
            : handLeft.flatMap((id) =>
                chosen.filter(({ copyId }) => copyId === id)
              )
          const cards = ordered.map(({ cardId }) => cardId)
          const result = next(
            {
              ...discardHand(current, chosenIds),
              discard: current.discard,
              deck:
                mode === 'handToTop'
                  ? [...cards, ...current.deck]
                  : [...current.deck, ...cards],
            },
            state,
            handLeft.filter((id) => !chosenIds.includes(id))
          )
          if (result.isRight() || result.value.reason !== 'paymentInvalid')
            return result
        }
        return invalid()
      }
      default: {
        if (!EXECUTABLE_COSTS.includes(cost.kind)) return invalid()
        const paid = payEffectCosts(
          current,
          cardId,
          [cost],
          cards,
          undefined,
          enemyCount,
          true
        )
        return paid.isLeft() ? left(paid.value) : next(paid.value.player)
      }
    }
  }
  return pay(0, player, rngState, manualHand, manualSlots, resources)
}

export function describeAbilityPayment(
  player: TPlayerState,
  cardId: string,
  costs: readonly TCost[],
  cards: Cards,
  rngState: RngState,
  enemyCount = 0,
  includeUnavailable = false
) {
  const canPay = payAbility(player, cardId, costs, cards, rngState, undefined, {
    simulate: true,
    enemyCount,
  }).isRight()
  if (!canPay && !includeUnavailable) return null
  const paymentCosts = costs.map((cost, costIndex): CostOption => {
    if (cost.kind === 'discardFromHand' && !cost.random) {
      const ids = handCopiesOf(player).map(({ copyId }) => copyId)
      const eligible = new Set<string>()
      for (const choice of handOptions(player, cost, cards, ids))
        for (const id of choice) eligible.add(id)
      return {
        costIndex,
        type: 'handCards',
        count: handCount(cost),
        text: describeHandPayment([cost])?.text ?? 'Escolha as cartas da mão.',
        eligibleCopyIds: ids.filter((id) => eligible.has(id)),
      }
    }
    if (cost.kind === 'abandonEquipment' && !cost.random)
      return {
        costIndex,
        type: 'equipmentSlots',
        count: cost.count,
        text: `Escolha ${cost.count} equipamento(s) para abandonar.`,
        eligibleSlots: eligibleSlots(player, cost),
      }
    if (
      cost.kind === 'manipulateAttributeCards' &&
      (cost.mode === 'handToTop' || cost.mode === 'handToBottom')
    ) {
      const count = Math.min(player.hand.length, cost.count)
      return {
        costIndex,
        type: 'handCards',
        count,
        eligibleCopyIds: handCopiesOf(player).map(({ copyId }) => copyId),
        text: `Escolha ${count} carta(s) para mover ao ${cost.mode === 'handToTop' ? 'topo' : 'fundo'} do deck.`,
      }
    }
    if (cost.kind === 'offerResources') {
      const count = cost.requirements.reduce(
        (total, entry) => total + entry.count,
        0
      )
      const candidates = [...eligibleResources(player, cost, cards)].map(
        ([id, copies]) => ({
          cardId: id,
          maxCopies: Math.min(
            copies,
            cost.constraint === 'distinct' ? 1 : count
          ),
        })
      )
      return {
        costIndex,
        type: 'resources',
        count,
        text: `Escolha ${count} recurso(s) para oferecer.`,
        eligibleResources: candidates,
      }
    }
    const amount =
      'amount' in cost && cost.amount !== null
        ? quantityOf(cost.amount, player, cards, enemyCount, true)
        : null
    const text =
      cost.kind === 'spendVigor'
        ? `Gaste ${amount} de Vigor.`
        : cost.kind === 'payGold'
          ? `Pague ${amount} de ouro.`
          : cost.kind === 'donateLife'
            ? `Doe ${amount} de vida.`
            : cost.kind === 'reducePeak'
              ? 'Reduza o Pico conforme o custo.'
              : cost.kind === 'consumeSelf'
                ? 'Consuma este recurso.'
                : cost.kind === 'abandonEquipment'
                  ? `Abandone ${cost.count} equipamento(s) ao acaso.`
                  : 'Descarte as cartas da mão conforme o custo.'
    return { costIndex, type: 'automatic', text }
  })
  const vigorCost = costs.reduce(
    (total, cost) =>
      cost.kind === 'spendVigor'
        ? total +
          (quantityOf(cost.amount, player, cards, enemyCount, true) ?? 0)
        : total,
    0
  )
  return { vigorCost, paymentCosts, canPay }
}
