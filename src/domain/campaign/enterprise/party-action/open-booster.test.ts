import { describe, expect, it } from 'vitest'

import { parsePartyAction } from '.'

const BO = 'fixture.booster'

const issuesOf = (body: unknown) => {
  const result = parsePartyAction(body)
  return result.isLeft() ? result.value : null
}

describe('parsePartyAction — openBooster (REQ-144)', () => {
  it('REQ-144: prepare/openBooster com cardId → a ação', () => {
    const result = parsePartyAction({
      type: 'prepare',
      operation: 'openBooster',
      cardId: BO,
    })

    expect(result.isRight() && result.value).toEqual({
      type: 'prepare',
      operation: 'openBooster',
      cardId: BO,
    })
  })

  it('REQ-144: prepare/openBooster sem cardId → required; não texto → notString; campo a mais → unknownKey', () => {
    expect(issuesOf({ type: 'prepare', operation: 'openBooster' })).toEqual([
      { field: 'cardId', reason: 'required' },
    ])
    expect(
      issuesOf({ type: 'prepare', operation: 'openBooster', cardId: 3 })
    ).toEqual([{ field: 'cardId', reason: 'notString' }])
    expect(
      issuesOf({
        type: 'prepare',
        operation: 'openBooster',
        cardId: BO,
        quantity: 1,
      })
    ).toEqual([{ field: 'quantity', reason: 'unknownKey' }])
  })

  it('REQ-144: useVault aceita openBooster no lote, com os problemas no caminho operations.i', () => {
    const ok = parsePartyAction({
      type: 'useVault',
      operations: [
        { operation: 'store', cardId: BO, quantity: 1 },
        { operation: 'openBooster', cardId: BO },
      ],
    })

    expect(ok.isRight() && ok.value).toEqual({
      type: 'useVault',
      operations: [
        { operation: 'store', cardId: BO, quantity: 1 },
        { operation: 'openBooster', cardId: BO },
      ],
    })
    expect(
      issuesOf({
        type: 'useVault',
        operations: [{ operation: 'openBooster' }],
      })
    ).toEqual([{ field: 'operations.0.cardId', reason: 'required' }])
  })
})
