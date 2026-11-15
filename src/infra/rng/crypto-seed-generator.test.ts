import { describe, expect, it } from 'vitest'
import { SeededRng } from '@/core/rng/seeded-rng'
import { CryptoSeedGenerator } from './crypto-seed-generator'

describe('CryptoSeedGenerator (D-26)', () => {
  it('gera sementes inteiras em [0, 2^32 - 1] aceitas pelo SeededRng', () => {
    const seeds = new CryptoSeedGenerator()
    for (let i = 0; i < 50; i++) {
      const seed = seeds.next()
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(4294967295)
      expect(() => SeededRng.fromSeed(seed)).not.toThrow()
    }
  })
})
