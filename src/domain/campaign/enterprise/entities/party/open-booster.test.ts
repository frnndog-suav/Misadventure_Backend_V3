import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
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

import { availableActions } from '../../available-actions'
import type { TVaultOperation } from '../../party-action'
import { PartyMember, type TPlayerState } from '../party-member'
import type { Party } from '.'

const NOW = fixedClock('2026-11-23T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-23T13:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')
const POINTS = GAME_CONFIG_DEFAULTS.actionPointsPerTurn

const BO = makeItemCard({
  id: 'fixture.booster',
  itemCategory: 'booster',
  boosterCollectionId: 'fixture',
})
const POTION = makeItemCard({ id: 'fixture.healing-potion' })
const ATTR = makeAttributeCard({ id: 'fixture.focus', rarity: 'common' })
const SWORD = makeEquipmentCard({ id: 'fixture.short-sword', rarity: 'common' })
const OTHER = makeAttributeCard({
  id: 'other.alien',
  collectionId: 'other',
  rarity: 'common',
})

/** Coleção só com atributos: as 8 cartas são a mesma, para o teste não depender do sorteio. */
const ATTRIBUTES_ONLY: TCard[] = [BO, ATTR, OTHER]
/** Coleção só com um equipamento (1 slot por cópia). */
const EQUIPMENT_ONLY: TCard[] = [BO, SWORD, OTHER]
/** Nenhuma elegível publicada. */
const EMPTY: TCard[] = [BO]

const slot = (cardId: string, quantity = 1) => ({ cardId, quantity })
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => slot(`fixture.filler-${i}`))

function partyOf(
  player: Partial<TPlayerState> = {},
  config: Partial<typeof GAME_CONFIG_DEFAULTS> = {},
  status: 'idle' | 'inSession' = 'inSession'
): Party {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human', player: makePlayerState(player) },
    MEMBER
  )
  return makeParty({
    status,
    members: [host],
    hostMemberId: host.id,
    config: { ...GAME_CONFIG_DEFAULTS, ...config },
    savedAt: NOW,
  })
}
const playerOf = (party: Party) => party.members[0].player
const prepare = (party: Party, cards: TCard[], cardId = BO.id) =>
  party.prepare({ operation: 'openBooster', cardId }, { cards }, LATER)
const vault = (
  party: Party,
  cards: TCard[],
  operations: TVaultOperation[] = [{ operation: 'openBooster', cardId: BO.id }]
) =>
  party.useVault(
    operations,
    { cards, classes: [], zoneActions: ['useVault'] },
    LATER
  )

/** Recusado: nada muda (pontos, save, RNG, jogador, entrega) e nenhum evento. */
function expectUntouched(party: Party, before: Party) {
  expect(party.turn.actionPoints).toBe(before.turn.actionPoints)
  expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
  expect(party.rngState).toEqual(before.rngState)
  expect(playerOf(party)).toEqual(playerOf(before))
  expect(party.pendingRewards).toEqual([])
  expect(party.pullDomainEvents()).toEqual([])
}

