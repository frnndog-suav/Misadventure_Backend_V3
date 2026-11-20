import type { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { type Either, left, right } from '@/core/error/either'
import { AggregateRoot } from '@/core/pattern/aggregate-root'
import type { IdGenerator } from '@/core/ports/id-generator'
import { type RngState, SeededRng } from '@/core/rng/seeded-rng'
import { isClassActive } from '@/domain/catalog/enterprise/class-lock'
import { isExecutableCombatEvent } from '@/domain/catalog/enterprise/catalog-integrity'
import { checkDimensionComposition } from '@/domain/catalog/enterprise/dimension-composition'
import type {
  TAttributeCard,
  TCard,
  TClassDefinition,
  TDimensionCard,
  TEquipmentCard,
  TItemCard,
  TRandomEventOutcomeStep,
  TStarterDeckEntry,
  TZoneAction,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import {
  isExecutableActivation,
  isStatusDuration,
  prepareEffect,
  type TActivateRefusal,
} from '../../activatable-effects'
import { connectedZones } from '../../connected-zones'
import {
  combatAttackTargets,
  combatIsTerminal,
  createCombat,
  resolveCombatTurn,
  type TCombatRefusal,
  type TCombatState,
} from '../../combat'
import { effectiveModifiers } from '../../effective-modifiers'
import { applyActivations } from '../../effect-activation'
import type { TPartyEvent } from '../../events/party-events'
import { addToInventory, type TInventorySlot } from '../../inventory'
import { assembleMap, type TPartyMap } from '../../map-assembly'
import type {
  TActivateOperation,
  TPrepareOperation,
  TRecoverOption,
  TVaultOperation,
  TRandomEventAction,
  TCombatAction,
  TPartyAction,
} from '../../party-action'
import {
  eventPayment,
  failedMinimums,
  handCopiesOf,
  isExecutableEvent,
  reconcileHand,
  requirementProgress,
  type TEscapeReceipt,
  type TEventDeck,
  type TEventEncounter,
  type TEventRefusal,
  type TEventResult,
  type TExecutableEvent,
} from '../../random-event'
import type { TPartyTurn } from '../../party-turn'
import { statusAfterTurn, type TPlayerStatus } from '../../player-status'
import {
  drawReserve,
  type TPendingReward,
  type TResolveRewardAction,
  type TRewardDelivery,
  type TRewardDiscard,
  type TRewardOrigin,
  type TRewardRefusal,
} from '../../rewards'
import { shuffle } from '../../shuffle'
import {
  createStartingPlayer,
  defaultModifiers,
  sortedByCardId,
} from '../../starting-player'
import {
  assembleRewardDecks,
  scavengeTargets,
  type TPartyRewardDeck,
} from '../../scavenge'
import { rollTurnOrder } from '../../turn-order'
import { applyVaultOperations, type TVaultRefusal } from '../../vault'
import { maxHealthOf, PartyMember, type TPlayerState } from '../party-member'

/** Limites de CONTRATO FEAT-05 (`CreatePartyRequest`, D-30). */
export const PARTY_NAME_MAX_LENGTH = 40
export const CHARACTER_NAME_MAX_LENGTH = 24

/** Máquina de estados do save (D-27); `frozen` entra na FEAT-19. */
export type TPartyStatus = 'idle' | 'inSession'

/** Motivos de CONTRATO FEAT-05/FEAT-06 (`PartyInvalidDetails`). */
export type TPartyIssue =
  | { field: null; reason: 'invalidBody' }
  | {
      field: 'name' | 'characterName'
      reason: 'required' | 'notString' | 'blank' | 'tooLong'
    }
  | { field: 'playerClass'; reason: 'required' | 'notString' | 'unknownClass' }
  | { field: 'members'; reason: 'belowMinPlayers' }

/** Por que a criação falhou: dados do pedido (REQ-17, REQ-35) ou conteúdo (REQ-36). */
export type TCreatePartyFailure =
  | { type: 'invalid'; issues: TPartyIssue[] }
  | {
      type: 'dimensionInvalid'
      dimensionCardId: string | null
      problems: string[]
    }

/** Por que o Ajustar deck foi recusado (REQ-66; D-71). */
export type TAdjustDeckRefusal =
  | 'sessionNotActive'
  | 'noActionPoints'
  | { reason: 'notOwned' | 'copyLimitExceeded'; cardId: string }
  | 'buildBelowMinimum'
  | 'tcgFolderFull'

/** Por que o Preparar foi recusado (REQ-74; D-79). */
export type TPrepareRefusal =
  | 'sessionNotActive'
  | TActivateRefusal
  | {
      cardId?: never
      reason:
        | 'notInInventory'
        | 'notEquipment'
        | 'peakRequirementNotMet'
        | 'classRestricted'
        | 'shieldBlocked'
        | 'inventoryFull'
        | 'slotEmpty'
    }

/** Por que o Usar cofre foi recusado (REQ-88; D-82). */
export type TUseVaultRefusal =
  | 'sessionNotActive'
  | 'noActionPoints'
  | 'zoneActionUnavailable'
  | TVaultRefusal

/** Por que o Vasculhar foi recusado (REQ-92; D-88). */
export type TScavengeRefusal =
  | 'sessionNotActive'
  | 'noActionPoints'
  | 'zoneActionUnavailable'
  | 'notScavengeable'
  | 'inventoryFull'

/** Doação do laboratório já resolvida no catálogo (REQ-77; D-78, D-79). */
export type TLabGrant =
  | {
      type: 'card'
      card: TEquipmentCard | TItemCard | TAttributeCard
      quantity: number
    }
  | { type: 'gold'; amount: number }

/** Dimensão do grupo (D-42; CONTRATO `PartyDimension`). */
export type TPartyDimension = Readonly<{
  dimensionCardId: string
  startingCityZoneId: string
  map: TPartyMap
}>

export interface TPartyProps {
  name: string
  members: PartyMember[]
  hostMemberId: UniqueEntityID
  status: TPartyStatus
  /** Cópia da `GameConfig` na criação (D-11, REQ-23). */
  config: TGameConfigValues
  rngState: RngState
  dimension: TPartyDimension
  /** Decks de recompensas por tipo de zona (README 3.4; REQ-89, D-87). */
  rewardDecks: readonly TPartyRewardDeck[]
  eventDecks?: readonly TEventDeck[]
  eventEncounter?: TEventEncounter | null
  combat?: TCombatState | null
  pendingReward?: TPendingReward | null
  rewardSequence?: number
  /** Ids de membro, do 1º ao último (REQ-33). */
  turnOrder: UniqueEntityID[]
  /** De quem é a vez (D-63, REQ-55). */
  turn: TPartyTurn
  createdAt: Date
  savedAt: Date
}

export interface TCreatePartyInput {
  /** Ainda não validados (REQ-17, REQ-35). */
  name: unknown
  characterName: unknown
  playerClass: unknown
  /** A classe publicada de `playerClass` (ou `null` se não houver). */
  classDefinition: TClassDefinition | null
  /** Cartas de atributo do `starterDeck` da classe. */
  attributeCards: readonly TAttributeCard[]
  /** A Carta de Dimensão publicada de menor `releaseOrder` (ou `null`). */
  dimension: TDimensionCard | null
  /** Zonas publicadas da coleção da dimensão. */
  zones: readonly TZoneCard[]
  config: TGameConfigValues
  rngState: RngState
  now: Date
}

/** Texto do limite de tentativas do gerador (D-44). */
export const mapAttemptsProblem = (attempts: number): string =>
  `O gerador não montou o mapa dentro do limite de tentativas (mapMaxAttempts = ${attempts}).`

/** O grupo é o save (README 28.1, D-27). */
function isPlayableEvent(card: TCard | undefined): boolean {
  return isExecutableEvent(card) || isExecutableCombatEvent(card)
}

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
    return structuredClone(this.props.config)
  }

  get rngState(): RngState {
    return this.props.rngState
  }

  get dimension(): TPartyDimension {
    return this.props.dimension
  }

  /** Ordem secreta: não trafega (REQ-89). */
  get rewardDecks(): readonly TPartyRewardDeck[] {
    return this.props.rewardDecks
  }

  get eventDecks(): readonly TEventDeck[] {
    return this.props.eventDecks ?? []
  }

  get eventEncounter(): TEventEncounter | null {
    return this.props.eventEncounter ?? null
  }

  get pendingRewards(): readonly TPendingReward[] {
    return this.props.pendingReward ? [this.props.pendingReward] : []
  }

  get rewardSequence(): number {
    return this.props.rewardSequence ?? 0
  }

  get randomEventEncounter() {
    return this.describeRandomEvent(this.eventCatalog)
  }

  describeRandomEvent(cards: ReadonlyMap<string, TCard>) {
    const encounter = this.eventEncounter
    if (!encounter) return null
    const player = this.props.members[this.actorIndex()].player
    return {
      id: encounter.id,
      memberId: encounter.memberId,
      zoneType: encounter.zoneType,
      phase: encounter.phase,
      card: encounter.card,
      payments: encounter.payments,
      decisionDeadlineAt: encounter.decisionDeadlineAt,
      requirements: requirementProgress(encounter, player, cards),
      escape:
        encounter.phase === 'encounter'
          ? this.eventEscape(encounter, player)
          : null,
    }
  }

  private eventCatalog: ReadonlyMap<string, TCard> = new Map()

  get combat() {
    const state = this.props.combat
    if (!state) return null
    const health = this.props.members[this.actorIndex()].player.health
    return { ...state, attackTargetIds: combatAttackTargets(state, health) }
  }

  eventActionBlock(
    action: TPartyAction
  ): TEventRefusal | TCombatRefusal | null {
    if ('combatId' in action) return null
    if (this.props.combat) return 'combatInProgress'
    if (action.type === 'resolveReward') return null
    if ('encounterId' in action) return null
    if (this.props.pendingReward) return 'choicePending'
    const encounter = this.eventEncounter
    if (!encounter) return null
    switch (action.type) {
      case 'prepare':
        if (encounter.outcome) return 'choicePending'
        if (encounter.payments.length) return 'eventPaymentStarted'
        return action.operation === 'activate' ? null : 'choicePending'
      default:
        return 'choicePending'
    }
  }

  canStartEvent(
    zone: TZoneCard | null,
    dimension: TDimensionCard | null,
    cards: ReadonlyMap<string, TCard>,
    combatEnabled = true
  ): boolean {
    if (!zone?.zoneActions.includes('startEvent')) return false
    const deck = this.eventDecks.find(
      (entry) => entry.zoneType === zone.zoneType
    )
    const ids = deck
      ? [...deck.cards, ...deck.discard]
      : (dimension?.eventDecks
          ?.find((entry) => entry.zoneType === zone.zoneType)
          ?.cards.map(({ cardId }) => cardId) ?? [])
    return ids.some((id) =>
      combatEnabled
        ? isPlayableEvent(cards.get(id))
        : isExecutableEvent(cards.get(id))
    )
  }

  combatActions(): TCombatAction['type'][] {
    const state = this.props.combat
    if (!state || state.turn.actorId !== state.memberId) return []
    const health = this.props.members[this.actorIndex()].player.health
    if (combatIsTerminal(state, health)) return []
    return combatAttackTargets(state, health).length
      ? ['combatAttack', 'endCombatTurn']
      : ['endCombatTurn']
  }

  private combatPlayer(
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>
  ) {
    const equipment = Object.values(player.equipment).flatMap((id) => {
      const card = id ? cards.get(id) : undefined
      return card?.type === 'equipment' ? [card] : []
    })
    return {
      health: player.health,
      modifiers: effectiveModifiers({
        ...player,
        equipment,
        combat: {
          exhaustionPenaltyPercent:
            player.vigor === 0 ? this.config.exhaustionPenaltyPercent : 0,
        },
      }),
    }
  }

  takeCombatAction(
    action: TCombatAction,
    cards: ReadonlyMap<string, TCard>,
    at: Date
  ): Either<TCombatRefusal, void> {
    const state = this.props.combat
    if (!state || state.id !== action.combatId) return left('staleCombat')
    if (state.turn.id !== action.turnId) return left('staleCombatTurn')
    const index = this.actorIndex()
    const player = this.props.members[index].player
    if (player.health === 0) return left('playerDown')
    if (!this.combatActions().includes(action.type))
      return left('wrongCombatPhase')
    const targetId =
      action.type === 'combatAttack' ? action.targetId : undefined
    if (
      targetId !== undefined &&
      !combatAttackTargets(state, player.health).includes(targetId)
    )
      return left('combatTargetUnavailable')

    const rng = SeededRng.fromState(this.props.rngState)
    const resolved = resolveCombatTurn(
      state,
      this.combatPlayer(player, cards),
      this.config,
      rng,
      targetId
    )
    this.props.combat = resolved.state
    this.props.rngState = rng.state()
    if (resolved.health !== player.health)
      this.replaceActor(index, { ...player, health: resolved.health })
    this.props.savedAt = at
    return right(undefined)
  }

  takeEventAction(
    action: TRandomEventAction,
    zone: TZoneCard | null,
    dimension: TDimensionCard | null,
    cards: ReadonlyMap<string, TCard>,
    at: Date,
    ids: IdGenerator | undefined,
    combatEnabled = true
  ): Either<TEventRefusal, void> {
    const index = this.actorIndex()
    const actor = this.props.members[index]
    const player = actor.player
    const encounter = this.eventEncounter
    const rng = SeededRng.fromState(this.props.rngState)
    const complete = (): Either<TEventRefusal, void> => {
      this.eventCatalog = cards
      this.props.rngState = rng.state()
      this.props.savedAt = at
      return right(undefined)
    }

    if (action.type === 'startEvent') {
      if (encounter) return left('choicePending')
      if (this.turn.actionPoints < 1) return left('noActionPoints')
      if (!zone?.zoneActions.includes('startEvent'))
        return left('zoneActionUnavailable')
      if (!this.canStartEvent(zone, dimension, cards, combatEnabled))
        return left('eventDeckEmpty')
      if (!this.eventDecks.some((entry) => entry.zoneType === zone.zoneType)) {
        const configured = dimension?.eventDecks?.find(
          (entry) => entry.zoneType === zone.zoneType
        )
        const initial =
          configured?.cards.flatMap(({ cardId, copies }) =>
            Array.from({ length: copies }, () => cardId)
          ) ?? []
        const eligible = (id: string) =>
          combatEnabled
            ? isPlayableEvent(cards.get(id))
            : isExecutableEvent(cards.get(id))
        this.updateEventDeck({
          zoneType: zone.zoneType,
          discard: [],
          cards: [
            ...shuffle(
              initial.filter(eligible),
              SeededRng.fromState(this.props.rngState)
            ),
            ...initial.filter((id) => !eligible(id)),
          ],
        })
      }
      const copies = handCopiesOf(player)
      this.replaceActor(index, {
        ...player,
        handCopies: copies,
        handCopySequence: player.handCopySequence ?? copies.length,
      })
      this.props.eventEncounter = {
        id:
          ids?.next().toValue() ??
          `event-${actor.id.toValue()}-${at.toISOString()}-${this.turn.round}-${this.turn.actionPoints}`,
        memberId: actor.id.toValue(),
        zoneType: zone.zoneType,
        phase: 'anticipation',
        card: null,
        payments: [],
        decisionDeadlineAt: null,
      }
      this.spendActionPoint()
      return complete()
    }
    if (!encounter || encounter.id !== action.encounterId)
      return left('staleEncounter')
    if (action.type === 'revealEvent') {
      if (encounter.phase !== 'anticipation') return left('wrongEventPhase')
      const deck = this.eventDecks.find(
        (entry) => entry.zoneType === encounter.zoneType
      )
      if (!deck) return left('eventDeckEmpty')
      const eligible = (id: string) => {
        const card = cards.get(id)
        return (
          isExecutableEvent(card) ||
          (combatEnabled && isExecutableCombatEvent(card))
        )
      }
      const recycle = !deck.cards.some(eligible)
      const ordered = recycle
        ? [...shuffle(deck.discard.filter(eligible), rng), ...deck.cards]
        : deck.cards
      const position = ordered.findIndex(eligible)
      const card = cards.get(ordered[position])
      if (
        !isExecutableEvent(card) &&
        !(combatEnabled && isExecutableCombatEvent(card))
      )
        return left('eventDeckEmpty')
      this.updateEventDeck({
        ...deck,
        cards: ordered.filter((_, i) => i !== position),
        discard: recycle
          ? deck.discard.filter((id) => !eligible(id))
          : deck.discard,
      })
      this.props.members[index] = this.updateStatuses(
        actor,
        (status) =>
          status.duration.kind === 'untilEventPhaseEnd' &&
          status.duration.phase === 'anticipation'
            ? null
            : status,
        at
      )
      if (isExecutableEvent(card)) {
        this.props.eventEncounter = { ...encounter, phase: 'encounter', card }
      } else {
        const current = this.props.members[index].player
        const fighter = this.combatPlayer(current, cards)
        const state = createCombat(
          encounter.id,
          card,
          encounter.memberId,
          fighter,
          this.config
        )
        const resolved =
          state.turn.actorId === state.memberId
            ? { state, health: current.health }
            : resolveCombatTurn(state, fighter, this.config, rng)
        this.props.eventEncounter = null
        this.props.combat = resolved.state
        if (resolved.health !== current.health)
          this.replaceActor(index, { ...current, health: resolved.health })
      }
      return complete()
    }
    if (encounter.phase !== 'encounter' || !encounter.card)
      return left('wrongEventPhase')
    const card = encounter.card
    const finish = (
      changed: TPlayerState,
      result: TEventResult['cause'],
      escape: TEscapeReceipt | null = null,
      paid = encounter.payments
    ) => {
      const completed = complete()
      this.finishEvent(
        index,
        encounter,
        card,
        changed,
        result,
        escape,
        paid,
        ids,
        cards
      )
      return completed
    }
    const tryResolve = (
      changed: TPlayerState,
      paid: TEventEncounter['payments']
    ) => {
      const checks = failedMinimums(card, changed, cards)
      return checks.length
        ? left<TEventRefusal, void>({ reason: 'eventMinimumNotMet', checks })
        : finish(changed, 'requirementsMet', null, paid)
    }
    switch (action.type) {
      case 'giveUpEvent':
        return finish(player, 'gaveUp')
      case 'resolveEvent':
        return requirementProgress(encounter, player, cards).some(
          ({ status }) => status === 'unpaid' || status === 'partial'
        )
          ? left('requirementsNotPaid')
          : tryResolve(player, encounter.payments)
      case 'payEventRequirement': {
        const payment = eventPayment(
          encounter,
          action.requirementId,
          action.payment,
          player,
          cards,
          rng
        )
        if (payment.isLeft()) return left(payment.value)
        const { player: changed, receipt } = payment.value
        const payments = [...encounter.payments, receipt]
        const updated = { ...encounter, payments }
        const isLast = !requirementProgress(updated, changed, cards).some(
          ({ status }) => status === 'unpaid' || status === 'partial'
        )
        if (isLast) {
          const resolved = tryResolve(changed, payments)
          if (resolved.isLeft()) return resolved
        } else {
          this.replaceActor(index, changed)
          this.props.eventEncounter = updated
        }
        for (const { cardId, copies } of receipt.resources ?? []) {
          this.addDomainEvent({
            type: 'SentToLimbo',
            cardId,
            quantity: copies,
            from: 'inventory',
            memberId: actor.id,
            occurredAt: at,
            aggregateId: this.id,
          })
        }
        for (const { cardId } of receipt.equipment ?? []) {
          this.addDomainEvent({
            type: 'SentToLimbo',
            cardId,
            quantity: 1,
            from: 'equipment',
            memberId: actor.id,
            occurredAt: at,
            aggregateId: this.id,
          })
        }
        return isLast ? right(undefined) : complete()
      }
      case 'escapeEvent': {
        const escape = this.eventEscape(encounter, player)
        if (escape.unavailableReason) return left(escape.unavailableReason)
        const naturalRoll = escape.automatic ? null : rng.nextInt(1, 20)
        const total =
          naturalRoll === null
            ? null
            : player.statuses
                .flatMap(({ activation }) => activation)
                .reduce(
                  (roll, effect) =>
                    effect.kind === 'diceResultModifier'
                      ? roll +
                        (effect.amount === 'minusHandCount'
                          ? -player.hand.length
                          : effect.amount)
                      : roll,
                  naturalRoll
                )
        const succeeded = total === null || total > escape.threshold
        const actionPointsLost =
          !succeeded && this.turn.actionPoints > 0 ? 1 : 0
        const nextTurnActionPointDebtAdded =
          !succeeded && actionPointsLost === 0 ? 1 : 0
        if (actionPointsLost) this.spendActionPoint()
        return finish(
          {
            ...player,
            vigor: player.vigor - escape.vigorCost,
            nextTurnActionPointDebt:
              (player.nextTurnActionPointDebt ?? 0) +
              nextTurnActionPointDebtAdded,
          },
          succeeded ? 'escapeSucceeded' : 'escapeFailed',
          {
            threshold: escape.threshold,
            naturalRoll,
            total,
            succeeded,
            vigorSpent: escape.vigorCost,
            actionPointsLost,
            nextTurnActionPointDebtAdded,
          }
        )
      }
    }
  }

  private eventEscape(
    encounter: TEventEncounter,
    player: TPlayerState
  ): {
    vigorCost: number
    threshold: number
    automatic: boolean
    unavailableReason:
      'eventPaymentStarted' | 'escapeForbidden' | 'notEnoughVigor' | null
  } {
    const automatic = player.automaticEventEscape === true
    const vigorCost = automatic
      ? 0
      : Math.max(
          1,
          Math.floor((player.peak * this.props.config.escapeVigorPercent) / 100)
        )
    const unavailableReason = encounter.payments.length
      ? 'eventPaymentStarted'
      : encounter.card?.noEscape || (!automatic && player.peak === 0)
        ? 'escapeForbidden'
        : player.vigor < vigorCost
          ? 'notEnoughVigor'
          : null
    const threshold = player.statuses
      .flatMap(({ activation }) => activation)
      .reduce((value, effect) => {
        if (effect.kind === 'fleeTargetOverride') return effect.value
        if (effect.kind === 'fleeTargetModifier')
          return (
            value +
            (effect.amount === 'minusHandCount'
              ? -player.hand.length
              : effect.amount)
          )
        return value
      }, encounter.card?.escapeThreshold ?? 10)
    return {
      vigorCost,
      threshold,
      automatic,
      unavailableReason,
    }
  }

  private updateEventDeck(deck: TEventDeck): void {
    this.props.eventDecks = [
      ...this.eventDecks.filter(({ zoneType }) => zoneType !== deck.zoneType),
      deck,
    ]
  }

  private finishEvent(
    index: number,
    encounter: TEventEncounter,
    card: TExecutableEvent,
    player: TPlayerState,
    cause: TEventResult['cause'],
    escape: TEscapeReceipt | null,
    payments: TEventEncounter['payments'],
    ids: IdGenerator | undefined,
    cards: ReadonlyMap<string, TCard>
  ): void {
    const resolution =
      cause === 'requirementsMet'
        ? 'success'
        : cause === 'escapeSucceeded'
          ? 'escaped'
          : 'setback'
    const startingPeak = encounter.outcome?.startingPeak ?? player.peak
    const outcome =
      resolution === 'success'
        ? card.goodOutcome
        : resolution === 'setback'
          ? card.badOutcome
          : null
    if (outcome && resolution !== 'escaped') {
      const firstStep = encounter.outcome?.nextStep ?? 0
      for (
        let nextStep = firstStep;
        nextStep < outcome.steps.length;
        nextStep++
      ) {
        const step = outcome.steps[nextStep]
        if (step.type === 'effect') {
          player = this.applyEventOutcomeEffect(
            player,
            step.effect,
            card.id,
            nextStep,
            encounter.id,
            resolution,
            ids
          )
          continue
        }
        const count =
          step.type === 'searchReward'
            ? 1
            : step.type === 'drawRewards'
              ? step.count
              : step.copies
        const firstCopy =
          nextStep === firstStep ? (encounter.outcome?.nextCopy ?? 0) : 0
        for (let copy = firstCopy; copy < count; copy++) {
          const source = {
            type: 'randomEvent',
            encounterId: encounter.id,
          } as const
          let reward: { cardId: string; origin: TRewardOrigin } | null
          switch (step.type) {
            case 'drawRewards': {
              const drawn = this.drawReward(encounter.zoneType)
              if (drawn.type === 'gold') {
                player = {
                  ...player,
                  gold: Math.min(
                    this.config.purseCapacity,
                    player.gold + drawn.amount
                  ),
                }
                continue
              }
              reward = drawn
              break
            }
            case 'searchReward': {
              const found = this.searchReward(encounter.zoneType, step.cardId)
              player = {
                ...player,
                lastRewardSearch: {
                  encounterId: encounter.id,
                  cardId: step.cardId,
                  found,
                },
              }
              reward = found
                ? {
                    cardId: step.cardId,
                    origin: {
                      type: 'rewardDeck',
                      zoneType: encounter.zoneType,
                    },
                  }
                : null
              break
            }
            case 'grantReward':
              reward = { cardId: step.cardId, origin: { type: 'fixed' } }
              break
          }
          if (!reward) continue
          const rewardCard = cards.get(reward.cardId)
          if (
            rewardCard?.type !== 'attribute' &&
            rewardCard?.type !== 'item' &&
            rewardCard?.type !== 'equipment'
          )
            continue
          const delivered = this.addReward(player, rewardCard)
          if (delivered) {
            player = {
              ...delivered,
              lastRewardDelivery: {
                rewardId: this.nextRewardId(ids),
                cardId: reward.cardId,
                origin: reward.origin,
                disposition: 'kept',
              },
            }
            continue
          }
          this.openReward(player, rewardCard, reward.origin, source, ids)
          this.props.eventEncounter = {
            ...encounter,
            payments,
            phase: resolution,
            outcome: {
              nextStep,
              nextCopy: copy + 1,
              startingPeak,
              cause,
              escape,
            },
          }
          this.replaceActor(index, player)
          return
        }
      }
    }
    const peak = Math.max(
      0,
      player.peak +
        (resolution === 'success' ? 1 : resolution === 'setback' ? -1 : 0)
    )
    const requested = payments.reduce(
      (total, receipt) =>
        total +
        (receipt.handCards?.length ?? 0) +
        (receipt.movedAttributeCards?.length ?? 0),
      0
    )
    const drawn = player.deck.slice(0, requested)
    const next = reconcileHand(player, {
      ...player,
      peak,
      vigor: Math.min(peak, player.vigor),
      statuses: player.statuses.filter(
        ({ duration }) =>
          duration.kind !== 'untilEventEnd' &&
          duration.kind !== 'untilEventPhaseEnd'
      ),
      health: Math.min(player.health, maxHealthOf({ ...player, peak })),
      hand: [...player.hand, ...drawn],
      deck: player.deck.slice(drawn.length),
      lastRandomEvent: {
        encounterId: encounter.id,
        cardId: card.id,
        resolution,
        cause,
        payments,
        peakDelta: peak - startingPeak,
        replacement: { requested, drawn: drawn.length },
        escape,
      },
    })
    const deck = this.eventDecks.find(
      ({ zoneType }) => zoneType === encounter.zoneType
    )
    if (deck)
      this.updateEventDeck({ ...deck, discard: [...deck.discard, card.id] })
    this.props.eventEncounter = null
    this.replaceActor(index, next)
  }

  private updateRewardDeck(
    zoneType: TPartyRewardDeck['zoneType'],
    cards: readonly string[]
  ): void {
    this.props.rewardDecks = this.rewardDecks.map((deck) =>
      deck.zoneType === zoneType ? { zoneType, cards } : deck
    )
  }

  private searchReward(
    zoneType: TPartyRewardDeck['zoneType'],
    cardId: string
  ): boolean {
    const deck = this.rewardDecks.find((entry) => entry.zoneType === zoneType)
    if (!deck) return false
    const position = deck.cards.indexOf(cardId)
    const remaining = deck.cards.filter((_, index) => index !== position)
    const rng = SeededRng.fromState(this.props.rngState)
    this.updateRewardDeck(zoneType, shuffle(remaining, rng))
    this.props.rngState = rng.state()
    return position >= 0
  }

  private drawReward(
    zoneType: TPartyRewardDeck['zoneType']
  ):
    | { cardId: string; origin: TRewardOrigin; type: 'card' }
    | { type: 'gold'; amount: number } {
    const deck = this.rewardDecks.find((entry) => entry.zoneType === zoneType)
    if (deck?.cards.length) {
      const [cardId, ...remaining] = deck.cards
      this.updateRewardDeck(zoneType, remaining)
      return { type: 'card', cardId, origin: { type: 'rewardDeck', zoneType } }
    }
    const rng = SeededRng.fromState(this.props.rngState)
    const entry = drawReserve(this.config.reserveDeck, rng)
    this.props.rngState = rng.state()
    return entry.type === 'gold'
      ? entry
      : { ...entry, origin: { type: 'reserveDeck' } }
  }

  private addReward(
    player: TPlayerState,
    card: TAttributeCard | TItemCard | TEquipmentCard
  ): TPlayerState | null {
    if (card.type === 'attribute') {
      if (
        player.tcgFolder.reduce((sum, entry) => sum + entry.copies, 0) >=
        this.config.tcgFolderCapacity
      )
        return null
      const existing = player.tcgFolder.find(
        (entry) => entry.cardId === card.id
      )
      return {
        ...player,
        tcgFolder: sortedByCardId([
          ...player.tcgFolder.filter((entry) => entry.cardId !== card.id),
          { cardId: card.id, copies: (existing?.copies ?? 0) + 1 },
        ]),
      }
    }
    const inventory = addToInventory(
      player.inventory,
      card,
      1,
      this.config.inventoryCapacity
    )
    return inventory ? { ...player, inventory } : null
  }

  private nextRewardId(ids: IdGenerator | undefined): string {
    if (ids) return ids.next().toValue()
    const sequence = (this.props.rewardSequence ?? 0) + 1
    this.props.rewardSequence = sequence
    return `${this.id.toString()}-reward-${sequence}`
  }

  private openReward(
    player: TPlayerState,
    card: TAttributeCard | TItemCard | TEquipmentCard,
    origin: TRewardOrigin,
    source: TPendingReward['source'],
    ids: IdGenerator | undefined
  ): void {
    const destination = card.type === 'attribute' ? 'tcgFolder' : 'inventory'
    const holdings = new Map<string, number>()
    const entries =
      destination === 'tcgFolder'
        ? player.tcgFolder
        : player.inventory.map(({ cardId, quantity }) => ({
            cardId,
            copies: quantity,
          }))
    for (const { cardId, copies } of entries)
      holdings.set(cardId, (holdings.get(cardId) ?? 0) + copies)
    this.props.pendingReward = {
      id: this.nextRewardId(ids),
      memberId: this.turn.memberId.toString(),
      cardId: card.id,
      origin,
      source,
      destination,
      discardOptions: sortedByCardId(
        [...holdings].map(([cardId, maxCopies]) => ({ cardId, maxCopies }))
      ),
      decisionDeadlineAt: null,
    }
  }

  resolveReward(
    action: TResolveRewardAction,
    cards: ReadonlyMap<string, TCard>,
    at: Date,
    ids: IdGenerator | undefined
  ): Either<TRewardRefusal, void> {
    const reward = this.props.pendingReward
    if (
      !reward ||
      reward.id !== action.rewardId ||
      reward.memberId !== this.turn.memberId.toString()
    )
      return left('staleReward')
    const index = this.actorIndex()
    const actor = this.props.members[index]
    let { player } = actor
    const { cardId, origin, source, destination } = reward
    const discarded: TRewardDiscard[] = []
    let disposition: TRewardDelivery['disposition']
    if (action.choice === 'keep') {
      const quantities = new Map<string, number>()
      for (const entry of action.discard) {
        if (!Number.isSafeInteger(entry.copies) || entry.copies < 1)
          return left('paymentInvalid')
        const copies = (quantities.get(entry.cardId) ?? 0) + entry.copies
        const option = reward.discardOptions.find(
          ({ cardId }) => cardId === entry.cardId
        )
        if (!option || copies > option.maxCopies) return left('paymentInvalid')
        quantities.set(entry.cardId, copies)
      }
      discarded.push(
        ...[...quantities].map(([cardId, copies]) => ({ cardId, copies }))
      )
      const remaining = (id: string, count: number) => {
        const removed = Math.min(quantities.get(id) ?? 0, count)
        quantities.set(id, (quantities.get(id) ?? 0) - removed)
        return count - removed
      }
      const candidate =
        destination === 'inventory'
          ? {
              ...player,
              inventory: player.inventory
                .map((slot) => ({
                  ...slot,
                  quantity: remaining(slot.cardId, slot.quantity),
                }))
                .filter(({ quantity }) => quantity > 0),
            }
          : {
              ...player,
              tcgFolder: player.tcgFolder
                .map((entry) => ({
                  ...entry,
                  copies: remaining(entry.cardId, entry.copies),
                }))
                .filter(({ copies }) => copies > 0),
            }
      if ([...quantities.values()].some((copies) => copies !== 0))
        return left('paymentInvalid')
      const card = cards.get(cardId)
      if (
        card?.type !== 'attribute' &&
        card?.type !== 'equipment' &&
        card?.type !== 'item'
      )
        return left('paymentInvalid')
      const delivered = this.addReward(candidate, card)
      if (!delivered) return left('rewardDoesNotFit')
      player = delivered
      disposition = 'kept'
    } else {
      switch (origin.type) {
        case 'rewardDeck': {
          const deck = this.rewardDecks.find(
            ({ zoneType }) => zoneType === origin.zoneType
          )
          this.updateRewardDeck(origin.zoneType, [
            ...(deck?.cards ?? []),
            cardId,
          ])
          disposition = 'returnedToDeck'
          break
        }
        case 'reserveDeck':
          disposition = 'removed'
          break
        case 'fixed':
          discarded.push({ cardId, copies: 1 })
          disposition = 'sentToLimbo'
          break
      }
    }
    for (const entry of discarded) {
      this.addDomainEvent({
        type: 'SentToLimbo',
        memberId: actor.id,
        cardId: entry.cardId,
        quantity: entry.copies,
        from: destination,
        occurredAt: at,
        aggregateId: this.id,
      })
    }
    player = {
      ...player,
      lastRewardDelivery: { rewardId: reward.id, cardId, origin, disposition },
    }
    this.props.pendingReward = null
    this.props.savedAt = at
    if (source.type === 'scavenge') {
      this.replaceActor(index, {
        ...player,
        lastScavenge: {
          cardId,
          found: true,
          delivery: action.choice === 'keep' ? 'inventory' : 'left',
        },
      })
    } else {
      const encounter = this.eventEncounter
      if (encounter?.card && encounter.outcome) {
        const { cause, escape } = encounter.outcome
        this.eventCatalog = cards
        this.finishEvent(
          index,
          encounter,
          encounter.card,
          player,
          cause,
          escape,
          encounter.payments,
          ids,
          cards
        )
      }
    }
    return right(undefined)
  }

  private applyEventOutcomeEffect(
    player: TPlayerState,
    effect: Extract<TRandomEventOutcomeStep, { type: 'effect' }>['effect'],
    cardId: string,
    effectIndex: number,
    encounterId: string,
    phase: 'success' | 'setback',
    ids: IdGenerator | undefined
  ): TPlayerState {
    const activations = effect.activation.filter(isExecutableActivation)
    const { player: changed } = applyActivations(
      player,
      activations,
      this.props.config.purseCapacity
    )
    const next = reconcileHand(player, changed)
    const { mark, text } = effect
    const duration =
      effect.duration.kind === 'untilEventPhaseEnd'
        ? { kind: 'untilEventPhaseEnd' as const, phase }
        : effect.duration
    if (!isStatusDuration(duration) || mark === null) return next
    return {
      ...next,
      statuses: [
        ...next.statuses,
        {
          statusId:
            ids?.next().toValue() ?? `${encounterId}-effect-${effectIndex}`,
          effectIndex,
          sourceCardId: cardId,
          duration,
          mark,
          text,
          activation: activations,
          remaining:
            duration.kind === 'forOwnTurns'
              ? duration.turns
              : duration.kind === 'forRounds'
                ? duration.rounds
                : null,
        },
      ],
    }
  }

  get turnOrder(): readonly UniqueEntityID[] {
    return [...this.props.turnOrder]
  }

  get turn(): TPartyTurn {
    return { ...this.props.turn }
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get savedAt(): Date {
    return this.props.savedAt
  }

  /**
   * Conteúdo que este save usa (REQ-39, REQ-78): a Carta de Dimensão, as zonas
   * do mapa, as dos decks de recompensas, as cartas da build, da pasta, do
   * inventário, do cofre (slots e decks, REQ-94) e dos equipamentos em uso de
   * cada jogador e as classes deles.
   */
  contentInUse(): { cardIds: string[]; playerClasses: string[] } {
    const cardIds = new Set<string>([
      this.props.dimension.dimensionCardId,
      ...this.props.dimension.map.zones.map((zone) => zone.zoneId),
      ...this.props.rewardDecks.flatMap((deck) => deck.cards),
      ...this.pendingRewards.map(({ cardId }) => cardId),
      ...this.props.config.reserveDeck.flatMap((entry) =>
        entry.type === 'card' ? [entry.cardId] : []
      ),
    ])
    const playerClasses = new Set<string>()
    for (const member of this.props.members) {
      const { build, tcgFolder, inventory, equipment, vault, statuses } =
        member.player
      for (const entry of [
        ...build,
        ...tcgFolder,
        ...inventory,
        ...vault.slots,
        ...vault.decks.flat(),
      ]) {
        cardIds.add(entry.cardId)
      }
      for (const cardId of Object.values(equipment)) {
        if (cardId !== null) cardIds.add(cardId)
      }
      for (const { sourceCardId } of statuses) cardIds.add(sourceCardId)
      for (const { playerClass } of member.player.playerClasses) {
        playerClasses.add(playerClass)
      }
    }
    return { cardIds: [...cardIds], playerClasses: [...playerClasses] }
  }

  isHost(member: PartyMember): boolean {
    return member.id.equals(this.props.hostMemberId)
  }

  /**
   * Grupo de 1 com o host, já preparado (README 10.1; REQ-16, REQ-17, REQ-31
   * a REQ-36). Primeiro os dados do pedido (problemas na ordem `name`,
   * `characterName`, `playerClass`, `members`), depois a dimensão. Os ids só
   * são gerados quando tudo é válido. Sorteios na ordem: mapa, deck de cada
   * membro, ordem dos jogadores e, por último, os decks de recompensas
   * (REQ-89, D-87: não mudam os anteriores).
   */
  static create(
    input: TCreatePartyInput,
    ids: IdGenerator
  ): Either<TCreatePartyFailure, Party> {
    const issues: TPartyIssue[] = []
    const name = checkName('name', input.name, PARTY_NAME_MAX_LENGTH, issues)
    const characterName = checkName(
      'characterName',
      input.characterName,
      CHARACTER_NAME_MAX_LENGTH,
      issues
    )
    const classDefinition = checkPlayerClass(input, issues)
    const memberCount = 1
    if (memberCount < input.config.minPlayers) {
      issues.push({ field: 'members', reason: 'belowMinPlayers' })
    }

    if (
      issues.length > 0 ||
      name === null ||
      characterName === null ||
      classDefinition === null
    ) {
      return left({ type: 'invalid', issues })
    }

    const { dimension, zones } = input
    const problems = checkDimensionComposition({ dimension, zones })
    if (dimension === null || problems.length > 0) {
      return left({
        type: 'dimensionInvalid',
        dimensionCardId: dimension?.id ?? null,
        problems,
      })
    }

    const rng = SeededRng.fromState(input.rngState)
    const assembled = assembleMap({
      zones,
      arrivalZoneTitle: dimension.arrivalZoneTitle,
      rng,
      maxAttempts: input.config.mapMaxAttempts,
    })
    if (assembled.isLeft()) {
      return left({
        type: 'dimensionInvalid',
        dimensionCardId: dimension.id,
        problems: [mapAttemptsProblem(input.config.mapMaxAttempts)],
      })
    }
    const { startingCityZoneId, map } = assembled.value

    const partyId = ids.next()
    const host = PartyMember.create(
      {
        characterName,
        kind: 'human',
        player: createStartingPlayer({
          config: input.config,
          classDefinition,
          attributeCards: input.attributeCards,
          startingCityZoneId,
          rng,
        }),
      },
      ids.next()
    )
    const members = [host]
    const turnOrder = rollTurnOrder(
      members.map((member) => member.id),
      rng
    )
    const rewardDecks = assembleRewardDecks(dimension.rewardDecks, rng)

    const party = new Party(
      {
        name,
        members,
        hostMemberId: host.id,
        status: 'idle',
        config: structuredClone(input.config),
        rngState: rng.state(),
        dimension: { dimensionCardId: dimension.id, startingCityZoneId, map },
        rewardDecks,
        turnOrder,
        turn: {
          round: 1,
          memberId: turnOrder[0],
          actionPoints: input.config.actionPointsPerTurn,
        },
        createdAt: input.now,
        savedAt: input.now,
      },
      partyId
    )
    const at = { occurredAt: input.now, aggregateId: partyId }
    party.addDomainEvent({ type: 'PartyCreated', ...at })
    party.addDomainEvent({ type: 'MapAssembled', ...at })
    for (const member of members) {
      party.addDomainEvent({
        type: 'StarterDeckGiven',
        memberId: member.id,
        ...at,
      })
    }
    party.addDomainEvent({ type: 'TurnOrderDecided', ...at })
    party.addDomainEvent({ type: 'PlayersArrived', ...at })
    party.addDomainEvent({
      type: 'TurnStarted',
      memberId: turnOrder[0],
      round: 1,
      ...at,
    })
    return right(party)
  }

  /** Reconstrói um save gravado (repositórios, factories). Não registra eventos. */
  static restore(props: TPartyProps, id: UniqueEntityID): Party {
    return new Party(
      {
        ...props,
        members: [...props.members],
        config: structuredClone(props.config),
        rewardDecks: props.rewardDecks.map((deck) => ({
          zoneType: deck.zoneType,
          cards: [...deck.cards],
        })),
        turnOrder: [...props.turnOrder],
      },
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
  endSession(at: Date): Either<'sessionNotActive' | 'combatInProgress', void> {
    if (this.props.combat) return left('combatInProgress')
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

  /**
   * Movimentar (README 12.2; REQ-51 a REQ-53, REQ-56). Quem age é o membro da
   * vez (D-63) e o gasto é 1 ponto de ação. Ordem das recusas: fora de sessão,
   * zona fora do mapa, sem pontos, zona sem travessia (inclusive a própria).
   * Recusado, nada muda. O RNG não é usado.
   */
  move(
    zoneId: string,
    at: Date
  ): Either<
    'sessionNotActive' | 'zoneNotInMap' | 'noActionPoints' | 'notConnected',
    void
  > {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    const { map } = this.props.dimension
    if (!map.zones.some((zone) => zone.zoneId === zoneId)) {
      return left('zoneNotInMap')
    }

    if (this.props.turn.actionPoints < 1) {
      return left('noActionPoints')
    }

    const index = this.props.members.findIndex((member) =>
      member.id.equals(this.props.turn.memberId)
    )
    const actor = this.props.members[index]
    const fromZoneId = actor.player.zoneId
    if (!connectedZones(map, fromZoneId).includes(zoneId)) {
      return left('notConnected')
    }

    this.props.turn = {
      ...this.props.turn,
      actionPoints: this.props.turn.actionPoints - 1,
    }
    this.replaceActor(index, { ...actor.player, zoneId })
    this.props.savedAt = at
    this.addDomainEvent({
      type: 'PlayerMoved',
      memberId: actor.id,
      fromZoneId,
      toZoneId: zoneId,
      occurredAt: at,
      aggregateId: this.id,
    })
    this.props.members[index] = this.updateStatuses(
      this.props.members[index],
      (status) => (status.duration.kind === 'untilLeaveZone' ? null : status),
      at
    )
    return right(undefined)
  }

  /**
   * Encerrar a vez (README 11.1, 2.1; REQ-57). Passa ao membro seguinte de
   * `turnOrder` com os pontos cheios; do último para o primeiro a rodada sobe.
   * Aceito com qualquer quantidade de pontos (K2). O RNG não é usado.
   */
  endTurn(at: Date): Either<'sessionNotActive', void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    const ended = this.props.turn
    const position = this.props.turnOrder.findIndex((id) =>
      id.equals(ended.memberId)
    )
    const nextPosition = (position + 1) % this.props.turnOrder.length
    const round = nextPosition === 0 ? ended.round + 1 : ended.round
    const memberId = this.props.turnOrder[nextPosition]
    const nextIndex = this.props.members.findIndex((member) =>
      member.id.equals(memberId)
    )
    const nextPlayer = this.props.members[nextIndex].player
    const debt = nextPlayer.nextTurnActionPointDebt ?? 0
    if (debt > 0)
      this.replaceActor(nextIndex, {
        ...nextPlayer,
        nextTurnActionPointDebt: 0,
      })

    this.props.turn = {
      round,
      memberId,
      actionPoints: Math.max(0, this.props.config.actionPointsPerTurn - debt),
    }
    this.props.savedAt = at
    const base = { occurredAt: at, aggregateId: this.id }
    this.addDomainEvent({
      type: 'TurnEnded',
      memberId: ended.memberId,
      round: ended.round,
      ...base,
    })
    this.addDomainEvent({ type: 'TurnStarted', memberId, round, ...base })
    const roundEnded = round !== ended.round
    this.props.members = this.props.members.map((member) => {
      const ownTurnEnded = member.id.equals(ended.memberId)
      const ownTurnStarted = member.id.equals(memberId)
      if (!roundEnded && !ownTurnEnded && !ownTurnStarted) return member
      return this.updateStatuses(
        member,
        (status) =>
          statusAfterTurn(status, { ownTurnEnded, ownTurnStarted, roundEnded }),
        at
      )
    })
    return right(undefined)
  }

  /**
   * Recuperar (README 12.2, 12.5, 7.3 item 6; REQ-63). Quem age é o membro da
   * vez (D-63); gasta 1 ponto. Vida e Vigor sobem a porcentagem da config (no
   * mínimo 1) sem passar de `maxHealth` e do Pico. `shuffleHand` e
   * `shuffleDiscard` juntam as cartas ao deck (o deck primeiro) e o embaralham
   * com o RNG; `drawToHand` não usa o RNG. Aceito mesmo sem efeito.
   */
  recover(
    option: TRecoverOption,
    at: Date
  ): Either<'sessionNotActive' | 'noActionPoints', void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    if (this.props.turn.actionPoints < 1) {
      return left('noActionPoints')
    }

    const { config } = this.props
    const index = this.actorIndex()
    const actor = this.props.members[index]
    const { player } = actor

    const maxHealth = maxHealthOf(player)
    const health = Math.min(
      maxHealth,
      player.health +
        Math.max(1, Math.floor((maxHealth * config.recoverHealthPercent) / 100))
    )
    const vigor = Math.min(
      player.peak,
      player.vigor +
        Math.max(
          1,
          Math.floor((player.peak * config.recoverVigorPercent) / 100)
        )
    )

    let { deck, hand, discard } = player
    let cardsDrawn = 0
    switch (option) {
      case 'drawToHand': {
        cardsDrawn = Math.min(
          Math.max(0, config.recoverHandSize - hand.length),
          deck.length
        )
        hand = [...hand, ...deck.slice(0, cardsDrawn)]
        deck = deck.slice(cardsDrawn)
        break
      }
      case 'shuffleHand': {
        const rng = SeededRng.fromState(this.props.rngState)
        deck = shuffle([...deck, ...hand], rng)
        hand = []
        this.props.rngState = rng.state()
        break
      }
      case 'shuffleDiscard': {
        const rng = SeededRng.fromState(this.props.rngState)
        deck = shuffle([...deck, ...discard], rng)
        discard = []
        this.props.rngState = rng.state()
        break
      }
      default: {
        const _exhaustive: never = option
        return _exhaustive
      }
    }

    this.spendActionPoint()
    this.replaceActor(index, { ...player, health, vigor, deck, hand, discard })
    this.props.savedAt = at
    this.addDomainEvent({
      type: 'PlayerRecovered',
      memberId: actor.id,
      option,
      healthRestored: health - player.health,
      vigorRestored: vigor - player.vigor,
      cardsDrawn,
      occurredAt: at,
      aggregateId: this.id,
    })
    return right(undefined)
  }

  /**
   * Ajustar deck (README 4.4 passos 1 a 4, 6.3, 8.2, 12.2; REQ-65, REQ-66).
   * `build` é a build nova inteira (D-68). Ordem das recusas: fora de sessão,
   * sem pontos, `notOwned`, `copyLimitExceeded`, `buildBelowMinimum`,
   * `tcgFolderFull`. `catalog` traz as cartas de atributo e as classes do
   * jogador (D-71). O deck novo é embaralhado com o RNG e o jogador compra de
   * volta a mesma quantidade de cartas que tinha na mão. Recusado, nada muda.
   */
  adjustDeck(
    build: readonly TStarterDeckEntry[],
    catalog: {
      cards: readonly TAttributeCard[]
      classes: readonly TClassDefinition[]
    },
    at: Date
  ): Either<TAdjustDeckRefusal, void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    if (this.props.turn.actionPoints < 1) {
      return left('noActionPoints')
    }

    const { config } = this.props
    const index = this.actorIndex()
    const actor = this.props.members[index]
    const { player } = actor

    const pool = new Map<string, number>()
    for (const { cardId, copies } of [...player.build, ...player.tcgFolder]) {
      pool.set(cardId, (pool.get(cardId) ?? 0) + copies)
    }

    for (const { cardId, copies } of build) {
      if (copies > (pool.get(cardId) ?? 0)) {
        return left({ reason: 'notOwned', cardId })
      }
    }
    for (const { cardId, copies } of build) {
      const card = catalog.cards.find((c) => c.id === cardId)
      if (
        card &&
        card.attributeKind !== 'basic' &&
        copies > config.maxCopiesPerCard
      ) {
        return left({ reason: 'copyLimitExceeded', cardId })
      }
    }

    const buildSize = build.reduce((sum, { copies }) => sum + copies, 0)
    if (buildSize < config.minDeckSize) {
      return left('buildBelowMinimum')
    }

    const inBuild = new Map(build.map(({ cardId, copies }) => [cardId, copies]))
    const tcgFolder = sortedByCardId(
      [...pool].map(([cardId, owned]) => ({
        cardId,
        copies: owned - (inBuild.get(cardId) ?? 0),
      }))
    ).filter(({ copies }) => copies > 0)
    const folderSize = tcgFolder.reduce((sum, { copies }) => sum + copies, 0)
    if (folderSize > config.tcgFolderCapacity) {
      return left('tcgFolderFull')
    }

    const newBuild = sortedByCardId(
      build.map(({ cardId, copies }) => ({ cardId, copies }))
    )
    const rng = SeededRng.fromState(this.props.rngState)
    const rebuilt = rebuildPlayerDeck(player, newBuild, catalog, config, rng)

    this.props.rngState = rng.state()
    this.spendActionPoint()
    this.replaceActor(index, {
      ...player,
      ...rebuilt,
      build: newBuild,
      tcgFolder,
    })
    this.props.savedAt = at
    this.addDeckEvents(actor.id, player, rebuilt, buildSize, at)
    return right(undefined)
  }

  /**
   * Usar cofre (README 6.4, 6.5, 12.2; REQ-84 a REQ-88; D-82). Quem age é o
   * membro da vez; gasta 1 ponto. `catalog.zoneActions` são as ações da zona
   * atual; `cards` as cartas que as operações, o cofre, a build e a pasta
   * citam; `classes`, as do jogador. Ordem das recusas: fora de sessão, sem
   * pontos, zona sem `useVault`, a primeira operação que falha (simulando em
   * ordem, com `operationIndex`). Recusado, nada muda. Com `swapBuild` ou
   * `editBuild` no lote, no fim acontecem uma vez os passos de 4.4 (RNG); sem
   * eles o RNG não é usado. Eventos: `VaultUsed`, `SentToLimbo` por
   * Descartar, e `DeckAdjusted`/`DeckLockChanged` se a build mudou.
   */
  useVault(
    operations: readonly TVaultOperation[],
    catalog: {
      cards: readonly TCard[]
      classes: readonly TClassDefinition[]
      zoneActions: readonly TZoneAction[]
    },
    at: Date
  ): Either<TUseVaultRefusal, void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    if (this.props.turn.actionPoints < 1) {
      return left('noActionPoints')
    }
    if (!catalog.zoneActions.includes('useVault')) {
      return left('zoneActionUnavailable')
    }

    const { config } = this.props
    const index = this.actorIndex()
    const actor = this.props.members[index]
    const applied = applyVaultOperations({
      player: actor.player,
      config,
      cards: catalog.cards,
      operations,
    })
    if (applied.isLeft()) return left(applied.value)
    const { player: changed, limbo, buildChanged } = applied.value

    let next = changed
    let rebuilt: ReturnType<typeof rebuildPlayerDeck> | null = null
    if (buildChanged) {
      const rng = SeededRng.fromState(this.props.rngState)
      rebuilt = rebuildPlayerDeck(changed, changed.build, catalog, config, rng)
      next = { ...changed, ...rebuilt }
      this.props.rngState = rng.state()
    }

    this.spendActionPoint()
    this.replaceActor(index, next)
    this.props.savedAt = at
    const base = { memberId: actor.id, occurredAt: at, aggregateId: this.id }
    this.addDomainEvent({
      type: 'VaultUsed',
      operationCount: operations.length,
      ...base,
    })
    for (const { cardId, quantity } of limbo) {
      this.addDomainEvent({
        type: 'SentToLimbo',
        cardId,
        quantity,
        from: 'vault',
        ...base,
      })
    }
    if (rebuilt !== null) {
      const buildSize = changed.build.reduce((sum, e) => sum + e.copies, 0)
      this.addDeckEvents(actor.id, actor.player, rebuilt, buildSize, at)
    }
    return right(undefined)
  }

  /**
   * Vasculhar (README 12.2, 12.6; REQ-90 a REQ-92, REQ-96; D-74, D-88). Quem
   * age é o membro da vez; gasta 1 ponto. `catalog.zone` é a carta da zona
   * atual e `dimension` a Carta de Dimensão do grupo (`null` se o catálogo não
   * tem); `cards`, as do inventário e as citadas pelo deck da zona. Ordem das
   * recusas: fora de sessão, sem pontos, zona sem `scavenge`,
   * `notScavengeable`, `inventoryFull` (C abriria slot novo). Recusado, nada
   * muda. Aceito: a cópia de C mais perto do topo vai ao inventário (REQ-70);
   * com ou sem achado, o deck do tipo da zona é embaralhado pelo RNG.
   */
  scavenge(
    cardId: string,
    catalog: {
      zone: TZoneCard | null
      dimension: TDimensionCard | null
      cards: readonly TCard[]
    },
    at: Date,
    ids?: IdGenerator,
    rewardsEnabled = true
  ): Either<TScavengeRefusal, void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    if (this.props.turn.actionPoints < 1) {
      return left('noActionPoints')
    }
    const { zone } = catalog
    if (zone === null || !zone.zoneActions.includes('scavenge')) {
      return left('zoneActionUnavailable')
    }

    const index = this.actorIndex()
    const actor = this.props.members[index]
    const { player } = actor
    const targets = scavengeTargets({ player, ...catalog })
    const card = catalog.cards.find((c) => c.id === cardId)
    if (
      !targets.includes(cardId) ||
      (card?.type !== 'item' && card?.type !== 'equipment')
    ) {
      return left('notScavengeable')
    }
    const capacity = this.props.config.inventoryCapacity
    const withCard = addToInventory(player.inventory, card, 1, capacity)
    if (!rewardsEnabled && withCard === null) return left('inventoryFull')
    const found = this.searchReward(zone.zoneType, cardId)
    const origin = { type: 'rewardDeck', zoneType: zone.zoneType } as const
    if (found && withCard === null)
      this.openReward(player, card, origin, { type: 'scavenge' }, ids)

    this.spendActionPoint()
    this.replaceActor(index, {
      ...player,
      inventory: found && withCard ? withCard : player.inventory,
      ...(rewardsEnabled && found && withCard
        ? {
            lastRewardDelivery: {
              rewardId: this.nextRewardId(ids),
              cardId,
              origin,
              disposition: 'kept',
            },
          }
        : {}),
      lastScavenge: rewardsEnabled
        ? {
            cardId,
            found,
            delivery: found ? (withCard ? 'inventory' : 'pending') : 'none',
          }
        : { cardId, found },
    })
    this.props.savedAt = at
    this.addDomainEvent({
      type: 'Scavenged',
      memberId: actor.id,
      zoneId: player.zoneId,
      cardId,
      found,
      occurredAt: at,
      aggregateId: this.id,
    })
    return right(undefined)
  }

  /** `DeckAdjusted` e, para cada classe cuja trava mudou, `DeckLockChanged` (REQ-65, REQ-87). */
  private addDeckEvents(
    memberId: UniqueEntityID,
    before: TPlayerState,
    rebuilt: ReturnType<typeof rebuildPlayerDeck>,
    buildSize: number,
    at: Date
  ): void {
    const base = { occurredAt: at, aggregateId: this.id }
    this.addDomainEvent({
      type: 'DeckAdjusted',
      memberId,
      buildSize,
      handSize: rebuilt.hand.length,
      ...base,
    })
    rebuilt.playerClasses.forEach((entry, i) => {
      if (entry.deckLockMet !== before.playerClasses[i].deckLockMet) {
        this.addDomainEvent({
          type: 'DeckLockChanged',
          memberId,
          playerClass: entry.playerClass,
          deckLockMet: entry.deckLockMet,
          ...base,
        })
      }
    })
  }

  /**
   * Preparar, parte a (README 12.2, 5.1; REQ-72 a REQ-74; D-77, D-79). Quem age
   * é o membro da vez; gratuita (K2), aceita com 0 pontos. `catalog.cards`
   * traz a carta a equipar e os equipamentos em uso. Ordem das recusas: fora
   * de sessão; no `equip`, `notInInventory`, `notEquipment`,
   * `peakRequirementNotMet`, `classRestricted`, `shieldBlocked`,
   * `inventoryFull`; no `unequip`, `slotEmpty`, `inventoryFull`. Recusado,
   * nada muda. O RNG não é usado.
   */
  prepare(
    operation: TPrepareOperation,
    catalog: { cards: readonly TCard[] },
    at: Date,
    ids: IdGenerator
  ): Either<TPrepareRefusal, void>
  prepare(
    operation: Exclude<TPrepareOperation, TActivateOperation>,
    catalog: { cards: readonly TCard[] },
    at: Date
  ): Either<TPrepareRefusal, void>
  prepare(
    operation: TPrepareOperation,
    catalog: { cards: readonly TCard[] },
    at: Date,
    ids?: IdGenerator
  ): Either<TPrepareRefusal, void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    const capacity = this.props.config.inventoryCapacity
    const index = this.actorIndex()
    const actor = this.props.members[index]
    const { player } = actor
    const base = { memberId: actor.id, occurredAt: at, aggregateId: this.id }
    const asSlot = (cardId: string): TInventorySlot => ({ cardId, quantity: 1 })

    switch (operation.operation) {
      case 'activate': {
        if (!ids) throw new TypeError('An IdGenerator is required for activate')
        const prepared = prepareEffect(
          player,
          operation,
          catalog.cards,
          this.props.rngState,
          this.eventEncounter?.phase
        )
        if (prepared.isLeft()) return left(prepared.value)

        const { effect, paid, consumed } = prepared.value
        const { player: changed, applied } = applyActivations(
          prepared.value.player,
          effect.activation,
          this.props.config.purseCapacity
        )
        const { cardId, effectIndex } = operation
        const { duration, mark, text } = effect
        const status: TPlayerStatus | null =
          duration.kind !== 'immediate' && mark !== null
            ? {
                statusId: ids.next().toValue(),
                sourceCardId: cardId,
                effectIndex,
                text,
                mark,
                activation: structuredClone(effect.activation),
                duration: structuredClone(duration),
                remaining:
                  duration.kind === 'forOwnTurns'
                    ? duration.turns
                    : duration.kind === 'forRounds'
                      ? duration.rounds
                      : null,
              }
            : null

        this.replaceActor(
          index,
          status === null
            ? changed
            : {
                ...changed,
                statuses: [...changed.statuses, status],
              }
        )
        this.props.rngState = prepared.value.rngState ?? this.props.rngState
        this.props.savedAt = at
        this.addDomainEvent({
          ...base,
          type: 'EffectActivated',
          cardId,
          effectIndex,
        })
        for (const cost of paid)
          this.addDomainEvent({ ...base, type: 'EffectCostPaid', ...cost })
        for (const activation of applied)
          this.addDomainEvent({
            ...base,
            type: 'EffectActivationApplied',
            ...activation,
          })
        if (consumed)
          this.addDomainEvent({
            ...base,
            type: 'SentToLimbo',
            cardId,
            quantity: 1,
            from: 'inventory',
          })
        if (status)
          this.addDomainEvent({
            ...base,
            type: 'StatusApplied',
            statusId: status.statusId,
          })
        return right(undefined)
      }
      case 'equip': {
        const { cardId } = operation
        const position = player.inventory.findIndex(
          (slot) => slot.cardId === cardId
        )
        if (position < 0) return left({ reason: 'notInInventory' })

        const card = catalog.cards.find((c) => c.id === cardId)
        if (!card || card.type !== 'equipment') {
          return left({ reason: 'notEquipment' })
        }
        if (
          card.peakRequirement !== null &&
          player.peak < card.peakRequirement
        ) {
          return left({ reason: 'peakRequirementNotMet' })
        }
        // 8.2: a classe conta mesmo inativa.
        if (
          card.classRestriction.length > 0 &&
          !player.playerClasses.some(({ playerClass }) =>
            card.classRestriction.includes(playerClass)
          )
        ) {
          return left({ reason: 'classRestricted' })
        }
        const weapon = catalog.cards.find(
          (c) => c.id === player.equipment.weapon
        )
        if (
          card.slot === 'shield' &&
          weapon?.type === 'equipment' &&
          weapon.blocksShield
        ) {
          return left({ reason: 'shieldBlocked' })
        }

        const previous = player.equipment[card.slot]
        const shield =
          card.slot === 'weapon' && card.blocksShield
            ? player.equipment.shield
            : null
        const removed = player.inventory.flatMap((slot, i) =>
          i !== position
            ? [slot]
            : slot.quantity > 1
              ? [{ cardId: slot.cardId, quantity: slot.quantity - 1 }]
              : []
        )
        const inventory = [
          ...removed,
          ...(previous !== null ? [asSlot(previous)] : []),
          ...(shield !== null ? [asSlot(shield)] : []),
        ]
        // B J1: o escudo precisa de slot livre depois de E sair e da arma antiga entrar.
        if (inventory.length > capacity)
          return left({ reason: 'inventoryFull' })

        this.replaceActor(index, {
          ...player,
          inventory,
          equipment: {
            ...player.equipment,
            ...(shield !== null ? { shield: null } : {}),
            [card.slot]: cardId,
          },
        })
        this.props.savedAt = at
        if (previous !== null) {
          this.addDomainEvent({
            type: 'EquipmentUnequipped',
            cardId: previous,
            slot: card.slot,
            ...base,
          })
        }
        if (shield !== null) {
          this.addDomainEvent({
            type: 'EquipmentUnequipped',
            cardId: shield,
            slot: 'shield',
            ...base,
          })
        }
        this.addDomainEvent({
          type: 'EquipmentEquipped',
          cardId,
          slot: card.slot,
          ...base,
        })
        return right(undefined)
      }
      case 'unequip': {
        const { slot } = operation
        const cardId = player.equipment[slot]
        if (cardId === null) return left({ reason: 'slotEmpty' })
        if (player.inventory.length >= capacity) {
          return left({ reason: 'inventoryFull' })
        }

        this.replaceActor(index, {
          ...player,
          inventory: [...player.inventory, asSlot(cardId)],
          equipment: { ...player.equipment, [slot]: null },
        })
        this.props.savedAt = at
        this.addDomainEvent({
          type: 'EquipmentUnequipped',
          cardId,
          slot,
          ...base,
        })
        return right(undefined)
      }
      default: {
        const _exhaustive: never = operation
        return _exhaustive
      }
    }
  }

  /**
   * Doação do laboratório (REQ-76, REQ-77; D-78). Não é ação do jogo: vale
   * com o grupo `idle`, para qualquer membro, sem gastar pontos. Carta
   * `equipment`/`item` → inventário (empilhamento de REQ-70); `attribute` →
   * pasta. Não cabe inteira → recusa e nada muda. Ouro → bolsa; o excedente é
   * perdido (5.3). O RNG não é usado.
   */
  grant(
    memberId: UniqueEntityID,
    grant: TLabGrant,
    at: Date
  ): Either<'memberNotFound' | 'inventoryFull' | 'tcgFolderFull', void> {
    const index = this.props.members.findIndex((m) => m.id.equals(memberId))
    if (index < 0) return left('memberNotFound')
    const { config } = this.props
    const { player } = this.props.members[index]

    let next: TPlayerState
    let event: TLabGrantAppliedPayload
    switch (grant.type) {
      case 'card': {
        const { card, quantity } = grant
        if (card.type === 'attribute') {
          const folderSize = player.tcgFolder.reduce((s, e) => s + e.copies, 0)
          if (folderSize + quantity > config.tcgFolderCapacity) {
            return left('tcgFolderFull')
          }
          const existing = player.tcgFolder.find((e) => e.cardId === card.id)
          const tcgFolder = sortedByCardId([
            ...player.tcgFolder.filter((e) => e.cardId !== card.id),
            { cardId: card.id, copies: (existing?.copies ?? 0) + quantity },
          ])
          next = { ...player, tcgFolder }
        } else {
          const inventory = addToInventory(
            player.inventory,
            card,
            quantity,
            config.inventoryCapacity
          )
          if (inventory === null) return left('inventoryFull')
          next = { ...player, inventory }
        }
        event = { type: 'card', cardId: card.id, quantity }
        break
      }
      case 'gold': {
        const gold = Math.min(config.purseCapacity, player.gold + grant.amount)
        const received = gold - player.gold
        next = { ...player, gold }
        event = {
          type: 'gold',
          amount: grant.amount,
          received,
          lost: grant.amount - received,
        }
        break
      }
      default: {
        const _exhaustive: never = grant
        return _exhaustive
      }
    }

    this.replaceActor(index, next)
    this.props.savedAt = at
    this.addDomainEvent({
      type: 'LabGrantApplied',
      memberId,
      grant: event,
      occurredAt: at,
      aggregateId: this.id,
    })
    return right(undefined)
  }

  /** Posição do membro da vez (D-63). */
  private actorIndex(): number {
    return this.props.members.findIndex((member) =>
      member.id.equals(this.props.turn.memberId)
    )
  }

  private spendActionPoint(): void {
    this.props.turn = {
      ...this.props.turn,
      actionPoints: this.props.turn.actionPoints - 1,
    }
  }

  private replaceActor(index: number, player: TPlayerState): void {
    this.props.members = this.props.members.map((member, i) =>
      i === index
        ? PartyMember.create(
            {
              characterName: member.characterName,
              kind: member.kind,
              player: reconcileHand(member.player, player),
            },
            member.id
          )
        : member
    )
  }

  private updateStatuses(
    member: PartyMember,
    update: (status: TPlayerStatus) => TPlayerStatus | null,
    at: Date
  ): PartyMember {
    const active: TPlayerStatus[] = []
    let changed = false
    for (const status of member.player.statuses) {
      const next = update(status)
      if (next !== status) changed = true
      if (next === null) {
        this.addDomainEvent({
          type: 'StatusExpired',
          memberId: member.id,
          statusId: status.statusId,
          occurredAt: at,
          aggregateId: this.id,
        })
      } else {
        active.push(next)
      }
    }
    if (!changed) return member

    return PartyMember.create(
      {
        characterName: member.characterName,
        kind: member.kind,
        player: { ...member.player, statuses: active },
      },
      member.id
    )
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

/**
 * README 4.4 passos 1 a 4 (REQ-65, REQ-87): a build nova, embaralhada pelo RNG,
 * vira o deck; a mão volta com o mesmo tamanho que tinha, o descarte esvazia; a
 * trava de cada classe e os modificadores (da 1ª classe, REQ-34) são refeitos.
 * A carta ou a classe que o catálogo não tem: sem trava recalculada.
 */
function rebuildPlayerDeck(
  player: TPlayerState,
  newBuild: readonly TStarterDeckEntry[],
  catalog: {
    cards: readonly TCard[]
    classes: readonly TClassDefinition[]
  },
  config: TGameConfigValues,
  rng: SeededRng
): Pick<
  TPlayerState,
  'playerClasses' | 'deck' | 'hand' | 'discard' | 'modifiers'
> {
  const shuffled = shuffle(
    newBuild.flatMap(({ cardId, copies }) =>
      Array.from({ length: copies }, () => cardId)
    ),
    rng
  )
  const hand = shuffled.slice(0, player.hand.length)
  const deck = shuffled.slice(hand.length)

  const lockEntries = newBuild.flatMap(({ cardId, copies }) => {
    const card = catalog.cards.find((c) => c.id === cardId)
    return card?.type === 'attribute' ? [{ card, copies }] : []
  })
  const playerClasses = player.playerClasses.map((entry) => {
    const definition = catalog.classes.find(
      (c) => c.playerClass === entry.playerClass
    )
    if (!definition) return entry
    return {
      playerClass: entry.playerClass,
      deckLockMet: isClassActive({
        build: lockEntries,
        essentialAttributes: definition.essentialAttributes,
        lockOneEssential: config.lockOneEssential,
        lockTwoEssentials: config.lockTwoEssentials,
      }),
    }
  })
  // Os modificadores seguem a 1ª classe, como na preparação (REQ-34).
  const firstDefinition = catalog.classes.find(
    (c) => c.playerClass === player.playerClasses[0]?.playerClass
  )
  const modifiers = firstDefinition
    ? playerClasses[0].deckLockMet
      ? { ...firstDefinition.baseModifiers }
      : defaultModifiers(config)
    : player.modifiers
  return { playerClasses, deck, hand, discard: [], modifiers }
}

/** REQ-35: `unknownClass` quando o texto não tem classe publicada. */
function checkPlayerClass(
  { playerClass, classDefinition }: TCreatePartyInput,
  issues: TPartyIssue[]
): TClassDefinition | null {
  if (playerClass === undefined) {
    issues.push({ field: 'playerClass', reason: 'required' })
    return null
  }
  if (typeof playerClass !== 'string') {
    issues.push({ field: 'playerClass', reason: 'notString' })
    return null
  }
  if (classDefinition === null || classDefinition.playerClass !== playerClass) {
    issues.push({ field: 'playerClass', reason: 'unknownClass' })
    return null
  }
  return classDefinition
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

type TLabGrantAppliedPayload = Extract<
  TPartyEvent,
  { type: 'LabGrantApplied' }
>['grant']
