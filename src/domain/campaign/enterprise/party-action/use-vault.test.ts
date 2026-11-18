import { describe, expect, it } from 'vitest'

import { parsePartyAction } from '.'

const P = 'fixture.healing-potion'

const issuesOf = (body: unknown) => {
  const result = parsePartyAction(body)
  return result.isLeft() ? result.value : null
}

describe('parsePartyAction — useVault (REQ-84, REQ-88 item 1)', () => {
  it('REQ-84: as 10 operações válidas → a ação, com os campos lidos', () => {
    const operations = [
      { operation: 'store', cardId: P, quantity: 2 },
      { operation: 'take', cardId: P, quantity: 1 },
      { operation: 'storeGold', amount: 60 },
      { operation: 'takeGold', amount: 10 },
      { operation: 'discard', cardId: P, quantity: 1 },
      {
        operation: 'saveDeck',
        cards: [{ cardId: 'fixture.strength-basic', copies: 2 }],
      },
      { operation: 'unpackDeck', deckIndex: 0 },
      { operation: 'swapBuild', deckIndex: 1 },
      {
        operation: 'editBuild',
        build: [{ cardId: 'fixture.strength-basic', copies: 60 }],
      },
    ]

    const result = parsePartyAction({ type: 'useVault', operations })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value).toEqual({ type: 'useVault', operations })
    }
  })

  it('REQ-88: operations ausente → required; não lista → notArray', () => {
    expect(issuesOf({ type: 'useVault' })).toEqual([
      { field: 'operations', reason: 'required' },
    ])
    expect(issuesOf({ type: 'useVault', operations: {} })).toEqual([
      { field: 'operations', reason: 'notArray' },
    ])
  })

  it('REQ-88: lista vazia ou com mais de 50 → invalidLength', () => {
    expect(issuesOf({ type: 'useVault', operations: [] })).toEqual([
      { field: 'operations', reason: 'invalidLength' },
    ])
    const fifty = Array.from({ length: 50 }, () => ({
      operation: 'takeGold',
      amount: 1,
    }))
    expect(
      parsePartyAction({ type: 'useVault', operations: fifty }).isRight()
    ).toBe(true)
    expect(
      issuesOf({
        type: 'useVault',
        operations: [...fifty, { operation: 'takeGold', amount: 1 }],
      })
    ).toEqual([{ field: 'operations', reason: 'invalidLength' }])
  })

  it('REQ-88: item não objeto → invalidItem em operations.i', () => {
    expect(issuesOf({ type: 'useVault', operations: [1, null, []] })).toEqual([
      { field: 'operations.0', reason: 'invalidItem' },
      { field: 'operations.1', reason: 'invalidItem' },
      { field: 'operations.2', reason: 'invalidItem' },
    ])
  })

  it('REQ-88: operation ausente, não texto ou desconhecida vem sozinha no item', () => {
    expect(
      issuesOf({
        type: 'useVault',
        operations: [
          { cardId: P, extra: 1 },
          { operation: 3 },
          { operation: 'pack', quantity: 0 },
        ],
      })
    ).toEqual([
      { field: 'operations.0.operation', reason: 'required' },
      { field: 'operations.1.operation', reason: 'notString' },
      { field: 'operations.2.operation', reason: 'unknownOperation' },
    ])
  })

  it('REQ-88: store/take/discard: cardId texto; quantity inteiro ≥ 1; campo a mais', () => {
    expect(
      issuesOf({
        type: 'useVault',
        operations: [
          { operation: 'store', quantity: 0 },
          { operation: 'take', cardId: 7, quantity: 1.5, extra: true },
          { operation: 'discard', cardId: P },
        ],
      })
    ).toEqual([
      { field: 'operations.0.cardId', reason: 'required' },
      { field: 'operations.0.quantity', reason: 'notPositiveInteger' },
      { field: 'operations.1.cardId', reason: 'notString' },
      { field: 'operations.1.quantity', reason: 'notPositiveInteger' },
      { field: 'operations.1.extra', reason: 'unknownKey' },
      { field: 'operations.2.quantity', reason: 'required' },
    ])
  })

  it('REQ-88: storeGold/takeGold: amount inteiro ≥ 1', () => {
    expect(
      issuesOf({
        type: 'useVault',
        operations: [
          { operation: 'storeGold' },
          { operation: 'takeGold', amount: '5' },
          { operation: 'storeGold', amount: -1 },
        ],
      })
    ).toEqual([
      { field: 'operations.0.amount', reason: 'required' },
      { field: 'operations.1.amount', reason: 'notPositiveInteger' },
      { field: 'operations.2.amount', reason: 'notPositiveInteger' },
    ])
  })

  it('REQ-88: deckIndex inteiro ≥ 0 → notNonNegativeInteger (0 vale)', () => {
    expect(
      issuesOf({
        type: 'useVault',
        operations: [
          { operation: 'unpackDeck', deckIndex: -1 },
          { operation: 'swapBuild', deckIndex: 'a' },
          { operation: 'swapBuild' },
        ],
      })
    ).toEqual([
      { field: 'operations.0.deckIndex', reason: 'notNonNegativeInteger' },
      { field: 'operations.1.deckIndex', reason: 'notNonNegativeInteger' },
      { field: 'operations.2.deckIndex', reason: 'required' },
    ])
    expect(
      parsePartyAction({
        type: 'useVault',
        operations: [{ operation: 'unpackDeck', deckIndex: 0 }],
      }).isRight()
    ).toBe(true)
  })

  it('REQ-88: cards e build como a build de REQ-66, com duplicateCard', () => {
    expect(
      issuesOf({
        type: 'useVault',
        operations: [
          { operation: 'saveDeck' },
          { operation: 'saveDeck', cards: 'x' },
          {
            operation: 'saveDeck',
            cards: [
              5,
              { cardId: 'a', copies: 0 },
              { cardId: 'a', copies: 1, z: 1 },
              { copies: 1 },
            ],
          },
          { operation: 'editBuild', build: [{ cardId: 'a' }] },
        ],
      })
    ).toEqual([
      { field: 'operations.0.cards', reason: 'required' },
      { field: 'operations.1.cards', reason: 'notArray' },
      { field: 'operations.2.cards.0', reason: 'invalidItem' },
      { field: 'operations.2.cards.1.copies', reason: 'notPositiveInteger' },
      { field: 'operations.2.cards.2.cardId', reason: 'duplicateCard' },
      { field: 'operations.2.cards.2.z', reason: 'unknownKey' },
      { field: 'operations.2.cards.3.cardId', reason: 'required' },
      { field: 'operations.3.build.0.copies', reason: 'required' },
    ])
  })

  it('REQ-88: campo a mais na ação → unknownKey, depois dos problemas das operações', () => {
    expect(
      issuesOf({
        type: 'useVault',
        zoneId: 'x',
        operations: [{ operation: 'storeGold', amount: 0 }],
      })
    ).toEqual([
      { field: 'operations.0.amount', reason: 'notPositiveInteger' },
      { field: 'zoneId', reason: 'unknownKey' },
    ])
  })
})
