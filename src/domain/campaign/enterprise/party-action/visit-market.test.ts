import { describe, expect, it } from 'vitest'

import { parsePartyAction } from '.'

const P = 'fixture.healing-potion'

const issuesOf = (body: unknown) => {
  const result = parsePartyAction(body)
  return result.isLeft() ? result.value : null
}

const withOperations = (...operations: unknown[]) => ({
  type: 'visitMarket',
  operations,
})

describe('parsePartyAction — visitMarket (REQ-140; D-118)', () => {
  it('REQ-140: as quatro operações válidas → a ação, com os campos lidos', () => {
    const operations = [
      { operation: 'buyStock', cardId: P, quantity: 2 },
      { operation: 'buyBooster', cardId: 'fixture.booster', quantity: 1 },
      { operation: 'buySingle', slotIndex: 0 },
      { operation: 'sell', source: 'inventory', cardId: P, quantity: 3 },
      { operation: 'sell', source: 'tcgFolder', cardId: P, quantity: 1 },
    ]

    const result = parsePartyAction({ type: 'visitMarket', operations })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value).toEqual({ type: 'visitMarket', operations })
    }
  })

  it('REQ-140: operations ausente → required; não lista → notArray', () => {
    expect(issuesOf({ type: 'visitMarket' })).toEqual([
      { field: 'operations', reason: 'required' },
    ])
    expect(issuesOf({ type: 'visitMarket', operations: {} })).toEqual([
      { field: 'operations', reason: 'notArray' },
    ])
  })

  it('REQ-140: lista vazia ou com mais de 50 → invalidLength', () => {
    expect(issuesOf(withOperations())).toEqual([
      { field: 'operations', reason: 'invalidLength' },
    ])
    const operation = { operation: 'buySingle', slotIndex: 0 }
    expect(
      parsePartyAction({
        type: 'visitMarket',
        operations: Array.from({ length: 50 }, () => operation),
      }).isRight()
    ).toBe(true)
    expect(
      issuesOf({
        type: 'visitMarket',
        operations: Array.from({ length: 51 }, () => operation),
      })
    ).toEqual([{ field: 'operations', reason: 'invalidLength' }])
  })

  it('CONTRATO FEAT-16: slotIndex negativo ou fracionado → notNonNegativeInteger; ausente → required', () => {
    expect(
      issuesOf(withOperations({ operation: 'buySingle', slotIndex: -1 }))
    ).toEqual([
      { field: 'operations.0.slotIndex', reason: 'notNonNegativeInteger' },
    ])
    expect(
      issuesOf(withOperations({ operation: 'buySingle', slotIndex: 1.5 }))
    ).toEqual([
      { field: 'operations.0.slotIndex', reason: 'notNonNegativeInteger' },
    ])
    expect(issuesOf(withOperations({ operation: 'buySingle' }))).toEqual([
      { field: 'operations.0.slotIndex', reason: 'required' },
    ])
  })

  it('CONTRATO FEAT-16: source fora de inventory|tcgFolder → unknownOption', () => {
    expect(
      issuesOf(
        withOperations({
          operation: 'sell',
          source: 'vault',
          cardId: P,
          quantity: 1,
        })
      )
    ).toEqual([{ field: 'operations.0.source', reason: 'unknownOption' }])
  })

  it('CONTRATO FEAT-16: operation desconhecida → unknownOperation; ausente → required', () => {
    expect(issuesOf(withOperations({ operation: 'haggle' }))).toEqual([
      { field: 'operations.0.operation', reason: 'unknownOperation' },
    ])
    expect(issuesOf(withOperations({}))).toEqual([
      { field: 'operations.0.operation', reason: 'required' },
    ])
    expect(issuesOf(withOperations({ operation: 3 }))).toEqual([
      { field: 'operations.0.operation', reason: 'notString' },
    ])
    expect(issuesOf(withOperations('buySingle'))).toEqual([
      { field: 'operations.0', reason: 'invalidItem' },
    ])
  })

  it('REQ-140: quantity e cardId inválidos, com o índice da operação; campo a mais → unknownKey', () => {
    expect(
      issuesOf(
        withOperations(
          { operation: 'buySingle', slotIndex: 0 },
          { operation: 'buyStock', cardId: 7, quantity: 0 },
          { operation: 'buyBooster', cardId: P, quantity: 1, price: 1 }
        )
      )
    ).toEqual([
      { field: 'operations.1.cardId', reason: 'notString' },
      { field: 'operations.1.quantity', reason: 'notPositiveInteger' },
      { field: 'operations.2.price', reason: 'unknownKey' },
    ])
    expect(
      issuesOf({
        ...withOperations({ operation: 'buySingle', slotIndex: 0 }),
        extra: 1,
      })
    ).toEqual([{ field: 'extra', reason: 'unknownKey' }])
  })
})
