import { describe, expect, it } from 'vitest'

import { parsePartyAction } from '.'

describe('Preparar: activate', () => {
  const action = {
    type: 'prepare',
    operation: 'activate',
    cardId: 'fixture.focus-amulet',
    effectIndex: 2,
    payment: {
      handCards: ['fixture.strength-basic', 'fixture.strength-basic'],
    },
  }

  it('REQ-104: preserva a ordem e as cópias do pagamento', () => {
    const result = parsePartyAction(action)
    expect(result.isRight()).toBe(true)
    expect(result.value).toEqual(action)
  })

  it('REQ-105: valida forma e lista os erros na ordem dos campos', () => {
    const result = parsePartyAction({
      ...action,
      cardId: false,
      effectIndex: -1,
      payment: { handCards: [4], extra: true },
      extra: true,
    })
    expect(result.value).toEqual([
      { field: 'cardId', reason: 'notString' },
      { field: 'effectIndex', reason: 'notNonNegativeInteger' },
      { field: 'payment.handCards.0', reason: 'invalidItem' },
      { field: 'payment.extra', reason: 'unknownKey' },
      { field: 'extra', reason: 'unknownKey' },
    ])
  })

  it('REQ-105: recusa pagamento que não é objeto', () => {
    expect(parsePartyAction({ ...action, payment: [] }).value).toEqual([
      { field: 'payment', reason: 'notObject' },
    ])
  })
})
