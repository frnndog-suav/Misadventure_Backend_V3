import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { parsePartyAction } from '@/domain/campaign/enterprise/party-action'

import { ActionInvalidError } from '../_errors/action-invalid-error'
import { ActionNotAllowedError } from '../_errors/action-not-allowed-error'
import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { PartySessionNotActiveError } from '../_errors/party-session-not-active-error'

export interface TTakePartyActionUseCaseRequest {
  partyId: string
  /** Corpo do POST, ainda não validado (D-62). */
  body: unknown
}

export type TTakePartyActionUseCaseResponse = Either<
  | PartyNotFoundError
  | ActionInvalidError
  | PartySessionNotActiveError
  | ActionNotAllowedError,
  { party: Party }
>

/**
 * Uma intenção de jogo (D-62; REQ-51 a REQ-53, REQ-56, REQ-57). Ordem: grupo →
 * corpo → sessão → regra. Grava só no sucesso (REQ-25). Quem age é o membro da
 * vez (D-63).
 */
export class TakePartyActionUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly clock: Clock
  ) {}

  async execute({
    partyId,
    body,
  }: TTakePartyActionUseCaseRequest): Promise<TTakePartyActionUseCaseResponse> {
    const party = await this.partiesRepository.findById(partyId)
    if (!party) {
      return left(new PartyNotFoundError())
    }

    const parsed = parsePartyAction(body)
    if (parsed.isLeft()) {
      return left(new ActionInvalidError(parsed.value))
    }

    const action = parsed.value
    switch (action.type) {
      case 'move': {
        const moved = party.move(action.zoneId, this.clock.now())
        if (moved.isLeft()) {
          const reason = moved.value
          switch (reason) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            case 'zoneNotInMap':
              return left(
                new ActionInvalidError([
                  { field: 'zoneId', reason: 'zoneNotInMap' },
                ])
              )
            case 'noActionPoints':
              return left(new ActionNotAllowedError('noActionPoints'))
            case 'notConnected':
              return left(new ActionNotAllowedError('notConnected'))
            default: {
              const _exhaustive: never = reason
              return _exhaustive
            }
          }
        }
        break
      }
      case 'endTurn': {
        const ended = party.endTurn(this.clock.now())
        if (ended.isLeft()) {
          const reason = ended.value
          switch (reason) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            default: {
              const _exhaustive: never = reason
              return _exhaustive
            }
          }
        }
        break
      }
      default: {
        const _exhaustive: never = action
        return _exhaustive
      }
    }

    await this.partiesRepository.save(party)

    return right({ party })
  }
}
