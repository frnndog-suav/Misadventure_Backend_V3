import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
  PartyMember,
  type TPlayerState,
} from '@/domain/campaign/enterprise/entities/party-member'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import type { TEffect } from '@/domain/catalog/enterprise/value-objects/effect'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeAttributeCard,
  makeEquipmentCard,
  makeItemCard,
  makeMountCard,
  makeWarPonyCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'

// T-75: estado da montaria (REQ-157), perder a montaria (REQ-163); D-146, D-148, D-150.

const NOW = fixedClock('2026-11-25T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-25T13:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')

const PONY = makeWarPonyCard()
const HORSE = makeMountCard()
const POTION = makeItemCard({ id: 'fixture.healing-potion' })
const ORE = makeItemCard({ id: 'fixture.iron-ore', itemCategory: 'material' })
const SWORD = makeEquipmentCard({ id: 'fixture.short-sword' })
const STRENGTH = makeAttributeCard({ id: 'fixture.strength-basic' })
const DEXTERITY = makeAttributeCard({
  id: 'fixture.dexterity-basic',
  attributes: ['dexterity'],
})

const loseMountEffect = {
  text: 'Perca a montaria.',
  trigger: null,
  cost: [{ kind: 'consumeSelf' }],
  // Ativação nova da T-75 (CONTRATO FEAT-18 `{ kind: 'loseMount' }`).
  activation: [{ kind: 'loseMount' }],
  duration: { kind: 'immediate' },
  mark: null,
} as unknown as TEffect
const SCROLL = makeItemCard({
  id: 'fixture.lose-mount-scroll',
  itemCategory: 'consumable',
  effects: [loseMountEffect],
})

const CARDS: readonly TCard[] = [
  PONY,
  HORSE,
  POTION,
  ORE,
  SWORD,
  STRENGTH,
  DEXTERITY,
  SCROLL,
]

type TMountOf = { mount?: unknown }

function partyOf(
  player: Partial<TPlayerState> & TMountOf = {},
  status: 'idle' | 'inSession' = 'inSession'
) {
  const host = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState(player as Partial<TPlayerState>),
    },
    MEMBER
  )
  return makeParty({
    status,
    members: [host],
    hostMemberId: host.id,
    turn: { round: 1, memberId: MEMBER, actionPoints: 0 },
    config: { ...GAME_CONFIG_DEFAULTS },
    savedAt: NOW,
  })
}
type TestParty = ReturnType<typeof partyOf>
const playerOf = (party: TestParty) =>
  party.members[0].player as TPlayerState & { mount?: unknown }

const emptyPony = { cardId: PONY.id, inventory: [], tcgFolder: [] }

const activate = (party: TestParty, cardId: string, effectIndex = 0) =>
  party.prepare(
    { operation: 'activate', cardId, effectIndex },
    { cards: CARDS },
    LATER,
    sequentialIds('status')
  )

describe('Party.grant — carta de montaria (REQ-157)', () => {
  it('REQ-157: sem montaria, a carta mount vira a montaria, vazia; LabGrantApplied; sem usar o RNG', () => {
    const party = partyOf({}, 'idle')
    const rngState = party.rngState

    // A doação ainda não aceita `mount` no tipo (T-75); o cast documenta a entrada nova.
    const result = party.grant(
      MEMBER,
      { type: 'card', card: PONY, quantity: 1 } as unknown as Parameters<
        TestParty['grant']
      >[1],
      LATER
    )

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).mount).toEqual(emptyPony)
    expect(playerOf(party).inventory).toEqual([])
    expect(party.savedAt).toEqual(LATER)
    expect(party.rngState).toEqual(rngState)
    expect(party.pullDomainEvents()).toMatchObject([
      {
        type: 'LabGrantApplied',
        memberId: MEMBER,
        grant: { type: 'card', cardId: PONY.id, quantity: 1 },
      },
    ])
  })

  it('REQ-157: com montaria → mountAlreadyOwned, sem mudar nada nem emitir evento', () => {
    const party = partyOf({ mount: emptyPony })
    const before = playerOf(party)

    const result = party.grant(
      MEMBER,
      { type: 'card', card: HORSE, quantity: 1 } as unknown as Parameters<
        TestParty['grant']
      >[1],
      LATER
    )

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBe('mountAlreadyOwned')
    expect(playerOf(party)).toEqual(before)
    expect(party.savedAt).toEqual(NOW)
    expect(party.pullDomainEvents()).toEqual([])
  })

  it.each([
    ['sem montaria', undefined],
    ['com montaria', emptyPony],
  ])(
    'REQ-157/D-150: carta mount com quantity 2 (%s) → mountAlreadyOwned, nada muda',
    (_label, mount) => {
      const party = partyOf({ mount }, 'idle')
      const before = playerOf(party)

      const result = party.grant(
        MEMBER,
        { type: 'card', card: PONY, quantity: 2 },
        LATER
      )

      expect(result.isLeft()).toBe(true)
      expect(result.value).toBe('mountAlreadyOwned')
      expect(playerOf(party)).toEqual(before)
      expect(party.savedAt).toEqual(NOW)
      expect(party.pullDomainEvents()).toEqual([])
    }
  )
})

