import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'

import { PartyNotFoundError } from '../_errors/party-not-found-error'
import type { ResumeLegacyKnockout } from '../resume-legacy-knockout'

export interface TGetPartyUseCaseRequest {
  partyId: string
}

export type TGetPartyUseCaseResponse = Either<
  PartyNotFoundError,
  { party: Party }
>

/** Um save (REQ-19). */
export class GetPartyUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly clock: Clock,
    private readonly resumeKnockout: ResumeLegacyKnockout
  ) {}

  async execute({
    partyId,
  }: TGetPartyUseCaseRequest): Promise<TGetPartyUseCaseResponse> {
    return this.partiesRepository.withLockedParty(
      partyId,
      async (party, save) => {
        if (!party) return left(new PartyNotFoundError())
        if (await this.resumeKnockout.execute(party, this.clock.now()))
          await save(party)
        return right({ party })
      }
    )
  }
}