describe('Party.prepare openBooster (REQ-144)', () => {
  it('REQ-144: atributos vão para a pasta, a embalagem sai do inventário para o limbo, de graça, e grava lastBoosterOpening', () => {
    const party = partyOf({ inventory: [slot(BO.id, 2)] })
    const rngBefore = party.rngState

    const result = prepare(party, ATTRIBUTES_ONLY)

    expect(result.isRight()).toBe(true)
    const player = playerOf(party)
    expect(player.inventory).toEqual([slot(BO.id, 1)])
    expect(player.tcgFolder).toEqual([{ cardId: ATTR.id, copies: 8 }])
    expect(player.lastBoosterOpening).toEqual({
      boosterCardId: BO.id,
      via: 'prepare',
      cards: Array.from({ length: 8 }, () => ({
        cardId: ATTR.id,
        destination: 'tcgFolder',
      })),
    })
    expect(party.turn.actionPoints).toBe(POINTS)
    expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    expect(party.rngState).not.toEqual(rngBefore)
    expect(party.pendingRewards).toEqual([])
    expect(party.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: 'SentToLimbo',
        memberId: MEMBER,
        cardId: BO.id,
        quantity: 1,
        from: 'inventory',
      }),
    ])
  })

  it('REQ-144: recurso vai para o inventário e a embalagem, antes, libera o slot dela', () => {
    const party = partyOf(
      { inventory: [...filler(8), slot(BO.id)] },
      { inventoryCapacity: 10 }
    )

    const result = prepare(party, EQUIPMENT_ONLY)

    expect(result.isRight()).toBe(true)
    // 9 slots − a embalagem = 8; sobram 2 vagas para 8 espadas (1 slot por cópia)
    expect(
      playerOf(party).inventory.filter((s) => s.cardId === SWORD.id)
    ).toHaveLength(2)
    const destinations = playerOf(party).lastBoosterOpening!.cards.map(
      (c) => c.destination
    )
    expect(destinations).toEqual([
      'inventory',
      'inventory',
      ...Array.from({ length: 6 }, () => 'pending'),
    ])
  })

  it('REQ-144, D-128: o que não cabe abre a entrega pendente (fonte booster, origem fixed) e a fila segue uma a uma', () => {
    const party = partyOf(
      { inventory: [...filler(5), slot(BO.id)] },
      { inventoryCapacity: 7 }
    )

    prepare(party, EQUIPMENT_ONLY)

    // sem a embalagem: 5 slots usados, 2 livres → 2 inventário + 6 pendentes
    const [pending] = party.pendingRewards
    expect(pending).toMatchObject({
      memberId: 'member-1',
      cardId: SWORD.id,
      origin: { type: 'fixed' },
      source: { type: 'booster', boosterCardId: BO.id },
      destination: 'inventory',
    })
    expect(party.pullDomainEvents()).toHaveLength(1)

    const cards = new Map(EQUIPMENT_ONLY.map((c) => [c.id, c]))
    for (let left = 6; left >= 1; left--) {
      expect(party.pendingRewards).toHaveLength(1)
      const resolved = party.resolveReward(
        {
          type: 'resolveReward',
          rewardId: party.pendingRewards[0].id,
          choice: 'leave',
        },
        cards,
        LATER,
        undefined
      )
      expect(resolved.isRight()).toBe(true)
    }
    expect(party.pendingRewards).toEqual([])
    expect(playerOf(party).lastRewardDelivery).toMatchObject({
      cardId: SWORD.id,
      origin: { type: 'fixed' },
      disposition: 'sentToLimbo',
    })
    const events = party.pullDomainEvents()
    expect(events.filter((e) => e.type === 'SentToLimbo')).toHaveLength(6)
    expect(
      playerOf(party).inventory.filter((s) => s.cardId === SWORD.id)
    ).toHaveLength(2)
  })

  it('REQ-144: guardar a pendente descartando uma cópia do inventário', () => {
    const party = partyOf(
      { inventory: [...filler(5), slot(BO.id)] },
      { inventoryCapacity: 7 }
    )
    prepare(party, EQUIPMENT_ONLY)
    const cards = new Map(EQUIPMENT_ONLY.map((c) => [c.id, c]))

    const resolved = party.resolveReward(
      {
        type: 'resolveReward',
        rewardId: party.pendingRewards[0].id,
        choice: 'keep',
        discard: [{ cardId: 'fixture.filler-0', copies: 1 }],
      },
      cards,
      LATER,
      undefined
    )

    expect(resolved.isRight()).toBe(true)
    expect(
      playerOf(party).inventory.filter((s) => s.cardId === SWORD.id)
    ).toHaveLength(3)
    expect(playerOf(party).lastRewardDelivery?.disposition).toBe('kept')
    expect(party.pendingRewards).toHaveLength(1)
  })

  it('REQ-144: reabrir booster com entrega pendente aberta → choicePending', () => {
    const party = partyOf(
      { inventory: [...filler(5), slot(BO.id, 2)] },
      { inventoryCapacity: 7 }
    )
    prepare(party, EQUIPMENT_ONLY)

    expect(
      party.eventActionBlock({
        type: 'prepare',
        operation: 'openBooster',
        cardId: BO.id,
      })
    ).toBe('choicePending')
  })

  it('REQ-144: grupo idle → sessionNotActive', () => {
    const party = partyOf({ inventory: [slot(BO.id)] }, {}, 'idle')
    const before = partyOf({ inventory: [slot(BO.id)] }, {}, 'idle')

    const result = prepare(party, ATTRIBUTES_ONLY)

    expect(result.isLeft() && result.value).toBe('sessionNotActive')
    expectUntouched(party, before)
  })

  it.each([
    ['notInInventory', {}, ATTRIBUTES_ONLY, BO.id],
    [
      'notBooster',
      { inventory: [slot(POTION.id)] },
      ATTRIBUTES_ONLY,
      POTION.id,
    ],
    [
      'tcgFolderFull',
      {
        inventory: [slot(BO.id)],
        tcgFolder: [{ cardId: ATTR.id, copies: 23 }],
      },
      ATTRIBUTES_ONLY,
      BO.id,
    ],
    ['boosterEmpty', { inventory: [slot(BO.id)] }, EMPTY, BO.id],
  ] as const)(
    'REQ-144: %s recusa e nada muda',
    (reason, player, cards, cardId) => {
      const party = partyOf({ ...player })
      const before = partyOf({ ...player })

      const result = prepare(party, [...cards], cardId)

      expect(result.isLeft() && result.value).toEqual({ reason })
      expectUntouched(party, before)
    }
  )

  it('REQ-144: tcgFolderFull vem antes de boosterEmpty (ordem do contrato)', () => {
    const party = partyOf({
      inventory: [slot(BO.id)],
      tcgFolder: [{ cardId: ATTR.id, copies: 23 }],
    })

    const result = prepare(party, EMPTY)

    expect(result.isLeft() && result.value).toEqual({
      reason: 'tcgFolderFull',
    })
  })

  it('REQ-143, REQ-144: a pasta efetiva (expansão comprada) conta para as 8 vagas', () => {
    const party = partyOf({
      inventory: [slot(BO.id)],
      tcgFolder: [{ cardId: ATTR.id, copies: 30 }],
      expansions: {
        vaultSlots: 0,
        deckSlots: 0,
        tcgFolder: 1,
        purse: 0,
        vaultGold: 0,
      },
    })

    const result = prepare(party, ATTRIBUTES_ONLY)

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).tcgFolder).toEqual([{ cardId: ATTR.id, copies: 38 }])
  })

  it('REQ-144: availableActions traz prepare com booster no inventário', () => {
    const party = partyOf({ inventory: [slot(BO.id)] })
    const without = partyOf({ inventory: [slot(POTION.id)] })

    expect(
      availableActions(
        party,
        MEMBER,
        new Set(),
        [],
        [],
        [],
        false,
        undefined,
        false,
        null,
        false,
        [],
        new Set([BO.id])
      )
    ).toContain('prepare')
    expect(
      availableActions(without, MEMBER, new Set(), [], [], [], false)
    ).not.toContain('prepare')
  })
})

