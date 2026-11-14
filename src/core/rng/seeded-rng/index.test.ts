import { describe, expect, it } from 'vitest'

import { SeededRng } from '.'

// Valores de referência gerados por uma implementação independente do sfc32
// (Go, uint32 nativo), com a semeadura do PractRand: a=0, b=seed, c=0, d=1,
// 12 saídas descartadas (D-32).
describe('SeededRng (sfc32)', () => {
  it('REQ-22: semente 42 produz a sequência de referência do sfc32', () => {
    const rng = SeededRng.fromSeed(42)

    expect(rng.state()).toEqual([2526348523, 3033030979, 834219466, 13])
    expect([1, 2, 3, 4, 5].map(() => rng.nextUint32())).toEqual([
      1264412219, 1947509147, 3919439299, 1251167922, 656401615,
    ])
  })

  it('REQ-22: sementes nas bordas (0 e 2^32-1) seguem a referência', () => {
    expect(SeededRng.fromSeed(0).nextUint32()).toBe(1363572419)
    expect(SeededRng.fromSeed(4294967295).nextUint32()).toBe(1984736529)
  })

  it('REQ-22: mesma semente → mesma sequência', () => {
    const a = SeededRng.fromSeed(123456)
    const b = SeededRng.fromSeed(123456)

    for (let i = 0; i < 100; i++) expect(a.nextUint32()).toBe(b.nextUint32())
  })

  it('REQ-22: fromState(state()) continua a mesma sequência', () => {
    const original = SeededRng.fromSeed(42)
    for (let i = 0; i < 7; i++) original.nextUint32()

    const restored = SeededRng.fromState(original.state())

    for (let i = 0; i < 50; i++)
      expect(restored.nextInt(1, 20)).toBe(original.nextInt(1, 20))
  })

  it('state() devolve uma cópia (mudar o array não afeta o RNG)', () => {
    const rng = SeededRng.fromSeed(42)
    const state = rng.state() as unknown as number[]
    state[0] = 0

    expect(rng.state()[0]).toBe(2526348523)
  })

  it('REQ-22: nextInt(1, 6) com semente 42 segue a referência (rejeição sem viés)', () => {
    const rng = SeededRng.fromSeed(42)

    expect(Array.from({ length: 10 }, () => rng.nextInt(1, 6))).toEqual([
      6, 6, 2, 1, 2, 2, 4, 3, 6, 1,
    ])
  })

  it('nextInt fica dentro da faixa inclusiva e alcança as duas bordas', () => {
    const rng = SeededRng.fromSeed(7)
    const seen = new Set<number>()

    for (let i = 0; i < 2000; i++) {
      const value = rng.nextInt(-2, 2)
      expect(value).toBeGreaterThanOrEqual(-2)
      expect(value).toBeLessThanOrEqual(2)
      seen.add(value)
    }

    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2])
  })

  it('nextInt com min = max devolve o próprio valor', () => {
    expect(SeededRng.fromSeed(1).nextInt(5, 5)).toBe(5)
  })

  it('nextInt aceita a faixa máxima de 2^32 valores', () => {
    const value = SeededRng.fromSeed(42).nextInt(0, 4294967295)
    expect(value).toBe(1264412219)
  })

  it('rejeita argumentos inválidos (erro de programação, não de regra)', () => {
    const rng = SeededRng.fromSeed(1)

    expect(() => rng.nextInt(3, 2)).toThrow(RangeError)
    expect(() => rng.nextInt(1.5, 2)).toThrow(RangeError)
    expect(() => rng.nextInt(0, 4294967296)).toThrow(RangeError)
    expect(() => SeededRng.fromSeed(-1)).toThrow(RangeError)
    expect(() => SeededRng.fromSeed(4294967296)).toThrow(RangeError)
    expect(() => SeededRng.fromSeed(0.5)).toThrow(RangeError)
    expect(() => SeededRng.fromState([1, 2, 3] as never)).toThrow(RangeError)
    expect(() => SeededRng.fromState([1, 2, 3, -1])).toThrow(RangeError)
    expect(() => SeededRng.fromState([1, 2, 3, 0.5])).toThrow(RangeError)
    expect(() => SeededRng.fromState([1, 2, 3, NaN])).toThrow(RangeError)
    expect(() => SeededRng.fromState([1, 2, 3, 4294967296])).toThrow(RangeError)
  })
})
