import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  PartyMember,
  type TPlayerState,
} from '../../../enterprise/entities/party-member'
import {
  makeDimensionCard,
  makeItemCard,
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

import { ActionInvalidError } from '../_errors/action-invalid-error'
import { ActionNotAllowedError } from '../_errors/action-not-allowed-error'
import { PartySessionNotActiveError } from '../_errors/party-session-not-active-error'
import { TakePartyActionUseCase } from '.'

const NOW = '2026-11-18T12:00:00.000Z'
const ROD = makeItemCard({
  id: 'fixture.fishing-rod',
  itemCategory: 'tool',
  toolKind: 'fishing-rod',
  scavengeZoneTypes: ['urban'],
})
const FISH = makeItemCard({
  id: 'fixture.silver-fish',
  itemCategory: 'material',
  scavengeTool: 'fishing-rod',
})
const POTION = makeItemCard({ id: 'fixture.healing-potion' })
const HARBOR = makeUrbanZoneCard({
  zoneActions: ['startEvent', 'scavenge', 'useVault', 'saveRespawnPoint'],
})
const DIMENSION = makeDimensionCard({
  id: 'fixture.test-dimension',
  rewardDecks: [
    {
      zoneType: 'urban',
      cards: [
        { cardId: FISH.id, copies: 1 },
        { cardId: POTION.id, copies: 1 },
      ],
    },
  ],
})

let repository: InMemoryPartiesRepository
let catalog: InMemoryCardCatalog
let sut: TakePartyActionUseCase

function rewardState(party: ReturnType<typeof makeParty>) {
  return {
    actionPoints: party.turn.actionPoints,
    randomEventEncounter: party.randomEventEncounter,
    pendingRewards: party.pendingRewards,
    rewardDecks: party.rewardDecks,
  }
}

async function seed(
  player: Partial<TPlayerState> = {},
  status: 'idle' | 'inSession' = 'inSession',
  rewardCards = [POTION.id, FISH.id]
) {
  const host = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({
        inventory: [{ cardId: ROD.id, quantity: 1 }],
        ...player,
      }),
    },
    new UniqueEntityID('member-1')
  )
  const party = makeParty({
    status,
    members: [host],
    hostMemberId: host.id,
    rewardDecks: [{ zoneType: 'urban', cards: rewardCards }],
    config: {
      ...GAME_CONFIG_DEFAULTS,
      reserveDeck: [{ type: 'card', cardId: FISH.id, weight: 1 }],
    },
  })
  await repository.create(party)
  return party.id.toString()
}