describe('Party.useVault openBooster (REQ-144)', () => {
  it('REQ-144: as cartas vão para o cofre, a embalagem sai dele para o limbo e gasta 1 PA', () => {
    const party = partyOf({
      vault: { slots: [slot(BO.id)], decks: [], gold: 0 },
    })

    const result = vault(party, ATTRIBUTES_ONLY)

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).vault.slots).toEqual([slot(ATTR.id, 8)])
    expect(playerOf(party).tcgFolder).toEqual([])
    expect(playerOf(party).lastBoosterOpening).toEqual({
      boosterCardId: BO.id,
      via: 'useVault',
      cards: Array.from({ length: 8 }, () => ({
        cardId: ATTR.id,
        destination: 'vault',
      })),
    })
    expect(party.turn.actionPoints).toBe(POINTS - 1)
    const events = party.pullDomainEvents()
    expect(events.map((e) => e.type)).toEqual(['VaultUsed', 'SentToLimbo'])
    expect(events[1]).toMatchObject({
      cardId: BO.id,
      quantity: 1,
      from: 'vault',
    })
  })

  it('REQ-144: store e openBooster no mesmo lote; lastBoosterOpening é o da última abertura', () => {
    const party = partyOf({ inventory: [slot(BO.id, 2)] })

    const result = vault(party, ATTRIBUTES_ONLY, [
      { operation: 'store', cardId: BO.id, quantity: 2 },
      { operation: 'openBooster', cardId: BO.id },
      { operation: 'openBooster', cardId: BO.id },
    ])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).vault.slots).toEqual([slot(ATTR.id, 16)])
    expect(playerOf(party).lastBoosterOpening?.via).toBe('useVault')
    expect(
      party.pullDomainEvents().filter((e) => e.type === 'SentToLimbo')
    ).toHaveLength(2)
  })

  it.each([
    ['notInVault', {}, ATTRIBUTES_ONLY, BO.id],
    [
      'notBooster',
      { vault: { slots: [slot(POTION.id)], decks: [], gold: 0 } },
      ATTRIBUTES_ONLY,
      POTION.id,
    ],
    [
      'vaultFull',
      {
        vault: { slots: [slot(BO.id), ...filler(22)], decks: [], gold: 0 },
      },
      ATTRIBUTES_ONLY,
      BO.id,
    ],
    [
      'boosterEmpty',
      { vault: { slots: [slot(BO.id)], decks: [], gold: 0 } },
      EMPTY,
      BO.id,
    ],
  ] as const)(
    'REQ-144: %s recusa com o índice da operação e nada muda',
    (reason, player, cards, cardId) => {
      const party = partyOf({ ...player })
      const before = partyOf({ ...player })

      const result = vault(
        party,
        [...cards],
        [{ operation: 'openBooster', cardId }]
      )

      expect(result.isLeft() && result.value).toEqual({
        reason,
        operationIndex: 0,
      })
      expectUntouched(party, before)
    }
  )

  it('REQ-144: uma operação recusada depois da abertura desfaz tudo (cartas, RNG, PA)', () => {
    const player = { vault: { slots: [slot(BO.id)], decks: [], gold: 0 } }
    const party = partyOf(player)
    const before = partyOf(player)

    const result = vault(party, ATTRIBUTES_ONLY, [
      { operation: 'openBooster', cardId: BO.id },
      { operation: 'takeGold', amount: 1 },
    ])

    expect(result.isLeft() && result.value).toEqual({
      reason: 'notEnoughVaultGold',
      operationIndex: 1,
    })
    expectUntouched(party, before)
  })
})
