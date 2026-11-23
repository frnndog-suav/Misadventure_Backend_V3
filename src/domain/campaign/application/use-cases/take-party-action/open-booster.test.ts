import { beforeEach, describe, expect, it } from 'vitest'

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
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { ActionNotAllowedError } from '../_errors/action-not-allowed-error'
import { TakePartyActionUseCase } from '.'

const NOW = '2026-11-23T12:00:00.000Z'

/** Booster de outra coleção que abre a coleção vigente: o agregado precisa das cartas dela (REQ-144). */
const BO = makeItemCard({
  id: 'other.booster',
  collectionId: 'other',
  itemCategory: 'booster',
  boosterCollectionId: 'fixture',
})
const ATTR = makeAttributeCard({ id: 'fixture.focus', rarity: 'common' })
const SWORD = makeEquipmentCard({ id: 'fixture.short-sword', rarity: 'common' })
const VAULT_CITY = makeUrbanZoneCard({
  zoneActions: ['startEvent', 'useVault'],
})

let repository: InMemoryPartiesRepository

function build(cards: InMemoryCardCatalog['cards'], ids = false) {
  repository = new InMemoryPartiesRepository()
  const catalog = new InMemoryCardCatalog()
  catalog.collections = [
    makeCollection(),
    makeCollection({ id: 'other', name: 'Outra' }),
  ]
  catalog.cards = [
    ...cards,
    VAULT_CITY,
    makeDimensionCard({ id: 'fixture.test-dimension', name: 'Dimensão' }),
  ]
  return new TakePartyActionUseCase(
    repository,
    fixedClock(NOW),
    catalog,
    ids ? sequentialIds('reward') : undefined
  )
}

async function seed(player: Partial<TPlayerState>, inventoryCapacity = 10) {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human', player: makePlayerState(player) },
    new UniqueEntityID('member-1')
  )
  const party = makeParty({
    status: 'inSession',
    members: [host],
    hostMemberId: host.id,
    config: { ...GAME_CONFIG_DEFAULTS, inventoryCapacity },
  })
  await repository.create(party)
  return party.id.toString()
}

const slot = (cardId: string, quantity = 1) => ({ cardId, quantity })

describe('TakePartyActionUseCase — openBooster (REQ-144)', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
  })

  it('REQ-144: prepare/openBooster lê as cartas da coleção do booster no catálogo, aplica e grava', async () => {
    const sut = build([BO, ATTR])
    const partyId = await seed({ inventory: [slot(BO.id)] })

    const result = await sut.execute({
      partyId,
      body: { type: 'prepare', operation: 'openBooster', cardId: BO.id },
    })

    expect(result.isRight()).toBe(true)
    const player = (await repository.findById(partyId))?.members[0].player
    expect(player?.inventory).toEqual([])
    expect(player?.tcgFolder).toEqual([{ cardId: ATTR.id, copies: 8 }])
    expect(player?.lastBoosterOpening?.via).toBe('prepare')
  })

  it('REQ-144: useVault openBooster, no mesmo lote do store, grava as cartas no cofre', async () => {
    const sut = build([BO, ATTR])
    const partyId = await seed({ inventory: [slot(BO.id)] }, 10)

    const result = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [
          { operation: 'store', cardId: BO.id, quantity: 1 },
          { operation: 'openBooster', cardId: BO.id },
        ],
      },
    })

    expect(result.isRight()).toBe(true)
    const player = (await repository.findById(partyId))?.members[0].player
    expect(player?.vault.slots).toEqual([slot(ATTR.id, 8)])
    expect(player?.lastBoosterOpening?.via).toBe('useVault')
  })

  it('REQ-144: coleção sem elegíveis → boosterEmpty (ACTION_NOT_ALLOWED), nada gravado', async () => {
    const sut = build([BO])
    const partyId = await seed({ inventory: [slot(BO.id)] })

    const result = await sut.execute({
      partyId,
      body: { type: 'prepare', operation: 'openBooster', cardId: BO.id },
    })

    expect(result.isLeft() && result.value).toBeInstanceOf(
      ActionNotAllowedError
    )
    expect(result.isLeft() && result.value).toMatchObject({
      details: { reason: 'boosterEmpty' },
    })
    expect(
      (await repository.findById(partyId))?.members[0].player.inventory
    ).toEqual([slot(BO.id)])
  })

  it('REQ-144: useVault recusado leva o índice da operação', async () => {
    const sut = build([BO, ATTR])
    const partyId = await seed({})

    const result = await sut.execute({
      partyId,
      body: {
        type: 'useVault',
        operations: [{ operation: 'openBooster', cardId: BO.id }],
      },
    })

    expect(result.isLeft() && result.value).toMatchObject({
      details: { reason: 'notInVault', operationIndex: 0 },
    })
  })

  it('REQ-144: a entrega pendente do booster segue pelo resolveReward, que lê a fila no catálogo', async () => {
    const sut = build([BO, SWORD], true)
    const partyId = await seed(
      {
        inventory: [
          slot(BO.id),
          ...Array.from({ length: 5 }, (_, i) => slot(`fixture.filler-${i}`)),
        ],
      },
      7
    )
    await sut.execute({
      partyId,
      body: { type: 'prepare', operation: 'openBooster', cardId: BO.id },
    })
    const opened = await repository.findById(partyId)
    const [first] = opened!.pendingRewards
    expect(first.source).toEqual({ type: 'booster', boosterCardId: BO.id })
    expect(opened?.boosterQueue?.remaining).toHaveLength(5)

    const resolved = await sut.execute({
      partyId,
      body: { type: 'resolveReward', rewardId: first.id, choice: 'leave' },
    })

    expect(resolved.isRight()).toBe(true)
    const after = await repository.findById(partyId)
    expect(after?.pendingRewards).toHaveLength(1)
    expect(after?.boosterQueue?.remaining).toHaveLength(4)
  })
})
