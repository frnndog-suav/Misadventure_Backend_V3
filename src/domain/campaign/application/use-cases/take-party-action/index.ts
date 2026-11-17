import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { parsePartyAction } from '@/domain/campaign/enterprise/party-action'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TAttributeCard,
  TClassDefinition,
} from '@/domain/catalog/enterprise/value-objects/card'

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
 * Uma intenção de jogo (D-62; REQ-51 a REQ-53, REQ-56, REQ-57, REQ-63 a REQ-66). Ordem: grupo →
 * corpo → sessão → regra. Grava só no sucesso (REQ-25). Quem age é o membro da
 * vez (D-63).
 */
export class TakePartyActionUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly clock: Clock,
    private readonly cardCatalog: CardCatalog
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
      case 'recover': {
        const recovered = party.recover(action.option, this.clock.now())
        if (recovered.isLeft()) {
          const reason = recovered.value
          switch (reason) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            case 'noActionPoints':
              return left(new ActionNotAllowedError('noActionPoints'))
            default: {
              const _exhaustive: never = reason
              return _exhaustive
            }
          }
        }
        break
      }
      case 'adjustDeck': {
        const adjusted = party.adjustDeck(
          action.build,
          await this.findDeckCatalog(party),
          this.clock.now()
        )
        if (adjusted.isLeft()) {
          const refusal = adjusted.value
          if (typeof refusal === 'object') {
            return left(
              new ActionNotAllowedError(refusal.reason, refusal.cardId)
            )
          }
          switch (refusal) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            case 'noActionPoints':
            case 'buildBelowMinimum':
            case 'tcgFolderFull':
              return left(new ActionNotAllowedError(refusal))
            default: {
              const _exhaustive: never = refusal
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

  /**
   * O que o Ajustar deck precisa do catálogo (D-71): as cartas de atributo
   * que o jogador tem (build e pasta) e as classes dele. Carta ou classe que
   * o catálogo não tem fica de fora (o agregado trata como sem limite e
   * mantém a trava).
   */
  private async findDeckCatalog(
    party: Party
  ): Promise<{ cards: TAttributeCard[]; classes: TClassDefinition[] }> {
    const actor = party.members.find((member) =>
      member.id.equals(party.turn.memberId)
    )
    const cardIds = new Set(
      [...(actor?.player.build ?? []), ...(actor?.player.tcgFolder ?? [])].map(
        (entry) => entry.cardId
      )
    )
    const cards: TAttributeCard[] = []
    for (const cardId of cardIds) {
      const card = await this.cardCatalog.findCard(cardId)
      if (card?.type === 'attribute') cards.push(card)
    }
    const classes: TClassDefinition[] = []
    for (const { playerClass } of actor?.player.playerClasses ?? []) {
      const definition = await this.cardCatalog.findClass(playerClass)
      if (definition) classes.push(definition)
    }
    return { cards, classes }
  }
}