describe('Preparar: activate com a montaria (REQ-157, D-148)', () => {
  it('REQ-157: o efeito ativável da montaria em uso paga 1 de ouro e cura 2, com o cardId da montaria', () => {
    const party = partyOf({ mount: emptyPony, gold: 10, health: 18 })
    const rngState = party.rngState

    const result = activate(party, PONY.id)

    expect(result.isRight()).toBe(true)
    expect(playerOf(party)).toMatchObject({ gold: 9, health: 20 })
    expect(playerOf(party).mount).toEqual(emptyPony)
    expect(party.rngState).toEqual(rngState)
    expect(party.pullDomainEvents()[0]).toMatchObject({
      type: 'EffectActivated',
      cardId: PONY.id,
      effectIndex: 0,
      memberId: MEMBER,
    })
  })

  it('REQ-157: sem montaria, activate da carta de montaria → notOwned e nada muda', () => {
    const party = partyOf({ gold: 10, health: 18 })
    const before = playerOf(party)

    const result = activate(party, PONY.id)

    expect(result.isLeft()).toBe(true)
    expect(result.value).toEqual({ reason: 'notOwned', cardId: PONY.id })
    expect(playerOf(party)).toEqual(before)
    expect(party.savedAt).toEqual(NOW)
  })

  it('D-150(c): equipamento no inventário extra não é ativável (não está em uso nem no inventário)', () => {
    const AMULET = makeEquipmentCard({
      id: 'fixture.focus-amulet',
      slot: 'accessory',
      effects: [
        {
          text: 'Ganhe ouro.',
          trigger: null,
          cost: [{ kind: 'spendVigor', amount: 1 }],
          activation: [{ kind: 'gainGold', amount: 1 }],
          duration: { kind: 'immediate' },
          mark: null,
        },
      ],
    })
    const party = partyOf({
      mount: {
        cardId: PONY.id,
        inventory: [{ cardId: AMULET.id, quantity: 1 }],
        tcgFolder: [],
      },
    })

    const result = party.prepare(
      { operation: 'activate', cardId: AMULET.id, effectIndex: 0 },
      { cards: [...CARDS, AMULET] },
      LATER,
      sequentialIds('status')
    )

    expect(result.isLeft()).toBe(true)
    expect(result.value).toEqual({ reason: 'notOwned', cardId: AMULET.id })
  })
})

describe('Ativação loseMount (REQ-163, D-150 a)', () => {
  const swordState = {
    refinement: 2,
    enchantments: [],
    repairMarks: 0,
    broken: false,
  }

  it('REQ-163: montaria, inventário extra e pasta extra vão ao limbo, nesta ordem, um SentToLimbo por carta; mount vira null', () => {
    const party = partyOf({
      inventory: [{ cardId: SCROLL.id, quantity: 1 }],
      mount: {
        cardId: PONY.id,
        inventory: [
          { cardId: POTION.id, quantity: 3 },
          { cardId: SWORD.id, quantity: 1, equipmentState: swordState },
          { cardId: ORE.id, quantity: 2 },
        ],
        tcgFolder: [
          { cardId: DEXTERITY.id, copies: 1 },
          { cardId: STRENGTH.id, copies: 4 },
        ],
      },
    })
    const rngState = party.rngState

    const result = activate(party, SCROLL.id)

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).mount).toBeNull()
    expect(playerOf(party).inventory).toEqual([])
    expect(party.rngState).toEqual(rngState)
    const limbo = party
      .pullDomainEvents()
      .filter(
        (event) =>
          event.type === 'SentToLimbo' &&
          ['mount', 'mountInventory', 'mountTcgFolder'].includes(
            (event as { from: string }).from
          )
      )
    expect(limbo).toEqual([
      expect.objectContaining({
        type: 'SentToLimbo',
        memberId: MEMBER,
        cardId: PONY.id,
        quantity: 1,
        from: 'mount',
      }),
      expect.objectContaining({
        cardId: POTION.id,
        quantity: 3,
        from: 'mountInventory',
      }),
      expect.objectContaining({
        cardId: SWORD.id,
        quantity: 1,
        from: 'mountInventory',
      }),
      expect.objectContaining({
        cardId: ORE.id,
        quantity: 2,
        from: 'mountInventory',
      }),
      expect.objectContaining({
        cardId: DEXTERITY.id,
        quantity: 1,
        from: 'mountTcgFolder',
      }),
      expect.objectContaining({
        cardId: STRENGTH.id,
        quantity: 4,
        from: 'mountTcgFolder',
      }),
    ])
  })

  it('REQ-163: montaria vazia → só o SentToLimbo da montaria', () => {
    const party = partyOf({
      inventory: [{ cardId: SCROLL.id, quantity: 1 }],
      mount: emptyPony,
    })

    expect(activate(party, SCROLL.id).isRight()).toBe(true)

    expect(playerOf(party).mount).toBeNull()
    const fromMount = party
      .pullDomainEvents()
      .filter(
        (event) =>
          event.type === 'SentToLimbo' &&
          (event as { from: string }).from.startsWith('mount')
      )
    expect(fromMount).toEqual([
      expect.objectContaining({ cardId: PONY.id, quantity: 1, from: 'mount' }),
    ])
  })

  it('REQ-163: sem montaria, a ativação é aceita e não acontece nada além do custo', () => {
    const party = partyOf({ inventory: [{ cardId: SCROLL.id, quantity: 1 }] })

    expect(activate(party, SCROLL.id).isRight()).toBe(true)

    expect(playerOf(party).mount ?? null).toBeNull()
    const events = party.pullDomainEvents()
    expect(
      events.filter(
        (event) =>
          event.type === 'SentToLimbo' &&
          (event as { from: string }).from.startsWith('mount')
      )
    ).toEqual([])
    // O próprio pergaminho foi consumido (consumeSelf).
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'SentToLimbo',
        cardId: SCROLL.id,
        from: 'inventory',
      })
    )
  })
})
