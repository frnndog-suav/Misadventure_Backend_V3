import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { parseLabGrant } from '@/domain/campaign/enterprise/lab-grant'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'

import { LabGrantInvalidError } from '../_errors/lab-grant-invalid-error'
import { LabGrantNoSpaceError } from '../_errors/lab-grant-no-space-error'
import { MemberNotFoundError } from '../_errors/member-not-found-error'
import { PartyNotFoundError } from '../_errors/party-not-found-error'

export interface TGrantToMemberUseCaseRequest {
  partyId: string
  memberId: string
  /** Corpo do POST, ainda não validado. */
  body: unknown
}

export type TGrantToMemberUseCaseResponse = Either<
  | PartyNotFoundError
  | MemberNotFoundError
  | LabGrantInvalidError
  | CardNotFoundError
  | LabGrantNoSpaceError,
  { party: Party }
>

/**
 * Doação do laboratório (REQ-76, REQ-77; D-78). Ordem do contrato (FEAT-10):
 * grupo → membro → corpo → carta (só publicada, pelo `CardCatalog`) → tipo
 * que se doa → espaço. Grava só no sucesso (REQ-25).
 */
export class GrantToMemberUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly clock: Clock,
    private readonly cardCatalog: CardCatalog
  ) {}

  execute({
    partyId,
    memberId,
    body,
  }: TGrantToMemberUseCaseRequest): Promise<TGrantToMemberUseCaseResponse> {
    return this.partiesRepository.withLockedParty(partyId, (party, save) =>
      this.grant(party, memberId, body, save)
    )
  }

  private async grant(
    party: Party | null,
    memberId: string,
    body: unknown,
    save: (party: Party) => Promise<void>
  ): Promise<TGrantToMemberUseCaseResponse> {
    if (!party) return left(new PartyNotFoundError())

    const member = party.members.find((m) => m.id.toString() === memberId)
    if (!member) return left(new MemberNotFoundError())

    const parsed = parseLabGrant(body)
    if (parsed.isLeft()) return left(new LabGrantInvalidError(parsed.value))
    const request = parsed.value

    let granted: ReturnType<Party['grant']>
    switch (request.type) {
      case 'card': {
        const card = await this.cardCatalog.findCard(request.cardId)
        if (!card) return left(new CardNotFoundError())
        if (
          card.type !== 'equipment' &&
          card.type !== 'item' &&
          card.type !== 'attribute'
        ) {
          return left(
            new LabGrantInvalidError([
              { field: 'cardId', reason: 'notGrantable' },
            ])
          )
        }
        granted = party.grant(
          member.id,
          { type: 'card', card, quantity: request.quantity },
          this.clock.now()
        )
        break
      }
      case 'gold':
        granted = party.grant(member.id, request, this.clock.now())
        break
      default: {
        const _exhaustive: never = request
        return _exhaustive
      }
    }

    if (granted.isLeft()) {
      const reason = granted.value
      switch (reason) {
        case 'memberNotFound':
          return left(new MemberNotFoundError())
        case 'inventoryFull':
        case 'tcgFolderFull':
          return left(new LabGrantNoSpaceError(reason))
        default: {
          const _exhaustive: never = reason
          return _exhaustive
        }
      }
    }

    await save(party)
    return right({ party })
  }
}
