import { SeedGenerator } from '@/core/ports/seed-generator'

class FixedSeed extends SeedGenerator {
  constructor(private readonly seed: number) {
    super()
  }

  next(): number {
    return this.seed
  }
}

/** Sempre a mesma semente. */
export const fixedSeed = (seed = 42): SeedGenerator => new FixedSeed(seed)
