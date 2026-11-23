import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  PartyMember,
  type TPlayerState,
} from '../../../enterprise/entities/party-member'
import {
  makeAttributeCard,
  makeCollection,
  makeDimensionCard,
  makeEquipmentCard,
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

const NOW = '2026-11-23T12:00:00.000Z'
const ZONE = 'fixture.gray-harbor'

const P = makeItemCard({ id: 'fixture.healing-potion', stockPrice: 6 })
const BO = makeItemCard({
  id: 'fixture.booster',
  itemCategory: 'booster',
  boosterCollectionId: 'fixture',
})
// Booster de outra coleção que abre a coleção vigente (D-116).
const FOREIGN_BO = makeItemCard({
  id: 'other.booster',
  collectionId: 'other',
  itemCategory: 'booster',
  boosterCollectionId: 'fixture',
})
const W = makeEquipmentCard({
  id: 'fixture.short-sword',
  rarity: 'common',
  priceMultiplier: 1.2,
})
const STR = makeAttributeCard({ id: 'fixture.strength-basic' })
const HARBOR = makeUrbanZoneCard({
  zoneActions: ['startEvent', 'visitMarket'],
  market: { stock: [P.id, 'fixture.unpublished'], singles: true },
})
const MINE = makeZoneCard({ id: 'fixture.old-mine' })

let repository: InMemoryPartiesRepository
let sut: TakePartyActionUseCase

async function seed(
  player: Partial<TPlayerState> = {},
  status: 'idle' | 'inSession' = 'inSession'
) {
  const host = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({ gold: 100, ...player }),
    },
    new UniqueEntityID('member-1')
  )
  const party = makeParty({
    status,
    members: [host],
    hostMemberId: host.id,
    config: { ...GAME_CONFIG_DEFAULTS },
    markets: [
      {
        zoneId: ZONE,
        factorPercent: 100,
        singles: true,
        stock: [{ cardId: W.id, copies: 3 }],
        showcase: [W.id, null],
      },
    ],
    marketPool: [{ cardId: W.id, departed: 0 }],
  })
  await repository.create(party)
  return party.id.toString()
}

const visit = (partyId: string, ...operations: unknown[]) =>
  sut.execute({ partyId, body: { type: 'visitMarket', operations } })

describe('TakePartyActionUseCase — visitMarket (REQ-140)', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    const catalog = new InMemoryCardCatalog()
    catalog.collections = [
      makeCollection(),
      makeCollection({ id: 'other', name: 'Outra' }),
    ]
    catalog.cards = [
      P,
      BO,
      FOREIGN_BO,
      W,
      STR,
      HARBOR,
      MINE,
      makeDimensionCard({
        id: 'fixture.test-dimension',
        name: 'Dimensão de Teste',
      }),
    ]
    sut = new TakePartyActionUseCase(repository, fixedClock(NOW), catalog)
  })

  it('REQ-140/D-124: lê estoque, vitrine e boosters no catálogo, aplica, grava e devolve o Party', async () => {
    const partyId = await seed()
    const save = vi.spyOn(repository, 'save')

    const result = await visit(
      partyId,
      { operation: 'buyStock', cardId: P.id, quantity: 2 },
      { operation: 'buyBooster', cardId: FOREIGN_BO.id, quantity: 1 },
      { operation: 'buySingle', slotIndex: 0 }
    )

    expect(result.isRight()).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    const stored = await repository.findById(partyId)
    const player = stored?.members[0].player
    expect(player?.gold).toBe(100 - 12 - 30 - 6)
    expect(player?.inventory).toEqual([
      { cardId: P.id, quantity: 2 },
      { cardId: FOREIGN_BO.id, quantity: 1 },
      { cardId: W.id, quantity: 1 },
    ])
    expect(stored?.turn.actionPoints).toBe(
      GAME_CONFIG_DEFAULTS.actionPointsPerTurn - 1
    )
    expect(player?.lastMarketVisit?.results).toHaveLength(3)
  })

  it('D-124: item do estoque da zona que o catálogo não tem → notInMarketStock', async () => {
    const partyId = await seed()

    const result = await visit(partyId, {
      operation: 'buyStock',
      cardId: 'fixture.unpublished',
      quantity: 1,
    })

    expect(result.isLeft() && result.value).toBeInstanceOf(
      ActionNotAllowedError
    )
    expect(result.isLeft() && result.value).toMatchObject({
      details: {
        reason: 'notInMarketStock',
        cardId: 'fixture.unpublished',
        operationIndex: 0,
      },
    })
  })

  it('REQ-140: recusa traz motivo, carta e índice; nada é gravado', async () => {
    const partyId = await seed({ gold: 35 })
    const save = vi.spyOn(repository, 'save')

    const result = await visit(
      partyId,
      { operation: 'buyBooster', cardId: BO.id, quantity: 1 },
      { operation: 'buyStock', cardId: P.id, quantity: 2 }
    )

    expect(result.isLeft() && result.value).toMatchObject({
      code: 'ACTION_NOT_ALLOWED',
      details: { reason: 'notEnoughGold', cardId: P.id, operationIndex: 1 },
    })
    expect(save).not.toHaveBeenCalled()
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.gold).toBe(35)
    expect(stored?.turn.actionPoints).toBe(
      GAME_CONFIG_DEFAULTS.actionPointsPerTurn
    )
  })

  it('REQ-140: grupo sem sessão → PartySessionNotActiveError', async () => {
    const partyId = await seed({}, 'idle')

    const result = await visit(partyId, {
      operation: 'buySingle',
      slotIndex: 0,
    })

    expect(result.isLeft() && result.value).toBeInstanceOf(
      PartySessionNotActiveError
    )
  })

  it('REQ-140: corpo malformado → ActionInvalidError; zona sem mercado → zoneActionUnavailable', async () => {
    const partyId = await seed()
    const malformed = await visit(partyId)
    expect(malformed.isLeft() && malformed.value).toBeInstanceOf(
      ActionInvalidError
    )

    const repo2 = new InMemoryPartiesRepository()
    const catalog = new InMemoryCardCatalog()
    catalog.cards = [makeUrbanZoneCard(), STR]
    const noMarket = new TakePartyActionUseCase(repo2, fixedClock(NOW), catalog)
    const party = makeParty({ status: 'inSession' })
    await repo2.create(party)

    const result = await noMarket.execute({
      partyId: party.id.toString(),
      body: {
        type: 'visitMarket',
        operations: [{ operation: 'buySingle', slotIndex: 0 }],
      },
    })

    expect(result.isLeft() && result.value).toMatchObject({
      details: { reason: 'zoneActionUnavailable' },
    })
  })
})
