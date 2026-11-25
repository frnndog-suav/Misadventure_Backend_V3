import { describe, expect, it } from 'vitest'

import { parsePartyAction } from '.'

// T-75: `useAbility` (combate e Preparar) com exatamente um entre `equipmentSlot`
// e `mountAbility: true` (REQ-157; CONTRATO FEAT-18 v0.89 `AbilitySource`).

const combat = { combatId: 'c1', turnId: 't1' }
const prepare = { type: 'prepare', operation: 'useAbility' }

describe('parsePartyAction — useAbility com a montaria (REQ-157)', () => {
  it('REQ-157: combate com mountAbility: true e sem equipmentSlot → a ação, com mountAbility', () => {
    const result = parsePartyAction({
      type: 'useAbility',
      ...combat,
      abilityId: 'pony-rest',
      mountAbility: true,
      targetId: 'e1',
    })

    expect(result.isRight()).toBe(true)
    expect(result.value).toEqual({
      type: 'useAbility',
      ...combat,
      abilityId: 'pony-rest',
      mountAbility: true,
      targetId: 'e1',
    })
  })

  it('REQ-157: prepare useAbility com mountAbility: true → a operação, com mountAbility', () => {
    const result = parsePartyAction({
      ...prepare,
      abilityId: 'pony-rest',
      mountAbility: true,
    })

    expect(result.isRight()).toBe(true)
    expect(result.value).toEqual({
      ...prepare,
      abilityId: 'pony-rest',
      mountAbility: true,
    })
  })

  it('REQ-157: equipmentSlot sozinho continua valendo, sem mountAbility', () => {
    const result = parsePartyAction({
      ...prepare,
      abilityId: 'a',
      equipmentSlot: 'weapon',
    })

    expect(result.value).toEqual({
      ...prepare,
      abilityId: 'a',
      equipmentSlot: 'weapon',
    })
  })

  // AMBÍGUO: o contrato não fixa `field`/`reason` dos dois casos abaixo (só 400 ACTION_INVALID);
  // o teste confere apenas a recusa de forma.
  it.each([
    ['combate', { type: 'useAbility', ...combat }],
    ['Preparar', prepare],
  ])(
    'REQ-157: %s com equipmentSlot e mountAbility juntos → recusa de forma',
    (_, base) => {
      const result = parsePartyAction({
        ...base,
        abilityId: 'a',
        equipmentSlot: 'weapon',
        mountAbility: true,
      })

      expect(result.isLeft()).toBe(true)
    }
  )

  it.each([
    ['combate', { type: 'useAbility', ...combat }],
    ['Preparar', prepare],
  ])(
    'REQ-157: %s sem equipmentSlot e sem mountAbility → recusa de forma',
    (_, base) => {
      expect(parsePartyAction({ ...base, abilityId: 'a' }).isLeft()).toBe(true)
    }
  )
})
