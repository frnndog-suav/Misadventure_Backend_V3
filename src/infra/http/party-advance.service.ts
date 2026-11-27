import { randomUUID } from 'node:crypto'
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
import type {
  TAutomaticTurnEvent,
  TPublicDomainEvent,
} from '@/domain/campaign/enterprise/ai-turn/public-events'
import type { TCombatUpdate } from '@/domain/campaign/enterprise/combat'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import {
  DrizzlePartiesRepository,
  UUID,
} from '../database/drizzle/repositories/drizzle-parties-repository'
import type {
  TPartyActionHttp,
  TPartySessionHttp,
  TStoredPartyActionHttp,
} from '../database/drizzle/schema/parties'
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

function awaitsHuman(party: Party): boolean {
  return Boolean(
    party.pendingCombatDecision ||
    party.triggeredEffectChoice?.memberId === party.hostMemberId.toString()
  )
}

function automaticTurnContext(party: Party) {
  return {
    memberId: party.turn.memberId.toString(),
    round: party.turn.round,
    dimensionId: party.dimension.dimensionCardId,
  }
}

function closeAutomaticTurn(
  party: Party,
  context: ReturnType<typeof automaticTurnContext>,
  events: TAutomaticTurnEvent[]
) {
  events.push({
    type: 'turnEnded',
    payload: {
      reason:
        party.status === 'frozen'
          ? 'frozen'
          : party.dimension.dimensionCardId !== context.dimensionId
            ? 'dimensionChanged'
            : 'passed',
    },
  })
}

function publicEvents(
  party: Party,
  context: ReturnType<typeof automaticTurnContext>,
  events: readonly TAutomaticTurnEvent[],
  combatOffset = 0
): TPublicDomainEvent[] {
  return events.map((event, index) => {
    const position = { ...context, id: `${party.revision}-${index}` }
    return event.type === 'combatUpdated'
      ? {
          ...event,
          ...position,
          payload: {
            ...event.payload,
            combatUpdateIndex: event.payload.combatUpdateIndex + combatOffset,
          },
        }
      : { ...event, ...position }
  })
}

function validKey(
  header: string | undefined,
  required: boolean
): string | undefined {
  if (typeof header === 'string' && UUID.test(header))
    return header.toLowerCase()
  if (header !== undefined || required)
    throw new DomainErrorException(
      new ActionInvalidError([
        { field: 'Idempotency-Key', reason: 'invalidIdempotencyKey' },
      ])
    )
  return undefined
}

function restoreReceipt(response: TStoredPartyActionHttp): TPartyActionHttp {
  return {
    ...response,
    revision: response.revision ?? 0,
    domainEvents: response.domainEvents ?? [],
  }
}

