import { type Either, right } from '@/core/error/either'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import type { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { findFrozenDimensionSuccessor } from '../find-dimension-successor'

export type TListPartiesUseCaseResponse = Either<never, { parties: Party[] }>

/**
 * Lista global de saves (REQ-18, D-28): `savedAt` mais recente primeiro;
 * empate por `id` crescente (comparação por código de caractere, como D-23).
 */
export class ListPartiesUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly catalog: CardCatalog
  ) {}

  async execute(): Promise<TListPartiesUseCaseResponse> {
    const parties = await this.partiesRepository.findAll()

    const sorted = [...parties].sort((a, b) => {
      const bySavedAt = b.savedAt.getTime() - a.savedAt.getTime()
      if (bySavedAt !== 0) return bySavedAt
      const idA = a.id.toString()
      const idB = b.id.toString()
      return idA < idB ? -1 : idA > idB ? 1 : 0
    })

    const projected = await Promise.all(
      sorted.map(async (party) =>
        (await findFrozenDimensionSuccessor(this.catalog, party))
          ? party.projectFrozenAsIdle()
          : party
      )
    )
    return right({ parties: projected })
  }
}
