import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { IdGenerator } from '@/core/ports/id-generator'

/** Ids uuid v4 (D-26); a coluna `parties.id` é `uuid` (D-31). */
@Injectable()
export class UuidIdGenerator extends IdGenerator {
  next(): UniqueEntityID {
    return new UniqueEntityID(randomUUID())
  }
}
