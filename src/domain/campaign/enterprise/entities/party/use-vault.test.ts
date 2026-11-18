import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TAttributeCard,
  TCard,
  TZoneAction,
} from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeAttributeCard,
  makeClassDefinition,
  makeEquipmentCard,
  makeItemCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'

import type { TVaultOperation } from '../../party-action'
import { shuffle } from '../../shuffle'
import { PartyMember, type TPlayerState } from '../party-member'
import type { Party } from '.'

const NOW = fixedClock('2026-11-18T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-18T13:00:00.000Z').now()

const S = 'fixture.strength-basic'
const E = 'fixture.endurance-basic'
const D = 'fixture.dexterity-basic'
const Y = 'fixture.warrior-synergy'
const P = 'fixture.healing-potion'
const K = 'fixture.pickaxe'
const B = 'fixture.blade-of-dusk'

const attribute = (id: string, override: Partial<TAttributeCard> = {}) =>
  makeAttributeCard({ id, ...override })
const CARDS: TCard[] = [
  attribute(S),
  attribute(E, { attributes: ['endurance'] }),
  attribute(D, { attributes: ['dexterity'] }),
  attribute(Y, { attributeKind: 'synergy' }),
  makeItemCard({ id: P }),
  makeItemCard({ id: K, itemCategory: 'tool' }),
  makeEquipmentCard({ id: B }),
]
const warrior = makeClassDefinition({
  starterDeck: [
    { cardId: S, copies: 30 },
    { cardId: E, copies: 30 },
  ],
})

const catalog = (zoneActions: readonly TZoneAction[] = ['useVault']) => ({
  cards: CARDS,
  classes: [warrior],
  zoneActions,
})

const DEFAULT_MODIFIERS = {
  attack: 5,
  defense: 3,
  accuracy: 50,
  evasion: 20,
  celerity: 10,
  piercing: 0,
  reflection: 0,
}

const entry = (cardId: string, copies: number) => ({ cardId, copies })
const slot = (cardId: string, quantity: number) => ({ cardId, quantity })

