/**
 * Porta da única fonte de entropia (D-26): devolve uma semente inteira em
 * [0, 2^32 - 1] para `SeededRng.fromSeed`. O adaptador real fica no infra.
 */
export abstract class SeedGenerator {
  abstract next(): number
}
