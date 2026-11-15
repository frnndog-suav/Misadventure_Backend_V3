import { type Either, left, right } from '@/core/error/either'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'

import { PartyNotFoundError } from '../_errors/party-not-found-error'

export interface TGetPartyUseCaseRequest {
  partyId: string
}

export type TGetPartyUseCaseResponse = Either<
  PartyNotFoundError,
  { party: Party }
>

/** Um save (REQ-19). */
export class GetPartyUseCase {
  constructor(private readonly partiesRepository: PartiesRepository) {}

  async execute({
    partyId,
  }: TGetPartyUseCaseRequest): Promise<TGetPartyUseCaseResponse> {
    const party = await this.partiesRepository.findById(partyId)
    if (!party) {
      return left(new PartyNotFoundError())
    }

    return right({ party })
  }
}
