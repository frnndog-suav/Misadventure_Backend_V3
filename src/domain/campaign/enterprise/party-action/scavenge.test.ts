import { describe, expect, it } from 'vitest'

import { parsePartyAction } from '.'

const issuesOf = (body: unknown) => {
  const result = parsePartyAction(body)
  return result.isLeft() ? result.value : null
}

describe('parsePartyAction — scavenge (REQ-91, REQ-92)', () => {
  it('REQ-91: { type: scavenge, cardId } → a ação', () => {
    const result = parsePartyAction({
      type: 'scavenge',
      cardId: 'fixture.silver-fish',
    })
    expect(result.value).toEqual({
      type: 'scavenge',
      cardId: 'fixture.silver-fish',
    })
  })

  it('REQ-92: cardId ausente → required; não texto → notString; campo a mais → unknownKey', () => {
    expect(issuesOf({ type: 'scavenge' })).toEqual([
      { field: 'cardId', reason: 'required' },
    ])
    expect(issuesOf({ type: 'scavenge', cardId: 3, extra: true })).toEqual([
      { field: 'cardId', reason: 'notString' },
      { field: 'extra', reason: 'unknownKey' },
    ])
    expect(
      issuesOf({ type: 'scavenge', cardId: 'fixture.silver-fish', x: 1 })
    ).toEqual([{ field: 'x', reason: 'unknownKey' }])
  })
})
