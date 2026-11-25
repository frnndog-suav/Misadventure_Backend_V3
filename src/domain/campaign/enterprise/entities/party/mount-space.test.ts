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

import type { TMountState } from '../../mount'
import type { TPendingReward } from '../../rewards'
import { PartyMember, type TPlayerState } from '../party-member'
import type { Party } from '.'

// T-77: espaço da montaria (REQ-159; D-144) e transferência (REQ-160; D-143).

const NOW = fixedClock('2026-11-25T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-25T13:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')

const HORSE = 'fixture.plow-horse'
const P = makeItemCard({ id: 'fixture.healing-potion' })
const W = makeEquipmentCard({ id: 'fixture.short-sword', slot: 'weapon' })
const BIG = makeEquipmentCard({
  id: 'fixture.great-axe',
  slot: 'weapon',
  blocksShield: true,
})
const SHIELD = makeEquipmentCard({ id: 'fixture.buckler', slot: 'shield' })
const STR = makeAttributeCard({ id: 'fixture.strength-basic' })
const BO = makeItemCard({
  id: 'fixture.booster',
  itemCategory: 'booster',
  boosterCollectionId: 'fixture',
})
const ATTR = makeAttributeCard({ id: 'fixture.focus', rarity: 'common' })
const CARDS: TCard[] = [P, W, BIG, SHIELD, STR]

const mount = (over: Partial<TMountState> = {}): TMountState => ({
  cardId: HORSE,
  inventory: [],
  tcgFolder: [],
  ...over,
})

function partyOf(
  player: Partial<TPlayerState> = {},
  config: Partial<typeof GAME_CONFIG_DEFAULTS> = {},
  actionPoints = 0,
  pendingReward: TPendingReward | null = null
): Party {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human', player: makePlayerState(player) },
    MEMBER
  )
  return makeParty({
    status: 'inSession',
    members: [host],
    hostMemberId: host.id,
    turn: { round: 1, memberId: MEMBER, actionPoints },
    config: {
      ...GAME_CONFIG_DEFAULTS,
      inventoryCapacity: 1,
      mountInventorySlots: 1,
      ...config,
    },
    savedAt: NOW,
    pendingReward,
  })
}
const playerOf = (party: Party) => party.members[0].player

describe('Doação com montaria (REQ-159)', () => {
  it('REQ-159: inventário cheio → a doação vai ao inventário extra e empilha; sem espaço nos dois → inventoryFull', () => {
    const party = partyOf({
      inventory: [{ cardId: W.id, quantity: 1 }],
      mount: mount(),
    })
    party.grant(MEMBER, { type: 'card', card: P, quantity: 1 }, LATER)
    party.grant(MEMBER, { type: 'card', card: P, quantity: 1 }, LATER)
    expect(playerOf(party).mount?.inventory).toEqual([
      { cardId: P.id, quantity: 2 },
    ])
    expect(
      party.grant(MEMBER, { type: 'card', card: W, quantity: 1 }, LATER).value
    ).toBe('inventoryFull')
  })
})

describe('Party.prepare transferMount (REQ-160; D-143)', () => {
  it('REQ-160: com 0 PA, move a pasta para a pasta extra sem gastar PA', () => {
    const party = partyOf({
      tcgFolder: [{ cardId: STR.id, copies: 1 }],
      mount: mount(),
    })
    const result = party.prepare(
      {
        operation: 'transferMount',
        direction: 'toMount',
        space: 'tcgFolder',
        cardId: STR.id,
        quantity: 1,
      },
      { cards: CARDS },
      LATER
    )
    expect(result.isRight()).toBe(true)
    expect(playerOf(party).tcgFolder).toEqual([])
    expect(playerOf(party).mount?.tcgFolder).toEqual([
      { cardId: STR.id, copies: 1 },
    ])
    expect(party.turn.actionPoints).toBe(0)
    expect(party.savedAt).toEqual(LATER)
  })

  it('REQ-160: recusas sem efeito — noMount, notOwned, inventoryFull', () => {
    const cases: [Partial<TPlayerState>, 'toMount' | 'fromMount', string][] = [
      [
        { mount: null, inventory: [{ cardId: P.id, quantity: 1 }] },
        'toMount',
        'noMount',
      ],
      [{ mount: mount() }, 'toMount', 'notOwned'],
      [
        {
          inventory: [{ cardId: W.id, quantity: 1 }],
          mount: mount({ inventory: [{ cardId: P.id, quantity: 2 }] }),
        },
        'fromMount',
        'inventoryFull',
      ],
    ]
    for (const [player, direction, reason] of cases) {
      const party = partyOf(player)
      const before = playerOf(party)
      const result = party.prepare(
        {
          operation: 'transferMount',
          direction,
          space: 'inventory',
          cardId: P.id,
          quantity: direction === 'fromMount' ? 2 : 1,
        },
        { cards: CARDS },
        LATER
      )
      expect(result.value).toEqual({ reason })
      expect(playerOf(party)).toEqual(before)
      expect(party.savedAt).toEqual(NOW)
    }
  })
})

