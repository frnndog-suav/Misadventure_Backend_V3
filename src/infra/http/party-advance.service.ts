import { isDeepStrictEqual } from 'node:util'
import { Injectable } from '@nestjs/common'
import {
  ActionAdvancePendingError,
  ActionIdempotencyConflictError,
} from '@/domain/campaign/application/use-cases/_errors/action-advance-errors'
import { ActionInvalidError } from '@/domain/campaign/application/use-cases/_errors/action-invalid-error'
import { PartyNotFoundError } from '@/domain/campaign/application/use-cases/_errors/party-not-found-error'
import { PartySessionNotActiveError } from '@/domain/campaign/application/use-cases/_errors/party-session-not-active-error'
import { StartSessionUseCase } from '@/domain/campaign/application/use-cases/start-session'
import { TakePartyActionUseCase } from '@/domain/campaign/application/use-cases/take-party-action'
import type { TCombatUpdate } from '@/domain/campaign/enterprise/combat'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import {
  DrizzlePartiesRepository,
  UUID,
} from '../database/drizzle/repositories/drizzle-parties-repository'
import type { TPartyActionHttp } from '../database/drizzle/schema/parties'
import { DomainErrorException } from './errors/domain-error-exception'
import {
  findPartyCards,
  PartyPresenter,
  type TPartyHttp,
} from './presenters/party-presenter'

function hasAiTurn(party: Party): boolean {
  return (
    party.status === 'inSession' &&
    party.members.some(
      ({ id, kind }) => kind === 'aiHelper' && id.equals(party.turn.memberId)
    )
  )
}

@Injectable()
export class PartyAdvanceService {
  constructor(
    private readonly parties: DrizzlePartiesRepository,
    private readonly actions: TakePartyActionUseCase,
    private readonly sessions: StartSessionUseCase,
    private readonly catalog: CardCatalog
  ) {}

  async takeAction(
    partyId: string,
    body: unknown,
    header: string | undefined
  ): Promise<TPartyActionHttp> {
    const key = typeof header === 'string' ? header.toLowerCase() : undefined
    const response = await this.parties.withLockedParty(
      partyId,
      async (party, save, receipts) => {
        if (!party) throw new DomainErrorException(new PartyNotFoundError())
        const hasHelpers = party.members.some(({ kind }) => kind === 'aiHelper')
        if (hasHelpers && (!key || !UUID.test(key))) {
          throw new DomainErrorException(
            new ActionInvalidError([
              { field: 'Idempotency-Key', reason: 'invalidIdempotencyKey' },
            ])
          )
        }
        const parsed = this.actions.parseAction(body)
        if (parsed.isLeft()) throw new DomainErrorException(parsed.value)
        const action = parsed.value

        if (hasHelpers && key) {
          const previous = await receipts.find(key)
          if (previous) {
            if (
              !isDeepStrictEqual(
                previous.action,
                JSON.parse(JSON.stringify(action))
              )
            )
              throw new DomainErrorException(
                new ActionIdempotencyConflictError()
              )
            return previous.response
          }
          if (await receipts.findPending())
            throw new DomainErrorException(new ActionAdvancePendingError())
        }

        const applied = await this.actions.executeHumanAction(party, action)
        if (applied.isLeft()) throw new DomainErrorException(applied.value)
        const combatUpdates = party.combatUpdates
        const response = hasAiTurn(party)
          ? null
          : await this.present(party, combatUpdates)
        await save(party)
        if (hasHelpers && key)
          await receipts.save({ key, action, combatUpdates, response })
        return response
      }
    )
    return response ?? this.advance(partyId, key)
  }

  async startSession(partyId: string): Promise<TPartyHttp> {
    const started = await this.sessions.execute({ partyId })
    if (started.isLeft()) throw new DomainErrorException(started.value)
    const { party } = started.value
    if (!party.members.some(({ kind }) => kind === 'aiHelper'))
      return this.presentParty(party)
    const snapshot: TPartyHttp & { combatUpdates?: readonly TCombatUpdate[] } =
      await this.advance(partyId)
    delete snapshot.combatUpdates
    return snapshot
  }

  private async advance(
    partyId: string,
    key?: string
  ): Promise<TPartyActionHttp> {
    for (;;) {
      // A próxima iteração só começa após o commit desta vez e relê o save sob a trava.
      const response = await this.parties.withLockedParty(
        partyId,
        async (party, save, receipts) => {
          if (!party) throw new DomainErrorException(new PartyNotFoundError())
          const receipt = key
            ? await receipts.find(key)
            : await receipts.findPending()
          if (receipt?.response) return receipt.response
          if (key && party.status === 'idle')
            throw new DomainErrorException(new PartySessionNotActiveError())

          const combatUpdates = [...(receipt?.combatUpdates ?? [])]
          if (hasAiTurn(party)) {
            const result = await this.actions.executeAiTurn(party)
            if (result.isLeft()) throw new DomainErrorException(result.value)
            combatUpdates.push(...result.value.combatUpdates)
            await save(party)
          }

          const response = hasAiTurn(party)
            ? null
            : await this.present(party, combatUpdates)
          if (receipt && party.status !== 'idle')
            await receipts.save({ ...receipt, combatUpdates, response })
          return response
        }
      )
      if (response) return response
    }
  }

  private async present(
    party: Party,
    combatUpdates: readonly TCombatUpdate[]
  ): Promise<TPartyActionHttp> {
    return { ...(await this.presentParty(party)), combatUpdates }
  }

  private async presentParty(party: Party): Promise<TPartyHttp> {
    const [cards, classes] = await Promise.all([
      findPartyCards(this.catalog, party),
      this.catalog.listClasses(),
    ])
    return PartyPresenter.toHTTP(party, cards, classes)
  }
}