function partyOf(
  player: Partial<TPlayerState> = {},
  config: Partial<typeof GAME_CONFIG_DEFAULTS> = {},
  status: 'idle' | 'inSession' = 'inSession'
): Party {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human', player: makePlayerState(player) },
    new UniqueEntityID('member-1')
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
const MEMBER = new UniqueEntityID('member-1')

const run = (
  party: Party,
  operations: TVaultOperation[],
  zoneActions?: readonly TZoneAction[]
) => party.useVault(operations, catalog(zoneActions), LATER)

/** Recusado: nada muda (pontos, save, RNG, jogador) e nenhum evento. */
function expectUntouched(party: Party, before: Party) {
  expect(party.turn.actionPoints).toBe(before.turn.actionPoints)
  expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
  expect(party.rngState).toEqual(before.rngState)
  expect(playerOf(party)).toEqual(playerOf(before))
  expect(party.pullDomainEvents()).toEqual([])
}

describe('Party.useVault — portas (REQ-84, REQ-88 item 2)', () => {
  it('REQ-88: grupo idle → sessionNotActive, nada muda', () => {
    const party = partyOf({}, {}, 'idle')
    const before = partyOf({}, {}, 'idle')

    const result = run(party, [{ operation: 'takeGold', amount: 1 }])

    expect(result.isLeft() && result.value).toBe('sessionNotActive')
    expectUntouched(party, before)
  })

  it('REQ-88: 0 pontos → noActionPoints; vem antes de zoneActionUnavailable', () => {
    const party = partyOf()
    party.move('fixture.old-mine', NOW)
    party.move('fixture.gray-harbor', NOW)
    party.move('fixture.old-mine', NOW)
    party.pullDomainEvents()

    const result = run(party, [{ operation: 'takeGold', amount: 1 }], [])

    expect(result.isLeft() && result.value).toBe('noActionPoints')
  })

  it('REQ-88: zona sem useVault → zoneActionUnavailable, nada muda', () => {
    const party = partyOf()
    const before = partyOf()

    const result = run(
      party,
      [{ operation: 'takeGold', amount: 1 }],
      ['scavenge']
    )

    expect(result.isLeft() && result.value).toBe('zoneActionUnavailable')
    expectUntouched(party, before)
  })

  it('REQ-88: zona e pontos conferidos antes das operações (zoneActionUnavailable vem antes de notInVault)', () => {
    const party = partyOf()

    const result = run(
      party,
      [{ operation: 'take', cardId: P, quantity: 1 }],
      []
    )

    expect(result.isLeft() && result.value).toBe('zoneActionUnavailable')
  })
})

describe('Party.useVault — guardar e retirar (REQ-85)', () => {
  it('REQ-84: gasta 1 ponto, grava savedAt, registra VaultUsed e não consome o RNG', () => {
    const party = partyOf({ gold: 50 })
    const rng = party.rngState

    const result = run(party, [
      { operation: 'storeGold', amount: 10 },
      { operation: 'takeGold', amount: 5 },
    ])

    expect(result.isRight()).toBe(true)
    expect(party.turn.actionPoints).toBe(2)
    expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    expect(party.rngState).toEqual(rng)
    expect(party.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: 'VaultUsed',
        memberId: MEMBER,
        operationCount: 2,
        occurredAt: LATER,
        aggregateId: party.id,
      }),
    ])
  })

  it('REQ-84: repetível na mesma vez (cada uso gasta 1 ponto)', () => {
    const party = partyOf({ gold: 50 })

    run(party, [{ operation: 'storeGold', amount: 10 }])
    run(party, [{ operation: 'storeGold', amount: 10 }])

    expect(party.turn.actionPoints).toBe(1)
    expect(playerOf(party).vault.gold).toBe(20)
  })

  it('REQ-85: store de atributo sai da pasta (Q cópias) e empilha em vault.slots', () => {
    const party = partyOf({ tcgFolder: [entry(D, 5), entry(Y, 2)] })

    const result = run(party, [
      { operation: 'store', cardId: D, quantity: 3 },
      { operation: 'store', cardId: Y, quantity: 2 },
      { operation: 'store', cardId: D, quantity: 2 },
    ])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).tcgFolder).toEqual([])
    expect(playerOf(party).vault.slots).toEqual([slot(D, 5), slot(Y, 2)])
  })

  it('REQ-85: store de item que empilha sai do slot do inventário; o slot esvazia e sai', () => {
    const party = partyOf({ inventory: [slot(P, 3), slot(B, 1)] })

    run(party, [{ operation: 'store', cardId: P, quantity: 3 }])

    expect(playerOf(party).inventory).toEqual([slot(B, 1)])
    expect(playerOf(party).vault.slots).toEqual([slot(P, 3)])
  })

  it('REQ-85: store de equipamento/ferramenta (1 slot por cópia) tira os primeiros slots de 1 cópia', () => {
    const party = partyOf({
      inventory: [slot(K, 1), slot(P, 2), slot(K, 1), slot(K, 1)],
    })

    run(party, [{ operation: 'store', cardId: K, quantity: 2 }])

    expect(playerOf(party).inventory).toEqual([slot(P, 2), slot(K, 1)])
    expect(playerOf(party).vault.slots).toEqual([slot(K, 2)])
  })

  it('REQ-85: take de atributo volta à pasta em ordem de cardId (REQ-62); o slot do cofre sai se esvaziar', () => {
    const party = partyOf({
      tcgFolder: [entry(S, 1)],
      vault: { slots: [slot(D, 2), slot(E, 4)], decks: [], gold: 0 },
    })

    run(party, [
      { operation: 'take', cardId: E, quantity: 4 },
      { operation: 'take', cardId: D, quantity: 1 },
    ])

    expect(playerOf(party).tcgFolder).toEqual([
      entry(D, 1),
      entry(E, 4),
      entry(S, 1),
    ])
    expect(playerOf(party).vault.slots).toEqual([slot(D, 1)])
  })

  it('REQ-85: take de item empilha no inventário (REQ-70); equipamento abre 1 slot por cópia', () => {
    const party = partyOf({
      inventory: [slot(P, 1)],
      vault: { slots: [slot(P, 2), slot(K, 2)], decks: [], gold: 0 },
    })

    run(party, [
      { operation: 'take', cardId: P, quantity: 2 },
      { operation: 'take', cardId: K, quantity: 2 },
    ])

    expect(playerOf(party).inventory).toEqual([
      slot(P, 3),
      slot(K, 1),
      slot(K, 1),
    ])
    expect(playerOf(party).vault.slots).toEqual([])
  })

  it('REQ-85: store e take da mesma carta no mesmo lote (cada passo sobre o resultado do anterior)', () => {
    const party = partyOf({ inventory: [slot(P, 2)] })

    const result = run(party, [
      { operation: 'store', cardId: P, quantity: 2 },
      { operation: 'take', cardId: P, quantity: 1 },
    ])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).inventory).toEqual([slot(P, 1)])
    expect(playerOf(party).vault.slots).toEqual([slot(P, 1)])
  })

  it('REQ-85: storeGold e takeGold movem o ouro; ex. da spec: bolsa 120, cofre 1.990', () => {
    const party = partyOf(
      { gold: 120, vault: { slots: [], decks: [], gold: 1990 } },
      { purseCapacity: 300 }
    )

    const result = run(party, [{ operation: 'storeGold', amount: 10 }])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).gold).toBe(110)
    expect(playerOf(party).vault.gold).toBe(2000)

    const refused = run(party, [{ operation: 'storeGold', amount: 11 }])
    expect(refused.isLeft() && refused.value).toEqual({
      reason: 'vaultGoldFull',
      operationIndex: 0,
    })

    run(party, [{ operation: 'takeGold', amount: 40 }])
    expect(playerOf(party).gold).toBe(150)
    expect(playerOf(party).vault.gold).toBe(1960)
  })

  it('REQ-85: o ouro não se perde ao mover: acima da bolsa o takeGold é recusado (purseFull)', () => {
    const party = partyOf(
      { gold: 300, vault: { slots: [], decks: [], gold: 60 } },
      { purseCapacity: 300 }
    )
    const before = partyOf(
      { gold: 300, vault: { slots: [], decks: [], gold: 60 } },
      { purseCapacity: 300 }
    )

    const result = run(party, [{ operation: 'takeGold', amount: 1 }])

    expect(result.isLeft() && result.value).toEqual({
      reason: 'purseFull',
      operationIndex: 0,
    })
    expectUntouched(party, before)
  })

  it('REQ-84/REQ-86: cenário do contrato — P×3 e ouro 100: store 2, storeGold 60, discard 1', () => {
    const party = partyOf({ inventory: [slot(P, 3)], gold: 100 })

    const result = run(party, [
      { operation: 'store', cardId: P, quantity: 2 },
      { operation: 'storeGold', amount: 60 },
      { operation: 'discard', cardId: P, quantity: 1 },
    ])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).inventory).toEqual([slot(P, 1)])
    expect(playerOf(party).vault).toEqual({
      slots: [slot(P, 1)],
      decks: [],
      gold: 60,
    })
    expect(playerOf(party).gold).toBe(40)
    expect(party.turn.actionPoints).toBe(2)
  })
})