describe('transferMount — demais recusas (REQ-160; D-152 g)', () => {
  const op = (over: object = {}) => ({
    operation: 'transferMount' as const,
    direction: 'toMount' as const,
    space: 'tcgFolder' as const,
    cardId: STR.id,
    quantity: 1,
    ...over,
  })

  it('REQ-160: pasta extra cheia → tcgFolderFull; inventorySlotIndex com a pasta → notOwned; nada muda e sem eventos', () => {
    const party = partyOf(
      {
        tcgFolder: [{ cardId: STR.id, copies: 1 }],
        mount: mount({ tcgFolder: [{ cardId: ATTR.id, copies: 1 }] }),
      },
      { mountFolderCapacity: 1 }
    )
    const before = playerOf(party)
    expect(party.prepare(op(), { cards: CARDS }, LATER).value).toEqual({
      reason: 'tcgFolderFull',
    })
    expect(
      party.prepare(op({ inventorySlotIndex: 0 }), { cards: CARDS }, LATER)
        .value
    ).toEqual({ reason: 'notOwned' })
    expect(playerOf(party)).toEqual(before)
    expect(party.savedAt).toEqual(NOW)
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-160: com escolha pendente (recompensa) → choicePending', () => {
    const party = partyOf(
      { tcgFolder: [{ cardId: STR.id, copies: 1 }], mount: mount() },
      {},
      0,
      {
        id: 'reward-1',
        memberId: MEMBER.toString(),
        cardId: P.id,
        origin: { type: 'fixed' },
        source: { type: 'scavenge' },
        destination: 'inventory',
        discardOptions: [],
        decisionDeadlineAt: null,
      }
    )
    expect(party.eventActionBlock({ type: 'prepare', ...op() })).toBe(
      'choicePending'
    )
  })
})

describe('Equipar arma que bloqueia escudo (REQ-159; Apêndice B J1)', () => {
  it('REQ-159: a arma antiga ocupa o inventário → o escudo vai ao inventário extra', () => {
    const party = partyOf({
      inventory: [{ cardId: BIG.id, quantity: 1 }],
      equipment: {
        ...makePlayerState().equipment,
        weapon: W.id,
        shield: SHIELD.id,
      },
      mount: mount(),
    })
    const result = party.prepare(
      { operation: 'equip', cardId: BIG.id },
      { cards: CARDS },
      LATER
    )
    expect(result.isRight()).toBe(true)
    expect(playerOf(party).inventory).toEqual([{ cardId: W.id, quantity: 1 }])
    expect(playerOf(party).mount?.inventory).toEqual([
      { cardId: SHIELD.id, quantity: 1 },
    ])
    expect(playerOf(party).equipment.shield).toBeNull()
  })

  it('REQ-159: sem espaço no inventário nem no extra → inventoryFull', () => {
    const withWeapon = partyOf({
      inventory: [{ cardId: BIG.id, quantity: 1 }],
      equipment: {
        ...makePlayerState().equipment,
        weapon: W.id,
        shield: SHIELD.id,
      },
      mount: mount({ inventory: [{ cardId: P.id, quantity: 1 }] }),
    })
    expect(
      withWeapon.prepare(
        { operation: 'equip', cardId: BIG.id },
        { cards: CARDS },
        LATER
      ).value
    ).toEqual({ reason: 'inventoryFull' })
  })
})

