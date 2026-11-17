import type { SeededRng } from '@/core/rng/seeded-rng'

/** Fisher–Yates com `nextInt` (D-38): devolve uma cópia embaralhada. */
export function shuffle<T>(items: readonly T[], rng: SeededRng): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i)
    const swap = result[i]
    result[i] = result[j]
    result[j] = swap
  }
  return result
}