describe('Party.useVault — limbo (REQ-86)', () => {
  it('REQ-86: discard tira Q de vault.slots e nada volta; SentToLimbo depois do VaultUsed, na ordem das operações', () => {
    const party = partyOf({
      vault: { slots: [slot(P, 3), slot(K, 1)], decks: [], gold: 0 },
    })

    const result = run(party, [
      { operation: 'discard', cardId: P, quantity: 2 },
      { operation: 'discard', cardId: K, quantity: 1 },
    ])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).vault.slots).toEqual([slot(P, 1)])
    expect(playerOf(party).inventory).toEqual([])
    expect(party.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: 'VaultUsed', operationCount: 2 }),
      expect.objectContaining({
        type: 'SentToLimbo',
        memberId: MEMBER,
        cardId: P,
        quantity: 2,
        from: 'vault',
      }),
      expect.objectContaining({
        type: 'SentToLimbo',
        cardId: K,
        quantity: 1,
        from: 'vault',
      }),
    ])
  })
})

describe('Party.useVault — decks e build (REQ-87)', () => {
  it('REQ-87: saveDeck tira as cópias de vault.slots e cria o deck no fim, em ordem de cardId; sem validar', () => {
    const party = partyOf({
      vault: {
        slots: [slot(S, 5), slot(D, 2)],
        decks: [[entry(E, 1)]],
        gold: 0,
      },
    })

    const result = run(party, [
      { operation: 'saveDeck', cards: [entry(S, 3), entry(D, 2)] },
    ])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).vault.slots).toEqual([slot(S, 2)])
    expect(playerOf(party).vault.decks).toEqual([
      [entry(E, 1)],
      [entry(D, 2), entry(S, 3)],
    ])
    expect(party.pullDomainEvents().map((e) => e.type)).toEqual(['VaultUsed'])
  })

  it('REQ-87: unpackDeck devolve as cartas a vault.slots (empilhando) e os decks seguintes sobem', () => {
    const party = partyOf({
      vault: {
        slots: [slot(S, 1)],
        decks: [[entry(D, 2), entry(S, 3)], [entry(E, 1)], [entry(Y, 4)]],
        gold: 0,
      },
    })

    run(party, [{ operation: 'unpackDeck', deckIndex: 0 }])

    expect(playerOf(party).vault.slots).toEqual([slot(S, 4), slot(D, 2)])
    expect(playerOf(party).vault.decks).toEqual([[entry(E, 1)], [entry(Y, 4)]])
  })

  it('REQ-87: swapBuild põe o deck i como build e guarda a build atual no lugar dele; RNG, mão e DeckAdjusted ao fim', () => {
    const party = partyOf({
      vault: {
        slots: [],
        decks: [[entry(D, 20), entry(S, 40)], [entry(E, 1)]],
        gold: 0,
      },
    })
    const rng = SeededRng.fromState(party.rngState)
    const expected = shuffle(
      [
        ...Array.from({ length: 20 }, () => D),
        ...Array.from({ length: 40 }, () => S),
      ],
      rng
    )

    const result = run(party, [{ operation: 'swapBuild', deckIndex: 0 }])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).build).toEqual([entry(D, 20), entry(S, 40)])
    expect(playerOf(party).vault.decks).toEqual([
      [entry(E, 30), entry(S, 30)],
      [entry(E, 1)],
    ])
    expect(playerOf(party).hand).toEqual(expected.slice(0, 7))
    expect(playerOf(party).deck).toEqual(expected.slice(7))
    expect(playerOf(party).discard).toEqual([])
    expect(party.rngState).toEqual(rng.state())
    expect(party.pullDomainEvents().map((e) => e.type)).toEqual([
      'VaultUsed',
      'DeckAdjusted',
    ])
  })

  it('REQ-87: cenário do contrato — store 4 da pasta e editBuild 30 + 32: buildSize 62, sobra no cofre, 7 na mão', () => {
    const party = partyOf({ tcgFolder: [entry(S, 4)] })
    const rng = SeededRng.fromState(party.rngState)
    const expected = shuffle(
      [
        ...Array.from({ length: 30 }, () => E),
        ...Array.from({ length: 32 }, () => S),
      ],
      rng
    )

    const result = run(party, [
      { operation: 'store', cardId: S, quantity: 4 },
      { operation: 'editBuild', build: [entry(E, 30), entry(S, 32)] },
    ])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).build).toEqual([entry(E, 30), entry(S, 32)])
    expect(playerOf(party).tcgFolder).toEqual([])
    expect(playerOf(party).vault.slots).toEqual([slot(S, 2)])
    expect(playerOf(party).hand).toEqual(expected.slice(0, 7))
    expect(playerOf(party).deck).toEqual(expected.slice(7))
    expect(party.turn.actionPoints).toBe(2)
    expect(party.rngState).toEqual(rng.state())
    const events = party.pullDomainEvents()
    expect(events.map((e) => e.type)).toEqual(['VaultUsed', 'DeckAdjusted'])
    expect(events[1]).toMatchObject({
      type: 'DeckAdjusted',
      buildSize: 62,
      handSize: 7,
    })
  })

  it('REQ-87: editBuild — a build sai inteira das cartas do jogador; o que sobra da build antiga vai para o fim de vault.slots', () => {
    const party = partyOf(
      { vault: { slots: [slot(D, 10)], decks: [], gold: 0 } },
      { minDeckSize: 40 }
    )

    const result = run(party, [
      { operation: 'editBuild', build: [entry(D, 10), entry(E, 30)] },
    ])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).build).toEqual([entry(D, 10), entry(E, 30)])
    expect(playerOf(party).vault.slots).toEqual([slot(S, 30)])
  })

  it('REQ-87: swapBuild e editBuild no mesmo lote → um único embaralhamento no fim', () => {
    const party = partyOf({
      vault: { slots: [], decks: [[entry(D, 20), entry(S, 40)]], gold: 0 },
    })
    const rng = SeededRng.fromState(party.rngState)
    const expected = shuffle(
      [
        ...Array.from({ length: 30 }, () => E),
        ...Array.from({ length: 30 }, () => S),
      ],
      rng
    )

    run(party, [
      { operation: 'swapBuild', deckIndex: 0 },
      { operation: 'unpackDeck', deckIndex: 0 },
      { operation: 'editBuild', build: [entry(E, 30), entry(S, 30)] },
    ])

    expect(playerOf(party).build).toEqual([entry(E, 30), entry(S, 30)])
    expect(playerOf(party).hand).toEqual(expected.slice(0, 7))
    expect(party.rngState).toEqual(rng.state())
    expect(
      party.pullDomainEvents().filter((e) => e.type === 'DeckAdjusted')
    ).toHaveLength(1)
  })

  it('REQ-87: mão e descarte voltam ao deck e compra H = a mão de antes do useVault', () => {
    const party = partyOf({
      hand: [S, E, S],
      discard: [E, E, S, S],
      vault: { slots: [], decks: [[entry(E, 30), entry(S, 30)]], gold: 0 },
    })

    run(party, [{ operation: 'swapBuild', deckIndex: 0 }])

    expect(playerOf(party).hand).toHaveLength(3)
    expect(playerOf(party).discard).toEqual([])
    expect(playerOf(party).deck).toHaveLength(57)
  })

  it('REQ-87: a trava perdida recalcula modifiers e emite DeckLockChanged depois do DeckAdjusted', () => {
    const party = partyOf({}, { minDeckSize: 10 })

    const result = run(party, [
      { operation: 'editBuild', build: [entry(E, 30)] },
    ])

    expect(result.isRight()).toBe(true)
    expect(playerOf(party).playerClasses).toEqual([
      { playerClass: 'warrior', deckLockMet: false },
    ])
    expect(playerOf(party).modifiers).toEqual(DEFAULT_MODIFIERS)
    expect(party.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: 'VaultUsed' }),
      expect.objectContaining({ type: 'DeckAdjusted', buildSize: 30 }),
      expect.objectContaining({
        type: 'DeckLockChanged',
        playerClass: 'warrior',
        deckLockMet: false,
      }),
    ])
  })
})

