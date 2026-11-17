import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
  PartyMember,
  type TPlayerState,
} from '../../../enterprise/entities/party-member'
import {
  makeEquipmentCard,
  makeItemCard,
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

const NOW = '2026-11-17T12:00:00.000Z'
const B = makeEquipmentCard({ id: 'fixture.blade-of-dusk', blocksShield: true })
const W = makeEquipmentCard({ id: 'fixture.short-sword' })
const D = makeEquipmentCard({ id: 'fixture.oak-shield', slot: 'shield' })
const P = makeItemCard({ id: 'fixture.healing-potion' })

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

describe('TakePartyActionUseCase — prepare', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    const catalog = new InMemoryCardCatalog()
    catalog.cards = [B, W, D, P]
    sut = new TakePartyActionUseCase(repository, fixedClock(NOW), catalog)
  })

  it('REQ-72: equip lê a carta no catálogo, grava e devolve o Party', async () => {
    const partyId = await seed({ inventory: [{ cardId: W.id, quantity: 1 }] })
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({
      partyId,
      body: { type: 'prepare', operation: 'equip', cardId: W.id },
    })

    expect(result.isRight()).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.equipment.weapon).toBe(W.id)
    expect(stored?.members[0].player.inventory).toEqual([])
    expect(stored?.turn.actionPoints).toBe(3)
  })

  it('REQ-74 (5.1): lê no catálogo a arma em uso para saber se bloqueia o escudo', async () => {
    const partyId = await seed({
      inventory: [{ cardId: D.id, quantity: 1 }],
      equipment: { ...makePlayerState().equipment, weapon: B.id },
    })

    const result = await sut.execute({
      partyId,
      body: { type: 'prepare', operation: 'equip', cardId: D.id },
    })

    expect(result.value).toBeInstanceOf(ActionNotAllowedError)
    expect((result.value as ActionNotAllowedError).details).toEqual({
      reason: 'shieldBlocked',
    })
  })

  it('REQ-73: unequip grava', async () => {
    const partyId = await seed({
      equipment: { ...makePlayerState().equipment, shield: D.id },
    })

    const result = await sut.execute({
      partyId,
      body: { type: 'prepare', operation: 'unequip', slot: 'shield' },
    })

    expect(result.isRight()).toBe(true)
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.inventory).toEqual([
      { cardId: D.id, quantity: 1 },
    ])
  })

  it('REQ-74: forma → ACTION_INVALID; idle → PARTY_SESSION_NOT_ACTIVE; regra → ACTION_NOT_ALLOWED; nada gravado', async () => {
    const save = vi.spyOn(repository, 'save')
    const idle = await seed({}, 'idle')

    const malformed = await sut.execute({
      partyId: idle,
      body: { type: 'prepare', operation: 'unequip', slot: 'hands' },
    })
    expect(malformed.value).toBeInstanceOf(ActionInvalidError)
    expect((malformed.value as ActionInvalidError).details).toEqual({
      fields: [{ field: 'slot', reason: 'unknownSlot' }],
    })

    const notActive = await sut.execute({
      partyId: idle,
      body: { type: 'prepare', operation: 'unequip', slot: 'head' },
    })
    expect(notActive.value).toBeInstanceOf(PartySessionNotActiveError)

    repository.items = []
    const active = await seed({})
    const empty = await sut.execute({
      partyId: active,
      body: { type: 'prepare', operation: 'unequip', slot: 'head' },
    })
    expect((empty.value as ActionNotAllowedError).details).toEqual({
      reason: 'slotEmpty',
    })
    expect(save).not.toHaveBeenCalled()
  })
})
