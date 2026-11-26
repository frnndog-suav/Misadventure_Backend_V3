import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeAttributeCard,
  makeEquipmentCard,
  makeItemCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'

import { PartyMember, type TPlayerState } from '../party-member'

const NOW = fixedClock('2026-11-17T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-17T13:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')

const P = makeItemCard({ id: 'fixture.healing-potion' })
const K = makeItemCard({ id: 'fixture.pickaxe', itemCategory: 'tool' })
const B = makeEquipmentCard({ id: 'fixture.blade-of-dusk' })
const S = makeAttributeCard({ id: 'fixture.strength-basic' })
const A = makeAttributeCard({ id: 'fixture.agility-basic' })

function partyOf(
  player: Partial<TPlayerState> = {},
  status: 'idle' | 'inSession' = 'idle'
) {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human', player: makePlayerState(player) },
    MEMBER
  )
  return makeParty({
    status,
    members: [host],
    hostMemberId: host.id,
    config: { ...GAME_CONFIG_DEFAULTS },
    savedAt: NOW,
  })
}
const playerOf = (party: ReturnType<typeof partyOf>) => party.members[0].player

describe('Party.grant (REQ-76, REQ-77)', () => {
  it('REQ-166: acumula doações em ordem de ID com inventário cheio', () => {
    const inventory = Array.from(
      { length: GAME_CONFIG_DEFAULTS.inventoryCapacity },
      () => ({ cardId: K.id, quantity: 1 })
    )
    const party = partyOf({ inventory })
    const shard = { ...K, id: 'fixture.shard', completionItem: true }
    const fragment = { ...K, id: 'fixture.fragment', completionItem: true }

    for (const [card, quantity] of [
      [shard, 2],
      [fragment, 1],
      [shard, 3],
    ] as const) {
      expect(
        party.grant(MEMBER, { type: 'card', card, quantity }, LATER).isRight()
      ).toBe(true)
    }

    expect(playerOf(party)).toMatchObject({
      inventory,
      completionItems: [
        { cardId: fragment.id, quantity: 1 },
        { cardId: shard.id, quantity: 5 },
      ],
    })
  })

  it('REQ-77: item que empilha → soma no mesmo slot; vale com o grupo idle; savedAt; LabGrantApplied', () => {
    const party = partyOf()
    const before = party.rngState

    party.grant(MEMBER, { type: 'card', card: P, quantity: 2 }, LATER)
    const result = party.grant(
      MEMBER,
      { type: 'card', card: P, quantity: 3 },
      LATER
    )

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).inventory).toEqual([{ cardId: P.id, quantity: 5 }])
    expect(party.savedAt).toEqual(LATER)
    expect(party.rngState).toEqual(before)
    expect(party.pullDomainEvents()).toMatchObject([
      {
        type: 'LabGrantApplied',
        memberId: MEMBER,
        grant: { type: 'card', cardId: P.id, quantity: 2 },
      },
      {
        type: 'LabGrantApplied',
        memberId: MEMBER,
        grant: { type: 'card', cardId: P.id, quantity: 3 },
        occurredAt: LATER,
        aggregateId: party.id,
      },
    ])
  })

  it('REQ-77: item que não empilha e equipamento → 1 slot por cópia, no fim', () => {
    const party = partyOf({ inventory: [{ cardId: P.id, quantity: 1 }] })

    party.grant(MEMBER, { type: 'card', card: K, quantity: 2 }, LATER)
    party.grant(MEMBER, { type: 'card', card: B, quantity: 1 }, LATER)

    expect(playerOf(party).inventory).toEqual([
      { cardId: P.id, quantity: 1 },
      { cardId: K.id, quantity: 1 },
      { cardId: K.id, quantity: 1 },
      { cardId: B.id, quantity: 1 },
    ])
  })

  it('REQ-77: atributo → pasta de TCG, soma em copies, ordem de cardId', () => {
    const party = partyOf({ tcgFolder: [{ cardId: S.id, copies: 1 }] })

    party.grant(MEMBER, { type: 'card', card: S, quantity: 2 }, LATER)
    party.grant(MEMBER, { type: 'card', card: A, quantity: 1 }, LATER)

    expect(playerOf(party).tcgFolder).toEqual([
      { cardId: A.id, copies: 1 },
      { cardId: S.id, copies: 3 },
    ])
  })

  it('REQ-77: vale para membro fora da vez e em sessão', () => {
    const party = partyOf({}, 'inSession')

    expect(
      party.grant(MEMBER, { type: 'gold', amount: 1 }, LATER).isRight()
    ).toBe(true)
  })

  it('REQ-76: ouro → gold = min(C, G + A); o excedente é perdido e vem no evento', () => {
    const party = partyOf({ gold: 10 })

    party.grant(MEMBER, { type: 'gold', amount: 295 }, LATER)

    expect(playerOf(party).gold).toBe(300)
    expect(party.pullDomainEvents()).toMatchObject([
      {
        type: 'LabGrantApplied',
        grant: { type: 'gold', amount: 295, received: 290, lost: 5 },
      },
    ])
  })

  it('REQ-76: abaixo da capacidade, nada se perde', () => {
    const party = partyOf({ gold: 10 })

    party.grant(MEMBER, { type: 'gold', amount: 50 }, LATER)

    expect(playerOf(party).gold).toBe(60)
    expect(party.pullDomainEvents()).toMatchObject([
      { grant: { type: 'gold', amount: 50, received: 50, lost: 0 } },
    ])
  })

  describe('recusas sem mudar nada nem emitir evento', () => {
    const refused = (
      player: Partial<TPlayerState>,
      grant: Parameters<ReturnType<typeof partyOf>['grant']>[1],
      memberId = MEMBER
    ) => {
      const party = partyOf(player)
      const before = playerOf(party)
      const result = party.grant(memberId, grant, LATER)
      expect(result.isLeft()).toBe(true)
      expect(playerOf(party)).toEqual(before)
      expect(party.savedAt).toEqual(NOW)
      expect(party.pullDomainEvents()).toEqual([])
      return result.value
    }

    it('REQ-77: membro que não é do grupo → memberNotFound', () => {
      expect(
        refused({}, { type: 'gold', amount: 1 }, new UniqueEntityID('member-9'))
      ).toBe('memberNotFound')
    })

    it('REQ-77: quantidade que não cabe inteira no inventário → inventoryFull', () => {
      const nine = Array.from({ length: 9 }, () => ({
        cardId: K.id,
        quantity: 1,
      }))
      expect(
        refused({ inventory: nine }, { type: 'card', card: K, quantity: 2 })
      ).toBe('inventoryFull')
    })

    it('REQ-77: quantidade que não cabe inteira na pasta → tcgFolderFull', () => {
      expect(
        refused(
          { tcgFolder: [{ cardId: S.id, copies: 29 }] },
          { type: 'card', card: A, quantity: 2 }
        )
      ).toBe('tcgFolderFull')
    })
  })
})

describe('Party.contentInUse (REQ-78)', () => {
  it('REQ-78: inclui as cartas do inventário, dos equipamentos em uso e da pasta', () => {
    const party = partyOf({
      inventory: [{ cardId: P.id, quantity: 1 }],
      equipment: { ...makePlayerState().equipment, weapon: B.id },
      tcgFolder: [{ cardId: A.id, copies: 1 }],
    })

    expect(party.contentInUse().cardIds).toEqual(
      expect.arrayContaining([P.id, B.id, A.id])
    )
  })
})
