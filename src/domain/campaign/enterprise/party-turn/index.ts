import type { UniqueEntityID } from '@/core/entities/unique-entity-id'

/**
 * De quem é a vez (README 2.1, 11.1; D-63). `round` começa em 1;
 * `actionPoints` vai de `actionPointsPerTurn` a 0.
 */
export type TPartyTurn = Readonly<{
  round: number
  memberId: UniqueEntityID
  actionPoints: number
}>
