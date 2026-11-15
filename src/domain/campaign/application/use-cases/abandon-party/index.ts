import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'

import { PartyNotFoundError } from '../_errors/party-not-found-error'

export interface TAbandonPartyUseCaseRequest {
  partyId: string
}

/** Devolve o grupo apagado só para o infra puxar o `PartyAbandoned`. */
export type TAbandonPartyUseCaseResponse = Either<
  PartyNotFoundError,
  { party: Party }
>

/** Abandonar (REQ-24): apaga o save inteiro, em qualquer status. */
export class AbandonPartyUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly clock: Clock
  ) {}

  async execute({
    partyId,
  }: TAbandonPartyUseCaseRequest): Promise<TAbandonPartyUseCaseResponse> {
    const party = await this.partiesRepository.findById(partyId)
    if (!party) {
      return left(new PartyNotFoundError())
    }

    party.abandon(this.clock.now())
    await this.partiesRepository.delete(party)

    return right({ party })
  }
}
