import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'

import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { PartySessionNotActiveError } from '../_errors/party-session-not-active-error'

export interface TEndSessionUseCaseRequest {
  partyId: string
}

export type TEndSessionUseCaseResponse = Either<
  PartyNotFoundError | PartySessionNotActiveError,
  { party: Party }
>

/** Encerrar sessão (REQ-21); grava ao terminar com sucesso (REQ-25). */
export class EndSessionUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly clock: Clock
  ) {}

  async execute({
    partyId,
  }: TEndSessionUseCaseRequest): Promise<TEndSessionUseCaseResponse> {
    const party = await this.partiesRepository.findById(partyId)
    if (!party) {
      return left(new PartyNotFoundError())
    }

    const result = party.endSession(this.clock.now())
    if (result.isLeft()) {
      return left(new PartySessionNotActiveError())
    }

    await this.partiesRepository.save(party)

    return right({ party })
  }
}