describe('TakePartyActionUseCase — scavenge', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    catalog = new InMemoryCardCatalog()
    catalog.cards = [ROD, FISH, POTION, HARBOR, DIMENSION]
    sut = new TakePartyActionUseCase(
      repository,
      fixedClock(NOW),
      catalog,
      sequentialIds()
    )
  })

  it('REQ-91: lê zona, dimensão e cartas no catálogo, aplica, grava e devolve o Party', async () => {
    const partyId = await seed()
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({
      partyId,
      body: { type: 'scavenge', cardId: FISH.id },
    })

    expect(result.isRight()).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.inventory).toEqual([
      { cardId: ROD.id, quantity: 1 },
      { cardId: FISH.id, quantity: 1 },
    ])
    expect(stored?.members[0].player.lastScavenge).toEqual({
      cardId: FISH.id,
      found: true,
      delivery: 'inventory',
    })
    expect(stored?.rewardDecks).toEqual([
      { zoneType: 'urban', cards: [POTION.id] },
    ])
  })

  it('REQ-92: forma → ACTION_INVALID; nada gravado', async () => {
    const partyId = await seed()
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({ partyId, body: { type: 'scavenge' } })

    expect(result.value).toBeInstanceOf(ActionInvalidError)
    expect(save).not.toHaveBeenCalled()
  })

  it('REQ-92: idle → PARTY_SESSION_NOT_ACTIVE', async () => {
    const partyId = await seed({}, 'idle')
    const result = await sut.execute({
      partyId,
      body: { type: 'scavenge', cardId: FISH.id },
    })
    expect(result.value).toBeInstanceOf(PartySessionNotActiveError)
  })

  it.each([
    [
      'zoneActionUnavailable',
      () => (catalog.cards = [ROD, FISH, POTION, DIMENSION]),
      FISH.id,
    ],
    ['notScavengeable', () => undefined, POTION.id],
    [
      'notScavengeable',
      () => (catalog.cards = [ROD, FISH, POTION, HARBOR]),
      FISH.id,
    ],
  ])(
    'REQ-92: %s → ACTION_NOT_ALLOWED; nada gravado',
    async (reason, arrange, cardId) => {
      arrange()
      const partyId = await seed()
      const save = vi.spyOn(repository, 'save')

      const result = await sut.execute({
        partyId,
        body: { type: 'scavenge', cardId },
      })

      expect(result.value).toBeInstanceOf(ActionNotAllowedError)
      expect((result.value as ActionNotAllowedError).details).toEqual({
        reason,
      })
      expect(save).not.toHaveBeenCalled()
    }
  )

  it('REQ-92: 0 pontos → noActionPoints', async () => {
    const partyId = await seed()
    const stored = await repository.findById(partyId)
    if (!stored) throw new Error('esperava grupo')
    for (let i = 0; i < stored.turn.actionPoints; i++) {
      await sut.execute({
        partyId,
        body: { type: 'scavenge', cardId: FISH.id },
      })
    }
    const result = await sut.execute({
      partyId,
      body: { type: 'scavenge', cardId: FISH.id },
    })
    expect((result.value as ActionNotAllowedError).details).toEqual({
      reason: 'noActionPoints',
    })
  })

  it('REQ-115: inventário cheio abre escolha, gasta 1 PA e deixar devolve ao fundo', async () => {
    const partyId = await seed({
      inventory: [
        { cardId: ROD.id, quantity: 1 },
        ...Array.from({ length: 9 }, () => ({ cardId: ROD.id, quantity: 1 })),
      ],
    })
    // A T-43 cobre a persistência da escolha no save.
    let party = repository.items[0]
    vi.spyOn(repository, 'findById').mockImplementation(async () => party)
    vi.spyOn(repository, 'save').mockImplementation(async (updated) => {
      party = updated
    })
    const initialPoints = party.turn.actionPoints
    const result = await sut.execute({
      partyId,
      body: { type: 'scavenge', cardId: FISH.id },
    })
    expect(result.isRight()).toBe(true)
    expect(rewardState(party)).toMatchObject({
      actionPoints: initialPoints - 1,
      randomEventEncounter: null,
      pendingRewards: [
        {
          id: expect.any(String),
          cardId: FISH.id,
          origin: { type: 'rewardDeck', zoneType: 'urban' },
          source: { type: 'scavenge' },
        },
      ],
    })
    expect(party.members[0].player.lastScavenge).toEqual({
      cardId: FISH.id,
      found: true,
      delivery: 'pending',
    })
    expect(party.rewardDecks).toEqual([
      { zoneType: 'urban', cards: [POTION.id] },
    ])
    const left = await sut.execute({
      partyId,
      body: {
        type: 'resolveReward',
        rewardId: party.pendingRewards[0].id,
        choice: 'leave',
      },
    })
    expect(left.isRight()).toBe(true)
    expect(rewardState(party)).toMatchObject({
      actionPoints: initialPoints - 1,
      pendingRewards: [],
      rewardDecks: [{ zoneType: 'urban', cards: [POTION.id, FISH.id] }],
    })
    expect(party.members[0].player.lastScavenge).toEqual({
      cardId: FISH.id,
      found: true,
      delivery: 'left',
    })
  })

  it.each([true, false])(
    'REQ-115: inventário cheio com pilha compatível, cópia no deck %s',
    async (found) => {
      const inventory = [
        { cardId: ROD.id, quantity: 1 },
        { cardId: FISH.id, quantity: 1 },
        ...Array.from({ length: 8 }, () => ({
          cardId: POTION.id,
          quantity: 1,
        })),
      ]
      const partyId = await seed(
        { inventory },
        'inSession',
        found ? [FISH.id] : []
      )
      const result = await sut.execute({
        partyId,
        body: { type: 'scavenge', cardId: FISH.id },
      })
      expect(result.isRight()).toBe(true)
      if (result.isLeft()) return
      const { party } = result.value
      expect(rewardState(party)).toMatchObject({
        pendingRewards: [],
        actionPoints: GAME_CONFIG_DEFAULTS.actionPointsPerTurn - 1,
        rewardDecks: [{ zoneType: 'urban', cards: [] }],
      })
      expect(party.members[0].player).toMatchObject({
        inventory: [
          inventory[0],
          { cardId: FISH.id, quantity: found ? 2 : 1 },
          ...inventory.slice(2),
        ],
        lastScavenge: {
          cardId: FISH.id,
          found,
          delivery: found ? 'inventory' : 'none',
        },
      })
    }
  )
})
