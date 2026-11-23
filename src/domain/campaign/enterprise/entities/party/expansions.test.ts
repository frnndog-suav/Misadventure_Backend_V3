import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeAttributeCard,
  makeItemCard,
  makeUrbanZoneCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'

import { noExpansions } from '../../markets'
import type { TMarketOperation, TVaultOperation } from '../../party-action'
import { PartyMember, type TPlayerState } from '../party-member'
import type { Party } from '.'

// REQ-143 / D-120 (T-64): as capacidades efetivas do jogador (snapshot +
// expansões) valem em todas as regras que as usam.

const NOW = fixedClock('2026-11-23T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-23T13:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')

const P = makeItemCard({ id: 'fixture.healing-potion' })
const S = makeAttributeCard({ id: 'fixture.strength-basic' })
const E = makeAttributeCard({ id: 'fixture.endurance-basic' })
const CARDS: TCard[] = [P, S, E]

const HARBOR = makeUrbanZoneCard({
  zoneActions: ['useVault', 'visitMarket'],
  market: { stock: [], singles: false },
})

const expanded = (patch: Partial<ReturnType<typeof noExpansions>>) => ({
  ...noExpansions(),
  ...patch,
})

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

const vault = (party: Party, operations: TVaultOperation[]) =>
  party.useVault(
    operations,
    { cards: CARDS, classes: [], zoneActions: ['useVault'] },
    LATER
  )

const market = (party: Party, operations: TMarketOperation[]) =>
  party.visitMarket(
    operations,
    { zone: HARBOR, cards: CARDS, collectionId: 'fixture' },
    LATER
  )

describe('Party.visitMarket — buyExpansion (REQ-143)', () => {
  it('REQ-143: compra de bolsa e cofre no mesmo lote: gasta 1 PA, grava as contagens, lastMarketVisit e o evento', () => {
    const party = partyOf({ gold: 300 })
    const points = party.turn.actionPoints

    const result = market(party, [
      { operation: 'buyExpansion', expansion: 'purse' },
      { operation: 'buyExpansion', expansion: 'vaultSlots' },
    ])

    expect(result.isRight()).toBe(true)
    expect(party.turn.actionPoints).toBe(points - 1)
    expect(playerOf(party).gold).toBe(100)
    expect(playerOf(party).expansions).toEqual(
      expanded({ purse: 1, vaultSlots: 1 })
    )
    const visit = {
      zoneId: HARBOR.id,
      goldLost: 0,
      results: [
        {
          operation: 'buyExpansion',
          expansion: 'purse',
          capacity: 600,
          gold: -150,
        },
        {
          operation: 'buyExpansion',
          expansion: 'vaultSlots',
          capacity: 35,
          gold: -50,
        },
      ],
    }
    expect(playerOf(party).lastMarketVisit).toEqual(visit)
    expect(party.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: 'MarketVisited',
        results: visit.results,
        goldLost: 0,
      }),
    ])
  })

  it('REQ-143: a 1ª expansão do ouro do cofre com a bolsa padrão → notEnoughGold, nada muda', () => {
    const party = partyOf({ gold: 300 })
    const points = party.turn.actionPoints

    const result = market(party, [
      { operation: 'buyExpansion', expansion: 'vaultGold' },
    ])

    expect(result.isLeft() && result.value).toEqual({
      reason: 'notEnoughGold',
      operationIndex: 0,
    })
    expect(party.turn.actionPoints).toBe(points)
    expect(playerOf(party).gold).toBe(300)
    expect(playerOf(party).expansions).toEqual(noExpansions())
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-143: a expansão é do jogador que comprou e persiste na vez seguinte (o inventário não muda)', () => {
    const party = partyOf({
      gold: 100,
      inventory: [{ cardId: P.id, quantity: 2 }],
    })

    market(party, [{ operation: 'buyExpansion', expansion: 'vaultSlots' }])
    party.endTurn(LATER)

    expect(playerOf(party).expansions?.vaultSlots).toBe(1)
    expect(playerOf(party).inventory).toEqual([{ cardId: P.id, quantity: 2 }])
  })
})

