import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  makeAttributeCard,
  makeItemCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'

import { LabGrantInvalidError } from '../_errors/lab-grant-invalid-error'
import { LabGrantNoSpaceError } from '../_errors/lab-grant-no-space-error'
import { MemberNotFoundError } from '../_errors/member-not-found-error'
import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { GrantToMemberUseCase } from '.'

const NOW = '2026-11-17T12:00:00.000Z'
const P = makeItemCard({ id: 'fixture.healing-potion' })
const K = makeItemCard({ id: 'fixture.pickaxe', itemCategory: 'tool' })
const S = makeAttributeCard({ id: 'fixture.strength-basic' })
const Z = makeZoneCard({ id: 'fixture.gray-harbor' })

let repository: InMemoryPartiesRepository
let sut: GrantToMemberUseCase
const memberId = 'member-1'

async function seed() {
  const party = makeParty()
  await repository.create(party)
  return party.id.toString()
}

describe('GrantToMemberUseCase (REQ-76, REQ-77)', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    const catalog = new InMemoryCardCatalog()
    catalog.cards = [P, K, S, Z]
    sut = new GrantToMemberUseCase(repository, fixedClock(NOW), catalog)
  })

  it('REQ-77: carta item → inventário; grava com savedAt do Clock e devolve o Party', async () => {
    const partyId = await seed()

    const result = await sut.execute({
      partyId,
      memberId,
      body: { type: 'card', cardId: P.id, quantity: 2 },
    })

    expect(result.isRight()).toBe(true)
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.inventory).toEqual([
      { cardId: P.id, quantity: 2 },
    ])
    expect(stored?.savedAt.toISOString()).toBe(NOW)
  })

  it('REQ-77: carta de atributo → pasta', async () => {
    const partyId = await seed()

    await sut.execute({
      partyId,
      memberId,
      body: { type: 'card', cardId: S.id, quantity: 2 },
    })

    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.tcgFolder).toEqual([
      { cardId: S.id, copies: 2 },
    ])
  })

  it('REQ-76: ouro acima da bolsa → gold = 300', async () => {
    const partyId = await seed()

    await sut.execute({
      partyId,
      memberId,
      body: { type: 'gold', amount: 295 },
    })

    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.gold).toBe(300)
  })

  describe('recusas, na ordem do contrato, sem gravar', () => {
    it('REQ-77: grupo inexistente → PARTY_NOT_FOUND (antes do corpo)', async () => {
      const result = await sut.execute({
        partyId: 'nope',
        memberId,
        body: null,
      })
      expect(result.value).toBeInstanceOf(PartyNotFoundError)
    })

    it('REQ-77: membro inexistente → MEMBER_NOT_FOUND (antes do corpo)', async () => {
      const partyId = await seed()
      const result = await sut.execute({
        partyId,
        memberId: 'member-9',
        body: null,
      })
      expect(result.value).toBeInstanceOf(MemberNotFoundError)
    })

    it('REQ-77: corpo malformado → LAB_GRANT_INVALID com fields', async () => {
      const partyId = await seed()
      const result = await sut.execute({
        partyId,
        memberId,
        body: { type: 'gold', amount: 0 },
      })
      expect(result.value).toBeInstanceOf(LabGrantInvalidError)
      expect((result.value as LabGrantInvalidError).details).toEqual({
        fields: [{ field: 'amount', reason: 'notPositiveInteger' }],
      })
    })

    it('REQ-77: carta inexistente ou não publicada → CARD_NOT_FOUND', async () => {
      const partyId = await seed()
      const result = await sut.execute({
        partyId,
        memberId,
        body: { type: 'card', cardId: 'fixture.nope', quantity: 1 },
      })
      expect(result.value).toBeInstanceOf(CardNotFoundError)
    })

    it('REQ-77: carta que não se doa → LAB_GRANT_INVALID notGrantable em cardId', async () => {
      const partyId = await seed()
      const result = await sut.execute({
        partyId,
        memberId,
        body: { type: 'card', cardId: Z.id, quantity: 1 },
      })
      expect((result.value as LabGrantInvalidError).details).toEqual({
        fields: [{ field: 'cardId', reason: 'notGrantable' }],
      })
    })

    it('REQ-77: sem espaço → LAB_GRANT_NO_SPACE com reason; nada gravado', async () => {
      const partyId = await seed()
      const save = vi.spyOn(repository, 'save')

      const result = await sut.execute({
        partyId,
        memberId,
        body: { type: 'card', cardId: K.id, quantity: 11 },
      })

      expect(result.value).toBeInstanceOf(LabGrantNoSpaceError)
      expect((result.value as LabGrantNoSpaceError).details).toEqual({
        reason: 'inventoryFull',
      })
      expect(save).not.toHaveBeenCalled()
    })
  })
})