function sessionProjection(response: TPartyActionHttp): TPartySessionHttp {
  const snapshot: TPartySessionHttp &
    Partial<Pick<TPartyActionHttp, 'combatUpdates'>> = { ...response }
  delete snapshot.combatUpdates
  return snapshot
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
    const { response, key } = await this.parties.withLockedParty(
      partyId,
      async (party, save, receipts) => {
        if (!party) throw new DomainErrorException(new PartyNotFoundError())
        if (party.status === 'idle')
          throw new DomainErrorException(new PartySessionNotActiveError())
        const hasHelpers = party.members.some(({ kind }) => kind === 'aiHelper')
        const key = hasHelpers ? validKey(header, true) : undefined
        const parsed = this.actions.parseAction(body)
        if (parsed.isLeft()) throw new DomainErrorException(parsed.value)
        const action = parsed.value

        if (hasHelpers && key) {
          const previous = await receipts.find('action', key)
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
            return {
              key,
              response: previous.response && restoreReceipt(previous.response),
            }
          }
        }
        if ((await receipts.findPending()).length)
          throw new DomainErrorException(new ActionAdvancePendingError())

        const context = automaticTurnContext(party)
        const events: TAutomaticTurnEvent[] = []
        if (party.automaticTurnPaused) party.recordAutomaticTurn(events)
        const applied = await this.actions.executeHumanAction(party, action)
        party.recordAutomaticTurn(undefined)
        if (applied.isLeft()) throw new DomainErrorException(applied.value)
        if (
          party.automaticTurnPaused &&
          (!hasAiTurn(party) ||
            !isDeepStrictEqual(context, automaticTurnContext(party)))
        ) {
          party.setAutomaticTurnPaused(false)
          closeAutomaticTurn(party, context, events)
        }
        const combatUpdates = party.combatUpdates
        await save(party)
        const domainEvents = publicEvents(party, context, events)
        const response =
          hasAiTurn(party) && !awaitsHuman(party)
            ? null
            : await this.present(party, combatUpdates, domainEvents)
        if (hasHelpers && key)
          await receipts.save({
            route: 'action',
            key,
            action,
            combatUpdates,
            domainEvents,
            response,
          })
        return { response, key }
      }
    )
    if (response) return response
    if (!key) throw new Error('Ação pendente sem chave')
    return this.advance(partyId, 'action', key)
  }

  async startSession(
    partyId: string,
    header: string | undefined
  ): Promise<TPartySessionHttp> {
    const key = validKey(header, false)
    const route = key ? 'session' : 'advance'
    const receiptKey = key ?? randomUUID()
    const response = await this.parties.withLockedParty(
      partyId,
      async (party, save, receipts) => {
        if (!party) throw new DomainErrorException(new PartyNotFoundError())
        const previous = key && (await receipts.find(route, key))
        if (previous && previous.response)
          return restoreReceipt(previous.response)
        const [pending] = await receipts.findPending()
        if (party.status !== 'inSession' || (!pending && !awaitsHuman(party))) {
          const opened = await this.sessions.open(party)
          if (opened.isLeft()) throw new DomainErrorException(opened.value)
          if (opened.value) await save(party)
        }
        if (previous) return null
        const { combatUpdates = [], domainEvents = [] } = pending ?? {}
        const result =
          pending || (hasAiTurn(party) && !awaitsHuman(party))
            ? null
            : await this.present(party, combatUpdates, domainEvents)
        if (key || !result)
          await receipts.save({
            route,
            key: receiptKey,
            action: null,
            combatUpdates,
            domainEvents,
            response: result,
          })
        return result
      }
    )
    return sessionProjection(
      response ?? (await this.advance(partyId, route, receiptKey))
    )
  }

  private async advance(
    partyId: string,
    route: 'action' | 'session' | 'advance',
    key: string
  ): Promise<TPartyActionHttp> {
    for (;;) {
      const response = await this.parties.withLockedParty(
        partyId,
        async (party, save, receipts) => {
          if (!party) throw new DomainErrorException(new PartyNotFoundError())
          const receipt = await receipts.find(route, key)
          if (!receipt) throw new Error('Recibo de avanço ausente')
          if (receipt.response) return restoreReceipt(receipt.response)
          if (party.status === 'idle')
            throw new DomainErrorException(new PartySessionNotActiveError())

          const combatUpdates = [...receipt.combatUpdates]
          const domainEvents = [...receipt.domainEvents]
          if (hasAiTurn(party) && !awaitsHuman(party)) {
            const context = automaticTurnContext(party)
            const { memberId, actionPoints } = party.turn
            const zoneId = party.members.find(({ id }) => id.equals(memberId))!
              .player.zoneId
            const events: TAutomaticTurnEvent[] = party.automaticTurnPaused
              ? []
              : [{ type: 'turnStarted', payload: { zoneId, actionPoints } }]
            party.recordAutomaticTurn(events)
            let result
            try {
              result = await this.actions.executeAiTurn(party)
            } finally {
              party.recordAutomaticTurn(undefined)
            }
            if (result.isLeft()) throw new DomainErrorException(result.value)
            const paused =
              awaitsHuman(party) &&
              isDeepStrictEqual(context, automaticTurnContext(party))
            party.setAutomaticTurnPaused(paused)
            if (!paused) closeAutomaticTurn(party, context, events)
            await save(party)
            domainEvents.push(
              ...publicEvents(party, context, events, combatUpdates.length)
            )
            combatUpdates.push(...result.value.combatUpdates)
          }

          const response =
            hasAiTurn(party) && !awaitsHuman(party)
              ? null
              : await this.present(party, combatUpdates, domainEvents)
          for (const pending of await receipts.findPending())
            await receipts.save({
              ...pending,
              combatUpdates,
              domainEvents,
              response,
            })
          return response
        }
      )
      if (response) return response
    }
  }

  private async present(
    party: Party,
    combatUpdates: readonly TCombatUpdate[],
    domainEvents: readonly TPublicDomainEvent[]
  ): Promise<TPartyActionHttp> {
    return { ...(await this.presentParty(party)), combatUpdates, domainEvents }
  }

  private async presentParty(party: Party): Promise<TPartyHttp> {
    const [cards, classes] = await Promise.all([
      findPartyCards(this.catalog, party),
      this.catalog.listClasses(),
    ])
    return PartyPresenter.toHTTP(party, cards, classes)
  }
}
