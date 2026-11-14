import type { UniqueEntityID } from '../../entities/unique-entity-id'

/** Porta de geração de ids (Constituição 3). */
export abstract class IdGenerator {
  abstract next(): UniqueEntityID
}
