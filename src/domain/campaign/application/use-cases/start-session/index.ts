import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import type { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'

import { DimensionInvalidError } from '../_errors/dimension-invalid-error'
import { PartyFrozenError } from '../_errors/party-frozen-error'
import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { findFrozenDimensionSuccessor } from '../find-dimension-successor'
import type { ResumeLegacyKnockout } from '../resume-legacy-knockout'

export interface TStartSessionUseCaseRequest {
  partyId: string
}

export type TStartSessionUseCaseResponse = Either<
  PartyNotFoundError | PartyFrozenError | DimensionInvalidError,
  { party: Party }
>

/** Continuar (REQ-20). Idempotente (D-29): só grava quando o grupo muda (REQ-25). */
export class StartSessionUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly clock: Clock,
    private readonly resumeKnockout: ResumeLegacyKnockout,
    private readonly catalog: CardCatalog
  ) {}

  execute({
    partyId,
  }: TStartSessionUseCaseRequest): Promise<TStartSessionUseCaseResponse> {
    return this.partiesRepository.withLockedParty(
      partyId,
      async (party, save) => {
        if (!party) return left(new PartyNotFoundError())
        const result = await this.open(party)
        if (result.isLeft()) return left(result.value)
        if (result.value) await save(party)
        return right({ party })
      }
    )
  }

  async open(
    party: Party
  ): Promise<Either<PartyFrozenError | DimensionInvalidError, boolean>> {
    const at = this.clock.now()
    if (party.status === 'frozen') {
      const successor = await findFrozenDimensionSuccessor(this.catalog, party)
      if (!successor) return left(new PartyFrozenError())
      const resumed = party.resumeFrozenDimension(successor, at)
      if (resumed.isLeft()) {
        const { dimensionCardId, problems } = resumed.value
        return left(new DimensionInvalidError(dimensionCardId, problems))
      }
      if (!resumed.value) return left(new PartyFrozenError())
      return right(true)
    }
    const started = party.startSession(at)
    const resumed = await this.resumeKnockout.execute(party, at)
    return right(started || resumed)
  }
}
