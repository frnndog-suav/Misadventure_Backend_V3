import { describe, expect, it } from 'vitest'
import { SeededRng } from '@/core/rng/seeded-rng'
import {
  makeItemCard,
  makeRandomEventCard,
} from '../../../../../test/factories/make-card'
import { makePlayerState } from '../../../../../test/factories/make-party'
import { eventPayment, type TEventEncounter } from '../random-event'
import { eventPaymentIntents } from './event-payments'

const tagged = makeItemCard({ id: 'fixture.tagged', tags: ['offering'] })
const ordinary = makeItemCard({ id: 'fixture.ordinary', tags: [] })
const cards = new Map([tagged, ordinary].map((card) => [card.id, card]))
const event: TEventEncounter = {
  id: 'encounter',
  memberId: 'helper',
  zoneType: 'urban',
  phase: 'encounter',
  payments: [],
  decisionDeadlineAt: null,
  card: {
    ...makeRandomEventCard(),
    requirements: [
      {
        id: 'offer',
        text: 'Ofereça dois recursos distintos.',
        kind: 'offerResources',
        requirements: [
          { resource: 'any', count: 1 },
          { resource: 'tag:offering', count: 1 },
        ],
        constraint: 'distinct',
        exclude: [],
      },
    ],
    goodOutcome: { text: 'Sucesso', steps: [] },
    badOutcome: { text: 'Revés', steps: [] },
  },
}

describe('REQ-182/D-156: oferta de recursos pelo ajudante', () => {
  it('reserva o único recurso que atende ao filtro mais restrito', () => {
    const player = makePlayerState({
      inventory: [
        { cardId: tagged.id, quantity: 1 },
        { cardId: ordinary.id, quantity: 1 },
      ],
    })
    const [intent] = eventPaymentIntents(event, player, cards, 10)
    expect(intent).toMatchObject({
      type: 'payEventRequirement',
      requirementId: 'offer',
    })
    const result = eventPayment(
      event,
      intent.requirementId,
      intent.payment,
      player,
      cards,
      SeededRng.fromSeed(42)
    )
    expect(result.isRight()).toBe(true)
    if (result.isRight()) expect(result.value.player.inventory).toEqual([])
  })

  it('omite o pagamento quando as duas cópias são do mesmo recurso', () => {
    const player = makePlayerState({
      inventory: [{ cardId: tagged.id, quantity: 2 }],
    })
    expect(eventPaymentIntents(event, player, cards, 10)).toEqual([])
  })
})
