import type { SeededRng } from '@/core/rng/seeded-rng'

/**
 * Ordem dos jogadores (README 11.2; REQ-33): cada um rola D20, do maior para o
 * menor; os empatados rolam de novo só entre si (na ordem recebida) até não
 * haver empate.
 */
export function rollTurnOrder<T>(members: readonly T[], rng: SeededRng): T[] {
  const rolled = members.map((member) => ({
    member,
    roll: rng.nextInt(1, 20),
  }))
  const rolls = [...new Set(rolled.map(({ roll }) => roll))].sort(
    (a, b) => b - a
  )

  return rolls.flatMap((roll) => {
    const tied = rolled.filter((r) => r.roll === roll).map((r) => r.member)
    return tied.length === 1 ? tied : rollTurnOrder(tied, rng)
  })
}
