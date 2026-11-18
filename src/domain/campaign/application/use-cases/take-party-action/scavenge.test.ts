import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
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

async function seed(
  player: Partial<TPlayerState> = {},
  status: 'idle' | 'inSession' = 'inSession'
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
    rewardDecks: [{ zoneType: 'urban', cards: [POTION.id, FISH.id] }],
  })
  await repository.create(party)
  return party.id.toString()
}

describe('TakePartyActionUseCase — scavenge', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    catalog = new InMemoryCardCatalog()
    catalog.cards = [ROD, FISH, POTION, HARBOR, DIMENSION]
    sut = new TakePartyActionUseCase(repository, fixedClock(NOW), catalog)
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

  it('REQ-92: inventário cheio → inventoryFull', async () => {
    const partyId = await seed({
      inventory: [
        { cardId: ROD.id, quantity: 1 },
        ...Array.from({ length: 9 }, () => ({ cardId: ROD.id, quantity: 1 })),
      ],
    })
    const result = await sut.execute({
      partyId,
      body: { type: 'scavenge', cardId: FISH.id },
    })
    expect((result.value as ActionNotAllowedError).details).toEqual({
      reason: 'inventoryFull',
    })
  })
})