describe('Party.useVault — recusas por operação (REQ-88 item 3)', () => {
  const refusal = (
    player: Partial<TPlayerState>,
    operations: TVaultOperation[],
    config: Partial<typeof GAME_CONFIG_DEFAULTS> = {}
  ) => {
    const party = partyOf(player, config)
    const before = partyOf(player, config)
    const result = run(party, operations)
    expectUntouched(party, before)
    return result.isLeft() ? result.value : null
  }

  it('REQ-88: lote com falha no meio não grava nada; operationIndex é o da primeira que falha', () => {
    expect(
      refusal({ gold: 40, vault: { slots: [], decks: [], gold: 60 } }, [
        { operation: 'takeGold', amount: 10 },
        { operation: 'take', cardId: P, quantity: 5 },
        { operation: 'storeGold', amount: 999 },
      ])
    ).toEqual({ reason: 'notInVault', operationIndex: 1 })
  })

  it('REQ-88: store sem as unidades → notInTcgFolder (atributo) / notInInventory (equipamento, item)', () => {
    expect(
      refusal({ tcgFolder: [entry(D, 1)] }, [
        { operation: 'store', cardId: D, quantity: 2 },
      ])
    ).toEqual({ reason: 'notInTcgFolder', operationIndex: 0 })
    expect(
      refusal({ inventory: [slot(P, 1)] }, [
        { operation: 'store', cardId: P, quantity: 2 },
      ])
    ).toEqual({ reason: 'notInInventory', operationIndex: 0 })
  })

  it('REQ-88: store de carta que o catálogo não devolve → notStorable', () => {
    expect(
      refusal({ inventory: [slot('fixture.ghost', 1)] }, [
        { operation: 'store', cardId: 'fixture.ghost', quantity: 1 },
      ])
    ).toEqual({ reason: 'notStorable', operationIndex: 0 })
  })

  it('REQ-88: slot novo com vault.slots cheio → vaultFull; carta que já tem slot empilha mesmo cheio', () => {
    expect(
      refusal(
        {
          inventory: [slot(P, 1), slot(K, 1)],
          vault: { slots: [slot(P, 1)], decks: [], gold: 0 },
        },
        [
          { operation: 'store', cardId: P, quantity: 1 },
          { operation: 'store', cardId: K, quantity: 1 },
        ],
        { vaultCapacity: 1 }
      )
    ).toEqual({ reason: 'vaultFull', operationIndex: 1 })
  })

  it('REQ-88: take/discard/saveDeck sem as unidades no cofre → notInVault', () => {
    const vault = { slots: [slot(P, 1), slot(D, 1)], decks: [], gold: 0 }
    expect(
      refusal({ vault }, [{ operation: 'take', cardId: P, quantity: 2 }])
    ).toEqual({ reason: 'notInVault', operationIndex: 0 })
    expect(
      refusal({ vault }, [{ operation: 'discard', cardId: K, quantity: 1 }])
    ).toEqual({ reason: 'notInVault', operationIndex: 0 })
    expect(
      refusal({ vault }, [
        { operation: 'saveDeck', cards: [entry(D, 1), entry(S, 1)] },
      ])
    ).toEqual({ reason: 'notInVault', operationIndex: 0 })
  })

  it('REQ-88: take sem espaço → inventoryFull / tcgFolderFull', () => {
    expect(
      refusal(
        {
          inventory: [slot(B, 1)],
          vault: { slots: [slot(K, 1)], decks: [], gold: 0 },
        },
        [{ operation: 'take', cardId: K, quantity: 1 }],
        { inventoryCapacity: 1 }
      )
    ).toEqual({ reason: 'inventoryFull', operationIndex: 0 })
    expect(
      refusal(
        {
          tcgFolder: [entry(S, 2)],
          vault: { slots: [slot(D, 1)], decks: [], gold: 0 },
        },
        [{ operation: 'take', cardId: D, quantity: 1 }],
        { tcgFolderCapacity: 2 }
      )
    ).toEqual({ reason: 'tcgFolderFull', operationIndex: 0 })
  })

  it('REQ-88: ouro → notEnoughGold, vaultGoldFull, notEnoughVaultGold', () => {
    expect(
      refusal({ gold: 5 }, [{ operation: 'storeGold', amount: 6 }])
    ).toEqual({ reason: 'notEnoughGold', operationIndex: 0 })
    expect(
      refusal({ gold: 100 }, [{ operation: 'storeGold', amount: 60 }], {
        vaultGoldCapacity: 50,
      })
    ).toEqual({ reason: 'vaultGoldFull', operationIndex: 0 })
    expect(
      refusal({ gold: 0 }, [{ operation: 'takeGold', amount: 1 }])
    ).toEqual({ reason: 'notEnoughVaultGold', operationIndex: 0 })
  })

  it('REQ-88: a capacidade do ouro é conferida a cada passo (60 + 60 com limite 100)', () => {
    expect(
      refusal(
        { gold: 200 },
        [
          { operation: 'storeGold', amount: 60 },
          { operation: 'storeGold', amount: 60 },
        ],
        { vaultGoldCapacity: 100 }
      )
    ).toEqual({ reason: 'vaultGoldFull', operationIndex: 1 })
  })

  it('REQ-88: saveDeck → notAttribute, deckSlotsFull (decks + 2 > vaultDeckSlots)', () => {
    expect(
      refusal({ vault: { slots: [slot(P, 1)], decks: [], gold: 0 } }, [
        { operation: 'saveDeck', cards: [entry(P, 1)] },
      ])
    ).toEqual({ reason: 'notAttribute', operationIndex: 0 })
    expect(
      refusal(
        { vault: { slots: [slot(D, 1)], decks: [[entry(E, 1)]], gold: 0 } },
        [{ operation: 'saveDeck', cards: [entry(D, 1)] }],
        { vaultDeckSlots: 2 }
      )
    ).toEqual({ reason: 'deckSlotsFull', operationIndex: 0 })
  })

  it('REQ-88: deckIndex inexistente → deckNotFound (unpackDeck e swapBuild)', () => {
    expect(refusal({}, [{ operation: 'unpackDeck', deckIndex: 3 }])).toEqual({
      reason: 'deckNotFound',
      operationIndex: 0,
    })
    expect(refusal({}, [{ operation: 'swapBuild', deckIndex: 0 }])).toEqual({
      reason: 'deckNotFound',
      operationIndex: 0,
    })
  })

  it('REQ-88: unpackDeck cujas cartas não cabem em vault.slots → vaultFull', () => {
    expect(
      refusal(
        {
          vault: { slots: [slot(P, 1)], decks: [[entry(D, 1)]], gold: 0 },
        },
        [{ operation: 'unpackDeck', deckIndex: 0 }],
        { vaultCapacity: 1 }
      )
    ).toEqual({ reason: 'vaultFull', operationIndex: 0 })
  })

  it('REQ-88: swapBuild com deck abaixo do mínimo → buildBelowMinimum (cenário do contrato)', () => {
    expect(
      refusal({ vault: { slots: [], decks: [[entry(S, 2)]], gold: 0 } }, [
        { operation: 'swapBuild', deckIndex: 0 },
      ])
    ).toEqual({ reason: 'buildBelowMinimum', operationIndex: 0 })
  })

  it('REQ-88: swapBuild/editBuild com carta acima do limite de cópias → copyLimitExceeded com cardId', () => {
    expect(
      refusal(
        { vault: { slots: [], decks: [[entry(Y, 5), entry(S, 55)]], gold: 0 } },
        [{ operation: 'swapBuild', deckIndex: 0 }]
      )
    ).toEqual({ reason: 'copyLimitExceeded', operationIndex: 0, cardId: Y })
    expect(
      refusal({ vault: { slots: [slot(Y, 5)], decks: [], gold: 0 } }, [
        {
          operation: 'editBuild',
          build: [entry(Y, 5), entry(S, 30), entry(E, 25)],
        },
      ])
    ).toEqual({ reason: 'copyLimitExceeded', operationIndex: 0, cardId: Y })
  })

  it('REQ-88: editBuild com cópias que o jogador não tem → notOwned com cardId; a pasta não entra no pool', () => {
    expect(
      refusal({}, [
        { operation: 'editBuild', build: [entry(E, 31), entry(S, 30)] },
      ])
    ).toEqual({ reason: 'notOwned', operationIndex: 0, cardId: E })
    expect(
      refusal({ tcgFolder: [entry(D, 5)] }, [
        {
          operation: 'editBuild',
          build: [entry(D, 5), entry(E, 30), entry(S, 25)],
        },
      ])
    ).toEqual({ reason: 'notOwned', operationIndex: 0, cardId: D })
  })

  it('REQ-88: editBuild abaixo do mínimo → buildBelowMinimum; sobra que não cabe → vaultFull', () => {
    expect(
      refusal({}, [{ operation: 'editBuild', build: [entry(E, 30)] }])
    ).toEqual({ reason: 'buildBelowMinimum', operationIndex: 0 })
    expect(
      refusal({}, [{ operation: 'editBuild', build: [entry(E, 30)] }], {
        minDeckSize: 10,
        vaultCapacity: 0,
      })
    ).toEqual({ reason: 'vaultFull', operationIndex: 0 })
  })
})

describe('Party.contentInUse — cofre (REQ-94)', () => {
  it('REQ-94: cartas de vault.slots e vault.decks entram no conteúdo em uso', () => {
    const party = partyOf({
      vault: {
        slots: [slot(P, 1)],
        decks: [[entry(D, 2)]],
        gold: 0,
      },
    })

    const { cardIds } = party.contentInUse()

    expect(cardIds).toEqual(expect.arrayContaining([P, D]))
  })
})
