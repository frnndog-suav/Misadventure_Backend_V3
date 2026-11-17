import { describe, expect, it } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'

import { rollTurnOrder } from '.'

/** RNG com as rolagens de D20 dadas, na ordem (só `nextInt(1, 20)`). */
function scriptedRng(rolls: number[]): SeededRng {
  const queue = [...rolls]
  return {
    nextInt: (min: number, max: number) => {
      expect([min, max]).toEqual([1, 20])
      const next = queue.shift()
      if (next === undefined) throw new Error('rolagens acabaram')
      return next
    },
  } as unknown as SeededRng
}

describe('rollTurnOrder', () => {
  it('REQ-33: com 1 membro, rola uma vez e ele é o 1º', () => {
    const rng = SeededRng.fromSeed(42)
    const before = SeededRng.fromSeed(42)
    before.nextInt(1, 20)

    expect(rollTurnOrder(['m-1'], rng)).toEqual(['m-1'])
    expect(rng.state()).toEqual(before.state())
  })

  it('REQ-33: do maior para o menor', () => {
    expect(rollTurnOrder(['a', 'b', 'c'], scriptedRng([5, 18, 11]))).toEqual([
      'b',
      'c',
      'a',
    ])
  })

  it('REQ-33: empatados rolam de novo só entre si, até não haver empate', () => {
    // a=12, b=7, c=12, d=3 → a e c rolam: 9 e 9 → de novo: 4 e 15 → c, a.
    const rng = scriptedRng([12, 7, 12, 3, 9, 9, 4, 15])

    expect(rollTurnOrder(['a', 'b', 'c', 'd'], rng)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ])
  })

  it('REQ-33: dois grupos empatados se resolvem cada um no seu lugar (maior primeiro)', () => {
    // a=10, b=20, c=10, d=20 → b,d rolam (2, 1) → b, d; depois a,c rolam (3, 8) → c, a.
    const rng = scriptedRng([10, 20, 10, 20, 2, 1, 3, 8])

    expect(rollTurnOrder(['a', 'b', 'c', 'd'], rng)).toEqual([
      'b',
      'd',
      'c',
      'a',
    ])
  })

  it('REQ-33: mesmo RNG → mesma ordem', () => {
    const members = ['a', 'b', 'c', 'd', 'e', 'f']

    expect(rollTurnOrder(members, SeededRng.fromSeed(7))).toEqual(
      rollTurnOrder(members, SeededRng.fromSeed(7))
    )
  })
})
