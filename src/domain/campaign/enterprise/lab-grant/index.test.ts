import { describe, expect, it } from 'vitest'

import { parseLabGrant } from '.'

describe('parseLabGrant (REQ-77)', () => {
  it('REQ-77: carta válida', () => {
    const result = parseLabGrant({ type: 'card', cardId: 'a.b', quantity: 2 })
    expect(result.isRight() && result.value).toEqual({
      type: 'card',
      cardId: 'a.b',
      quantity: 2,
    })
  })

  it('REQ-77: ouro válido', () => {
    const result = parseLabGrant({ type: 'gold', amount: 295 })
    expect(result.isRight() && result.value).toEqual({
      type: 'gold',
      amount: 295,
    })
  })

  it.each([null, 'x', 3, [], undefined])(
    'REQ-77: corpo que não é objeto (%j) → invalidBody',
    (body) => {
      const result = parseLabGrant(body)
      expect(result.isLeft() && result.value).toEqual([
        { field: null, reason: 'invalidBody' },
      ])
    }
  )

  it('REQ-77: type ausente, não texto ou desconhecido vem sozinho', () => {
    expect(parseLabGrant({ cardId: 'a' }).value).toEqual([
      { field: 'type', reason: 'required' },
    ])
    expect(parseLabGrant({ type: 1, cardId: 'a' }).value).toEqual([
      { field: 'type', reason: 'notString' },
    ])
    expect(parseLabGrant({ type: 'item', cardId: 'a' }).value).toEqual([
      { field: 'type', reason: 'unknownGrantType' },
    ])
  })

  it('REQ-77: card — cardId e quantity, nesta ordem, depois campos a mais', () => {
    expect(parseLabGrant({ type: 'card' }).value).toEqual([
      { field: 'cardId', reason: 'required' },
      { field: 'quantity', reason: 'required' },
    ])
    expect(
      parseLabGrant({ type: 'card', cardId: 3, quantity: 0, foo: 1 }).value
    ).toEqual([
      { field: 'cardId', reason: 'notString' },
      { field: 'quantity', reason: 'notPositiveInteger' },
      { field: 'foo', reason: 'unknownKey' },
    ])
  })

  it.each([0, -1, 1.5, '2', null])(
    'REQ-77: quantity %j → notPositiveInteger',
    (quantity) => {
      expect(
        parseLabGrant({ type: 'card', cardId: 'a', quantity }).value
      ).toEqual([{ field: 'quantity', reason: 'notPositiveInteger' }])
    }
  )

  it('REQ-77: gold — amount e campos a mais (amount no card é campo a mais e vice-versa)', () => {
    expect(parseLabGrant({ type: 'gold' }).value).toEqual([
      { field: 'amount', reason: 'required' },
    ])
    expect(parseLabGrant({ type: 'gold', amount: 0 }).value).toEqual([
      { field: 'amount', reason: 'notPositiveInteger' },
    ])
    expect(
      parseLabGrant({ type: 'gold', amount: 5, cardId: 'a' }).value
    ).toEqual([{ field: 'cardId', reason: 'unknownKey' }])
    expect(
      parseLabGrant({ type: 'card', cardId: 'a', quantity: 1, amount: 5 }).value
    ).toEqual([{ field: 'amount', reason: 'unknownKey' }])
  })
})