describe('Abrir booster com a pasta extra (REQ-159)', () => {
  it('REQ-159: a vaga soma pasta e pasta extra; as cartas que não cabem na pasta vão à pasta extra', () => {
    const party = partyOf(
      {
        inventory: [{ cardId: BO.id, quantity: 1 }],
        tcgFolder: [{ cardId: STR.id, copies: 4 }],
        mount: mount(),
      },
      { tcgFolderCapacity: 8, mountFolderCapacity: 4 }
    )
    const result = party.prepare(
      { operation: 'openBooster', cardId: BO.id },
      { cards: [BO, ATTR] },
      LATER
    )
    expect(result.isRight()).toBe(true)
    const opening = playerOf(party).lastBoosterOpening
    expect(opening?.cards.map(({ destination }) => destination)).toEqual([
      ...Array<string>(4).fill('tcgFolder'),
      ...Array<string>(4).fill('mountTcgFolder'),
    ])
    expect(playerOf(party).mount?.tcgFolder).toEqual([
      { cardId: ATTR.id, copies: 4 },
    ])
  })

  it('REQ-159: sem 8 vagas somadas → tcgFolderFull', () => {
    const party = partyOf(
      {
        inventory: [{ cardId: BO.id, quantity: 1 }],
        tcgFolder: [{ cardId: STR.id, copies: 5 }],
        mount: mount(),
      },
      { tcgFolderCapacity: 8, mountFolderCapacity: 4 }
    )
    expect(
      party.prepare(
        { operation: 'openBooster', cardId: BO.id },
        { cards: [BO, ATTR] },
        LATER
      ).value
    ).toEqual({ reason: 'tcgFolderFull' })
  })
})

describe('Ajustar deck com a pasta extra (REQ-65, REQ-159)', () => {
  it('REQ-159: a build pode usar a pasta extra e o que sai vai à pasta e, cheia, à pasta extra', () => {
    const party = partyOf(
      {
        build: [{ cardId: STR.id, copies: 30 }],
        tcgFolder: [],
        mount: mount({ tcgFolder: [{ cardId: ATTR.id, copies: 2 }] }),
      },
      { tcgFolderCapacity: 1, minDeckSize: 1 },
      1
    )
    const result = party.adjustDeck(
      [
        { cardId: STR.id, copies: 28 },
        { cardId: ATTR.id, copies: 2 },
      ],
      { cards: [STR, ATTR], classes: [] },
      LATER
    )
    expect(result.isRight()).toBe(true)
    expect(playerOf(party).tcgFolder).toEqual([{ cardId: STR.id, copies: 1 }])
    expect(playerOf(party).mount?.tcgFolder).toEqual([
      { cardId: STR.id, copies: 1 },
    ])
  })
})

describe('Descarte da recompensa pendente por espaço (REQ-159; D-148)', () => {
  const reward = (over: Partial<TPendingReward> = {}): TPendingReward => ({
    id: 'reward-1',
    memberId: MEMBER.toString(),
    cardId: P.id,
    origin: { type: 'fixed' },
    source: { type: 'scavenge' },
    destination: 'inventory',
    discardOptions: [
      { cardId: W.id, space: 'inventory', maxCopies: 1 },
      { cardId: P.id, space: 'mountInventory', maxCopies: 3 },
    ],
    decisionDeadlineAt: null,
    ...over,
  })
  const held = {
    inventory: [{ cardId: W.id, quantity: 1 }],
    mount: mount({ inventory: [{ cardId: P.id, quantity: 3 }] }),
  }

  it('REQ-159: descartar do inventário extra libera a vaga e a recompensa fica lá', () => {
    const party = partyOf(held, {}, 1, reward())
    const cards = new Map(CARDS.map((card) => [card.id, card]))
    const result = party.resolveReward(
      {
        type: 'resolveReward',
        rewardId: 'reward-1',
        choice: 'keep',
        discard: [{ cardId: P.id, space: 'mountInventory', copies: 3 }],
      },
      cards,
      LATER,
      undefined
    )
    expect(result.isRight()).toBe(true)
    expect(playerOf(party).inventory).toEqual([{ cardId: W.id, quantity: 1 }])
    expect(playerOf(party).mount?.inventory).toEqual([
      { cardId: P.id, quantity: 1 },
    ])
    expect(playerOf(party).lastRewardDelivery?.space).toBe('mountInventory')
    expect(playerOf(party).lastScavenge?.delivery).toBe('mountInventory')
    const limbo = party
      .pullDomainEvents()
      .filter((event) => event.type === 'SentToLimbo')
    expect(limbo).toMatchObject([
      { cardId: P.id, quantity: 3, from: 'mountInventory' },
    ])
  })

  it('REQ-159: cópias acima do que há naquele espaço → rewardDoesNotFit', () => {
    const party = partyOf(held, {}, 1, reward())
    const cards = new Map(CARDS.map((card) => [card.id, card]))
    expect(
      party.resolveReward(
        {
          type: 'resolveReward',
          rewardId: 'reward-1',
          choice: 'keep',
          discard: [{ cardId: P.id, space: 'inventory', copies: 1 }],
        },
        cards,
        LATER,
        undefined
      ).value
    ).toBe('rewardDoesNotFit')
  })
})
