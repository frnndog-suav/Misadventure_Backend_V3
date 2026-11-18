import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
  PartyMember,
  type TPlayerState,
} from '../../../enterprise/entities/party-member'
import {
  makeAttributeCard,
  makeClassDefinition,
  makeItemCard,
  makeUrbanZoneCard,
  makeZoneCard,
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
const P = makeItemCard({ id: 'fixture.healing-potion' })
const S = makeAttributeCard({ id: 'fixture.strength-basic' })
const E = makeAttributeCard({
  id: 'fixture.endurance-basic',
  attributes: ['endurance'],
})
const HARBOR = makeUrbanZoneCard()
const MINE = makeZoneCard({
  id: 'fixture.old-mine',
  zoneType: 'underground',
  zoneActions: ['startEvent', 'scavenge'],
})

let repository: InMemoryPartiesRepository
let sut: TakePartyActionUseCase

async function seed(
  player: Partial<TPlayerState>,
  status: 'idle' | 'inSession' = 'inSession'
) {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human', player: makePlayerState(player) },
    new UniqueEntityID('member-1')
  )
  const party = makeParty({ status, members: [host], hostMemberId: host.id })
  await repository.create(party)
  return party.id.toString()
}

describe('TakePartyActionUseCase — useVault', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    const catalog = new InMemoryCardCatalog()
    catalog.cards = [P, S, E, HARBOR, MINE]
    catalog.classes = [
      makeClassDefinition({
        starterDeck: [
          { cardId: S.id, copies: 30 },
          { cardId: E.id, copies: 30 },
        ],
      }),
    ]
    sut = new TakePartyActionUseCase(repository, fixedClock(NOW), catalog)
  })

  it('REQ-84: lê as cartas e a zona no catálogo, aplica, grava e devolve o Party', async () => {
    const partyId = await seed({
      inventory: [{ cardId: P.id, quantity: 3 }],
      gold: 100,
    })
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [
          { operation: 'store', cardId: P.id, quantity: 2 },
          { operation: 'storeGold', amount: 60 },
          { operation: 'discard', cardId: P.id, quantity: 1 },
        ],
      },
    })

    expect(result.isRight()).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.vault).toEqual({
      slots: [{ cardId: P.id, quantity: 1 }],
      decks: [],
      gold: 60,
    })
    expect(stored?.members[0].player.inventory).toEqual([
      { cardId: P.id, quantity: 1 },
    ])
    expect(stored?.turn.actionPoints).toBe(2)
  })

  it('REQ-87: editBuild lê as cartas de atributo e as classes (trava e modificadores)', async () => {
    const partyId = await seed({
      vault: { slots: [{ cardId: S.id, quantity: 2 }], decks: [], gold: 0 },
    })

    const result = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [
          {
            operation: 'editBuild',
            build: [
              { cardId: E.id, copies: 30 },
              { cardId: S.id, copies: 32 },
            ],
          },
        ],
      },
    })

    expect(result.isRight()).toBe(true)
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.build).toEqual([
      { cardId: E.id, copies: 30 },
      { cardId: S.id, copies: 32 },
    ])
    expect(stored?.members[0].player.vault.slots).toEqual([])
    expect(stored?.members[0].player.hand).toHaveLength(7)
  })

  it('REQ-88: forma → ACTION_INVALID com os campos das operações; nada gravado', async () => {
    const save = vi.spyOn(repository, 'save')
    const partyId = await seed({})

    const result = await sut.execute({
      partyId,
      body: { type: 'useVault', operations: [] },
    })

    expect(result.value).toBeInstanceOf(ActionInvalidError)
    expect((result.value as ActionInvalidError).details).toEqual({
      fields: [{ field: 'operations', reason: 'invalidLength' }],
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('REQ-88: idle → PARTY_SESSION_NOT_ACTIVE', async () => {
    const partyId = await seed({}, 'idle')

    const result = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [{ operation: 'takeGold', amount: 1 }],
      },
    })

    expect(result.value).toBeInstanceOf(PartySessionNotActiveError)
  })

  it('REQ-88: zona sem useVault → ACTION_NOT_ALLOWED zoneActionUnavailable', async () => {
    const partyId = await seed({ zoneId: MINE.id })

    const result = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [{ operation: 'takeGold', amount: 1 }],
      },
    })

    expect(result.value).toBeInstanceOf(ActionNotAllowedError)
    expect((result.value as ActionNotAllowedError).details).toEqual({
      reason: 'zoneActionUnavailable',
    })
  })

  it('REQ-88: zona que o catálogo não devolve → zoneActionUnavailable', async () => {
    const partyId = await seed({ zoneId: 'fixture.ghost-zone' })

    const result = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [{ operation: 'takeGold', amount: 1 }],
      },
    })

    expect((result.value as ActionNotAllowedError).details).toEqual({
      reason: 'zoneActionUnavailable',
    })
  })

  it('REQ-88: sem pontos → noActionPoints (sem operationIndex)', async () => {
    const partyId = await seed({})
    const party = await repository.findById(partyId)
    if (!party) throw new Error('grupo não semeado')
    party.move('fixture.old-mine', party.savedAt)
    party.move('fixture.gray-harbor', party.savedAt)
    party.move('fixture.old-mine', party.savedAt)
    await repository.save(party)
    // 0 pontos na mina (sem cofre): os pontos são conferidos antes da zona
    const result = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [{ operation: 'takeGold', amount: 1 }],
      },
    })

    expect((result.value as ActionNotAllowedError).details).toEqual({
      reason: 'noActionPoints',
    })
  })

  it('REQ-88: operação recusada → ACTION_NOT_ALLOWED com operationIndex (e cardId em notOwned); nada gravado', async () => {
    const save = vi.spyOn(repository, 'save')
    const partyId = await seed({
      gold: 40,
      vault: { slots: [], decks: [], gold: 60 },
    })

    const notInVault = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [
          { operation: 'takeGold', amount: 10 },
          { operation: 'take', cardId: P.id, quantity: 5 },
        ],
      },
    })
    expect((notInVault.value as ActionNotAllowedError).details).toEqual({
      reason: 'notInVault',
      operationIndex: 1,
    })

    const notOwned = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [
          {
            operation: 'editBuild',
            build: [{ cardId: E.id, copies: 61 }],
          },
        ],
      },
    })
    expect((notOwned.value as ActionNotAllowedError).details).toEqual({
      reason: 'notOwned',
      cardId: E.id,
      operationIndex: 0,
    })
    expect(save).not.toHaveBeenCalled()
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.gold).toBe(40)
  })
})
