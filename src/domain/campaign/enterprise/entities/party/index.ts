import type { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { type Either, left, right } from '@/core/error/either'
import { AggregateRoot } from '@/core/pattern/aggregate-root'
import type { IdGenerator } from '@/core/ports/id-generator'
import type { RngState } from '@/core/rng/seeded-rng'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import type { TPartyEvent } from '../../events/party-events'
import { PartyMember } from '../party-member'

/** Limites de CONTRATO FEAT-05 (`CreatePartyRequest`, D-30). */
export const PARTY_NAME_MAX_LENGTH = 40
export const CHARACTER_NAME_MAX_LENGTH = 24

/** Máquina de estados do save (D-27); `frozen` entra na FEAT-19. */
export type TPartyStatus = 'idle' | 'inSession'

/** Motivos de CONTRATO FEAT-05 (`PartyInvalidDetails`). */
export type TPartyIssue =
  | { field: null; reason: 'invalidBody' }
  | {
      field: 'name' | 'characterName'
      reason: 'required' | 'notString' | 'blank' | 'tooLong'
    }
  | { field: 'members'; reason: 'belowMinPlayers' }

export interface TPartyProps {
  name: string
  members: PartyMember[]
  hostMemberId: UniqueEntityID
  status: TPartyStatus
  /** Cópia da `GameConfig` na criação (D-11, REQ-23). */
  config: TGameConfigValues
  rngState: RngState
  createdAt: Date
  savedAt: Date
}

export interface TCreatePartyInput {
  /** Ainda não validados (REQ-17). */
  name: unknown
  characterName: unknown
  config: TGameConfigValues
  rngState: RngState
  now: Date
}

/** O grupo é o save (README 28.1, D-27). */
export class Party extends AggregateRoot<TPartyProps, TPartyEvent> {
  get name(): string {
    return this.props.name
  }

  get members(): readonly PartyMember[] {
    return [...this.props.members]
  }

  get hostMemberId(): UniqueEntityID {
    return this.props.hostMemberId
  }

  get status(): TPartyStatus {
    return this.props.status
  }

  get config(): TGameConfigValues {
    return { ...this.props.config }
  }

  get rngState(): RngState {
    return this.props.rngState
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get savedAt(): Date {
    return this.props.savedAt
  }

  isHost(member: PartyMember): boolean {
    return member.id.equals(this.props.hostMemberId)
  }

  /**
   * Grupo de 1 com o host (REQ-16, REQ-17). Os ids só são gerados quando os
   * dados são válidos. Problemas na ordem `name`, `characterName`, `members`.
   */
  static create(
    input: TCreatePartyInput,
    ids: IdGenerator
  ): Either<TPartyIssue[], Party> {
    const issues: TPartyIssue[] = []
    const name = checkName('name', input.name, PARTY_NAME_MAX_LENGTH, issues)
    const characterName = checkName(
      'characterName',
      input.characterName,
      CHARACTER_NAME_MAX_LENGTH,
      issues
    )
    const memberCount = 1
    if (memberCount < input.config.minPlayers) {
      issues.push({ field: 'members', reason: 'belowMinPlayers' })
    }

    if (issues.length > 0 || name === null || characterName === null) {
      return left(issues)
    }

    const partyId = ids.next()
    const host = PartyMember.create(
      { characterName, kind: 'human' },
      ids.next()
    )
    const party = new Party(
      {
        name,
        members: [host],
        hostMemberId: host.id,
        status: 'idle',
        config: { ...input.config },
        rngState: input.rngState,
        createdAt: input.now,
        savedAt: input.now,
      },
      partyId
    )
    party.addDomainEvent({
      type: 'PartyCreated',
      occurredAt: input.now,
      aggregateId: partyId,
    })
    return right(party)
  }

  /** Reconstrói um save gravado (repositórios, factories). Não registra eventos. */
  static restore(props: TPartyProps, id: UniqueEntityID): Party {
    return new Party(
      { ...props, members: [...props.members], config: { ...props.config } },
      id
    )
  }

  /**
   * Continuar (REQ-20). Já em sessão: nada muda (D-29). Devolve se mudou,
   * para o caso de uso só gravar quando há mudança.
   */
  startSession(at: Date): boolean {
    switch (this.props.status) {
      case 'inSession':
        return false
      case 'idle':
        this.props.status = 'inSession'
        this.props.savedAt = at
        this.addDomainEvent({
          type: 'SessionStarted',
          occurredAt: at,
          aggregateId: this.id,
        })
        return true
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }
  }

  /** Encerrar sessão (REQ-21). Fora de sessão é rejeitado e nada muda. */
  endSession(at: Date): Either<'sessionNotActive', void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        this.props.status = 'idle'
        this.props.savedAt = at
        this.addDomainEvent({
          type: 'SessionEnded',
          occurredAt: at,
          aggregateId: this.id,
        })
        return right(undefined)
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }
  }

  /** Abandonar (REQ-24): vale em qualquer status; o save é apagado pelo repositório. */
  abandon(at: Date): void {
    this.addDomainEvent({
      type: 'PartyAbandoned',
      occurredAt: at,
      aggregateId: this.id,
    })
  }
}

function checkName(
  field: 'name' | 'characterName',
  value: unknown,
  maxLength: number,
  issues: TPartyIssue[]
): string | null {
  if (value === undefined) {
    issues.push({ field, reason: 'required' })
    return null
  }
  if (typeof value !== 'string') {
    issues.push({ field, reason: 'notString' })
    return null
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    issues.push({ field, reason: 'blank' })
    return null
  }
  if (trimmed.length > maxLength) {
    issues.push({ field, reason: 'tooLong' })
    return null
  }
  return trimmed
}
