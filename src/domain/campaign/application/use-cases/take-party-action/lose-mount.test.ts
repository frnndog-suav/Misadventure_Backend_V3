import { describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type {
  TCard,
  TExecutableAbility,
} from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  PartyMember,
  type TPlayerState,
} from '../../../enterprise/entities/party-member'
import {
  makeAttributeCard,
  makeCombatEventCard,
  makeDimensionCard,
  makeEnemy,
  makeItemCard,
  makeMountCard,
  makeRandomEventCard,
  makeUrbanZoneCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'
import { TakePartyActionUseCase } from '.'

// T-75: loseMount fora do activate (REQ-163, D-150 a): habilidades e evento.

const MEMBER = new UniqueEntityID('member-1')
const endurance = makeAttributeCard({
  id: 'fixture.endurance-basic',
  attributes: ['endurance'],
})
const harbor = makeUrbanZoneCard({ zoneActions: ['startEvent'] })
const POTION = makeItemCard({ id: 'fixture.healing-potion' })
const emptyOutcome = { text: 'Sem efeito.', steps: [] }
const loseMount = {
  text: 'Perca a montaria.',
  trigger: null,
  cost: [],
  activation: [{ kind: 'loseMount' }],
  duration: { kind: 'immediate' },
  mark: null,
} as const

function ability(
  timing: TExecutableAbility['timing'],
  id: string
): TExecutableAbility {
  return {
    id,
    name: 'Debandada',
    text: 'Perca a montaria.',
    form: 'targeted',
    element: null,
    cost: [],
    power: null,
    effects: [loseMount],
    cooldown: 0,
    timing,
    classRestriction: [],
    usesPerTurn: 1,
    target: 'self',
    duration: null,
    channel: null,
  } as TExecutableAbility
}
const STEED = makeMountCard({
  id: 'fixture.test-steed',
  abilities: [
    ability('outsideCombat', 'steed-bolt'),
    ability('combat', 'steed-stampede'),
  ],
})
const mountState = {
  cardId: STEED.id,
  inventory: [{ cardId: POTION.id, quantity: 2 }],
  tcgFolder: [{ cardId: endurance.id, copies: 3 }],
}
const expectedLimbo = [
  expect.objectContaining({
    type: 'SentToLimbo',
    memberId: MEMBER,
    cardId: STEED.id,
    quantity: 1,
    from: 'mount',
  }),
  expect.objectContaining({
    type: 'SentToLimbo',
    memberId: MEMBER,
    cardId: POTION.id,
    quantity: 2,
    from: 'mountInventory',
  }),
  expect.objectContaining({
    type: 'SentToLimbo',
    memberId: MEMBER,
    cardId: endurance.id,
    quantity: 3,
    from: 'mountTcgFolder',
  }),
]

const enemy = makeEnemy({ count: 1, health: 30 })
const combatCard = makeCombatEventCard({
  goodOutcome: emptyOutcome,
  badOutcome: emptyOutcome,
  enemies: [
    {
      ...enemy,
      modifiers: { ...enemy.modifiers, attack: 0, defense: 0, celerity: 0 },
    },
  ],
})
const randomEvent = makeRandomEventCard({
  requirements: [
    {
      id: 'min',
      text: 'Vigor mínimo 0.',
      kind: 'minimum',
      stat: 'vigor',
      value: 0,
    },
  ],
  goodOutcome: {
    text: 'Perca a montaria.',
    steps: [{ type: 'effect', effect: loseMount }],
  },
  badOutcome: emptyOutcome,
} as unknown as Parameters<typeof makeRandomEventCard>[0])

function setup(eventCard: TCard) {
  const dimension = makeDimensionCard({
    id: 'fixture.test-dimension',
    eventDecks: [
      { zoneType: 'urban', cards: [{ cardId: eventCard.id, copies: 1 }] },
    ],
  })
  const member = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({
        deck: [endurance.id],
        peak: 0,
        health: 18,
        ...({ mount: mountState } as unknown as Partial<TPlayerState>),
      }),
    },
    MEMBER
  )
  let party = makeParty({
    status: 'inSession',
    members: [member],
    hostMemberId: MEMBER,
    turn: { round: 1, memberId: MEMBER, actionPoints: 1 },
    config: GAME_CONFIG_DEFAULTS,
    rewardDecks: [{ zoneType: 'urban', cards: [] }],
  })
  const repository = new InMemoryPartiesRepository()
  vi.spyOn(repository, 'findById').mockImplementation(async () => party)
  vi.spyOn(repository, 'save').mockImplementation(async (updated) => {
    party = updated
  })
  const catalog = new InMemoryCardCatalog()
  catalog.cards = [eventCard, dimension, harbor, endurance, POTION, STEED]
  const sut = new TakePartyActionUseCase(
    repository,
    fixedClock('2026-11-25T12:00:00Z'),
    catalog,
    sequentialIds()
  )

  async function accept(body: unknown) {
    const result = await sut.execute({ partyId: party.id.toString(), body })
    if (result.isLeft())
      throw new Error(`Ação recusada: ${JSON.stringify(result.value)}`)
    return result.value.party
  }

  async function reveal() {
    const started = await accept({ type: 'startEvent' })
    const encounter = started.randomEventEncounter
    if (!encounter) throw new Error('O encontro deveria estar aberto')
    await accept({ type: 'revealEvent', encounterId: encounter.id })
    return encounter.id
  }

  const mountLimboEvents = () =>
    party
      .pullDomainEvents()
      .filter(
        (event) =>
          event.type === 'SentToLimbo' &&
          (event as { from: string }).from.startsWith('mount')
      )

  return {
    accept,
    reveal,
    party: () => party,
    player: () => party.members[0].player as { mount?: unknown },
    mountLimboEvents,
  }
}

describe('loseMount fora do activate (REQ-163, D-150 a)', () => {
  it('REQ-163: habilidade da Preparar com loseMount leva montaria, inventário extra e pasta extra ao limbo, um SentToLimbo por entrada, na ordem', async () => {
    const game = setup(combatCard)

    await game.accept({
      type: 'prepare',
      operation: 'useAbility',
      abilityId: 'steed-bolt',
      mountAbility: true,
    })

    expect(game.player().mount).toBeNull()
    expect(game.mountLimboEvents()).toEqual(expectedLimbo)
  })

  it('REQ-163: habilidade de combate com loseMount emite um SentToLimbo por entrada, na ordem', async () => {
    const game = setup(combatCard)
    await game.reveal()
    game.party().pullDomainEvents()
    const state = game.party().combat!

    await game.accept({
      type: 'useAbility',
      combatId: state.id,
      turnId: state.turn.id,
      abilityId: 'steed-stampede',
      mountAbility: true,
    })

    expect(game.player().mount).toBeNull()
    expect(game.mountLimboEvents()).toEqual(expectedLimbo)
  })

  it('REQ-163: efeito do resultado do evento com loseMount emite um SentToLimbo por entrada, na ordem', async () => {
    const game = setup(randomEvent)
    const encounterId = await game.reveal()
    game.party().pullDomainEvents()

    await game.accept({ type: 'resolveEvent', encounterId })

    expect(game.player().mount).toBeNull()
    expect(game.mountLimboEvents()).toEqual(expectedLimbo)
  })
})
