import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'

import { PartyNotFoundError } from '../_errors/party-not-found-error'

export interface TStartSessionUseCaseRequest {
  partyId: string
}

export type TStartSessionUseCaseResponse = Either<
  PartyNotFoundError,
  { party: Party }
>

/** Continuar (REQ-20). Idempotente (D-29): só grava quando o grupo muda (REQ-25). */
export class StartSessionUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly clock: Clock
  ) {}

  execute({
    partyId,
  }: TStartSessionUseCaseRequest): Promise<TStartSessionUseCaseResponse> {
    return this.partiesRepository.withLockedParty(
      partyId,
      async (party, save) => {
        if (!party) return left(new PartyNotFoundError())
        if (party.startSession(this.clock.now())) await save(party)
        return right({ party })
      }
    )
  }
}