describe('capacidades efetivas (REQ-143; D-120)', () => {
  it('REQ-143: cofre — slot novo além de 30 só com vaultSlots (35)', () => {
    const slots = Array.from({ length: 30 }, (_, i) => ({
      cardId: `fixture.slot-${i}`,
      quantity: 1,
    }))
    const base = { inventory: [{ cardId: P.id, quantity: 1 }] }
    const store: TVaultOperation[] = [
      { operation: 'store', cardId: P.id, quantity: 1 },
    ]

    const full = vault(
      partyOf({ ...base, vault: { slots, decks: [], gold: 0 } }),
      store
    )
    const bigger = vault(
      partyOf({
        ...base,
        vault: { slots, decks: [], gold: 0 },
        expansions: expanded({ vaultSlots: 1 }),
      }),
      store
    )

    expect(full.isLeft() && full.value).toEqual({
      reason: 'vaultFull',
      operationIndex: 0,
    })
    expect(bigger.isRight()).toBe(true)
  })

  it('REQ-143: ouro do cofre — 2.000 → 4.000 com vaultGold; bolsa — takeGold acima de 300 com purse', () => {
    const rich = partyOf({
      gold: 300,
      vault: { slots: [], decks: [], gold: 2000 },
      expansions: expanded({ vaultGold: 1 }),
    })
    expect(
      vault(rich, [{ operation: 'storeGold', amount: 300 }]).isRight()
    ).toBe(true)
    expect(playerOf(rich).vault.gold).toBe(2300)

    const wide = partyOf({
      gold: 300,
      vault: { slots: [], decks: [], gold: 100 },
      expansions: expanded({ purse: 1 }),
    })
    expect(
      vault(wide, [{ operation: 'takeGold', amount: 100 }]).isRight()
    ).toBe(true)
    expect(playerOf(wide).gold).toBe(400)
  })

  it('REQ-143: pasta — take de atributo além de 30 só com tcgFolder (40)', () => {
    const base = {
      tcgFolder: [{ cardId: E.id, copies: 30 }],
      vault: { slots: [{ cardId: S.id, quantity: 1 }], decks: [], gold: 0 },
    }
    const take: TVaultOperation[] = [
      { operation: 'take', cardId: S.id, quantity: 1 },
    ]

    const full = vault(partyOf(base), take)
    const bigger = vault(
      partyOf({ ...base, expansions: expanded({ tcgFolder: 1 }) }),
      take
    )

    expect(full.isLeft() && full.value).toEqual({
      reason: 'tcgFolderFull',
      operationIndex: 0,
    })
    expect(bigger.isRight()).toBe(true)
  })

  it('REQ-143: decks do cofre — saveDeck além de 10 slots só com deckSlots (11)', () => {
    const decks = Array.from({ length: 9 }, () => [{ cardId: E.id, copies: 1 }])
    const base = {
      vault: { slots: [{ cardId: S.id, quantity: 1 }], decks, gold: 0 },
    }
    const save: TVaultOperation[] = [
      { operation: 'saveDeck', cards: [{ cardId: S.id, copies: 1 }] },
    ]

    const full = vault(partyOf(base), save)
    const bigger = vault(
      partyOf({ ...base, expansions: expanded({ deckSlots: 1 }) }),
      save
    )

    expect(full.isLeft() && full.value).toEqual({
      reason: 'deckSlotsFull',
      operationIndex: 0,
    })
    expect(bigger.isRight()).toBe(true)
  })

  it('REQ-143: doação de ouro do laboratório respeita a bolsa expandida (550 + 100 → 600; perdidos 50)', () => {
    const party = partyOf(
      { gold: 550, expansions: expanded({ purse: 1 }) },
      {},
      'idle'
    )

    party.grant(MEMBER, { type: 'gold', amount: 100 }, LATER)

    expect(playerOf(party).gold).toBe(600)
  })
})
