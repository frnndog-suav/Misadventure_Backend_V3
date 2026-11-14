import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { IdGenerator } from '@/core/ports/id-generator'

class SequentialIds extends IdGenerator {
  private count = 0

  constructor(private readonly prefix: string) {
    super()
  }

  next(): UniqueEntityID {
    this.count += 1
    return new UniqueEntityID(`${this.prefix}-${this.count}`)
  }
}

/** Ids previsíveis: `<prefixo>-1`, `<prefixo>-2`… */
export const sequentialIds = (prefix = 'id'): IdGenerator =>
  new SequentialIds(prefix)
