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
  TEquipmentSlot,
  TCombatEventCard,
  TExecutableAbility,
  TItemCard,
  TRandomEventOutcomeStep,
  TStarterDeckEntry,
  TZoneAction,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import { EQUIPMENT_SLOTS } from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TEffect,
  TTrigger,
  TZoneEffect,
} from '@/domain/catalog/enterprise/value-objects/effect'
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
  combatAbilityUsage,
  combatIsTerminal,
  combatTurnStarted,
  createCombat,
  enemyDefeatNotices,
  registerCombatAbility,
  resolvePlayerAbility,
  resolveCombatTurn,
  type TCombatRefusal,
  type TCombatState,
  type CombatNotice,
  type TCombatUpdate,
} from '../../combat'
import {
  adventureAbilityKey,
  abilityWithModifiers,
  abilityEffectDuration,
  abilityEffectStatus,
  applyAbilityEffect,
  equippedAbility,
  matchesAbilityUse,
} from '../../combat/abilities'
import { describeAbilityPayment, payAbility } from '../../combat/payment'
import { effectiveModifiers, equipmentWorks } from '../../effective-modifiers'
import { applyActivations } from '../../effect-activation'
import type { TPartyEvent } from '../../events/party-events'
import { addToInventory, type TInventorySlot } from '../../inventory'
import { assembleMap, type TPartyMap } from '../../map-assembly'
import type {
  TPrepareOperation,
  TRecoverOption,
  TVaultOperation,
  TRandomEventAction,
  TCombatAction,
  TPartyAction,
  TResolveTriggeredEffectAction,
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
import {
  combatStatusesAfterEnd,
  statusAfterTurn,
  statusesAfterAbility,
  type TPlayerStatus,
} from '../../player-status'
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

type EquipmentEffectOrigin = {
  type: 'equipment'
  cardId: string
  equipmentSlot: TEquipmentSlot
}

type TriggerSourceOrigin =
  | EquipmentEffectOrigin
  | (Omit<EquipmentEffectOrigin, 'type'> & {
      type: 'equipmentAbility'
      abilityId: string
    })
  | { type: 'inventory'; cardId: string }

type UsedTriggerAbility = {
  slot: TEquipmentSlot
  abilityId: string
  includeOwnEffects: boolean
  hitTargets?: readonly string[]
  advantageTargets?: readonly string[]
}

type PendingTriggeredEffect = {
  sourceKey: string
  effectIndex: number
  effectId: string
  usedAbility?: { slot: TEquipmentSlot; abilityId: string }
  targetIds?: readonly string[]
}

type EligibleTriggeredEffect = PendingTriggeredEffect & {
  origin: TriggerSourceOrigin
  effect: TEffect | TZoneEffect
  ability?: TExecutableAbility
}

type TriggeredEffectOption = {
  effectId: string
  origin: TriggerSourceOrigin & { effectIndex: number }
  text: string
} & (
  | { mode: 'automatic'; paymentCosts: [] }
  | {
      mode: 'optional'
      paymentCosts: NonNullable<
        ReturnType<typeof describeAbilityPayment>
      >['paymentCosts']
      canPay: boolean
    }
)

type TriggeredEffectChoice = {
  choiceId: string
  memberId: string
  decisionDeadlineAt: null
  effects: TriggeredEffectOption[]
}

type TriggerContinuation =
  | { type: 'combatTurn' | 'combatEscape' }
  | { type: 'combatEntry'; id: string; card: TCombatEventCard }

type PendingTriggeredEffects = {
  effects: PendingTriggeredEffect[]
  choice: TriggeredEffectChoice
  continuation?: TriggerContinuation
  defeats?: CombatNotice[]
}

function triggeredEffectEnemyCount(
  battle?: TCombatState,
  continuation?: TriggerContinuation
) {
  if (battle) return battle.enemies.filter(({ health }) => health > 0).length
  return continuation?.type === 'combatEntry'
    ? continuation.card.enemies.reduce((count, enemy) => count + enemy.count, 0)
    : 0
}

export type TTriggeredEffectRefusal =
  | 'staleTriggeredEffectChoice'
  | 'triggeredEffectUnavailable'
  | 'choicePending'
  | 'paymentInvalid'

export type TCombatResult = {
  combatId: string
  cardId: string
  memberId: string
  resolution: 'victory' | 'defeat' | 'escaped'
  cause: 'enemiesDefeated' | 'playerDown' | 'escapeSucceeded' | 'cycleLimit'
  playerDown: boolean
  peakDelta: number
}

type OutcomeCursor = { nextStep: number; nextCopy?: number }

type CombatOutcome = {
  card: TCombatEventCard
  zoneType: TEventDeck['zoneType']
  cursor: OutcomeCursor
  startingPeak: number
  victoryPeak: number
}

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
  upgradedCombatDecks?: readonly TEventDeck['zoneType'][]
  eventEncounter?: TEventEncounter | null
  combat?: TCombatState | null
  combatZone?: TEventDeck['zoneType']
  lastCombatResult?: TCombatResult | null
  combatOutcome?: CombatOutcome | null
  pendingTriggeredEffects?: PendingTriggeredEffects | null
  triggeredEffectSequence?: number
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
  private readonly updates: TCombatUpdate[] = []

  get combatUpdates(): readonly TCombatUpdate[] {
    return this.updates
  }

  clearCombatUpdates(): void {
    this.updates.length = 0
  }

  get triggeredEffectChoice(): TriggeredEffectChoice | null {
    return this.props.pendingTriggeredEffects?.choice ?? null
  }

  get lastCombatResult(): TCombatResult | null {
    return this.props.lastCombatResult ?? null
  }

  get combatOutcomeZone() {
    return this.props.combatOutcome?.zoneType ?? this.props.combatZone
  }

  get combatOutcomeCard() {
    const continuation = this.props.pendingTriggeredEffects?.continuation
    return (
      this.props.combatOutcome?.card ??
      this.props.combat?.card ??
      (continuation?.type === 'combatEntry' ? continuation.card : undefined)
    )
  }

  get combat() {
    return this.describeCombat(this.eventCatalog)
  }

  combatSnapshot() {
    const {
      combat,
      combatZone,
      lastCombatResult,
      combatOutcome,
      pendingTriggeredEffects,
      triggeredEffectSequence,
      upgradedCombatDecks,
    } = this.props
    return {
      combat,
      combatZone,
      lastCombatResult,
      combatOutcome,
      pendingTriggeredEffects,
      triggeredEffectSequence,
      upgradedCombatDecks,
    }
  }

  describeCombat(cards: ReadonlyMap<string, TCard>) {
    const state = this.props.combat
    if (!state) return null
    const player = this.props.members[this.actorIndex()].player
    return {
      id: state.id,
      card: state.card,
      memberId: state.memberId,
      cycle: state.cycle,
      maxCycles: state.maxCycles,
      order: state.order,
      turn: {
        id: state.turn.id,
        actorId: state.turn.actorId,
        phase: state.turn.phase,
        attacksRemaining: state.turn.attacksRemaining,
      },
      enemies: state.enemies.map((enemy) => ({
        id: enemy.id,
        blockIndex: enemy.blockIndex,
        copyIndex: enemy.copyIndex,
        health: enemy.health,
        maxHealth: enemy.maxHealth,
        vigor: enemy.vigor,
        element: enemy.element,
        effectiveModifiers: enemy.effectiveModifiers,
        statuses: enemy.statuses,
      })),
      escape: this.combatEscape(state, player),
      attackTargetIds: combatAttackTargets(state, player.health),
      abilities: this.abilityOptions(player, cards, state),
      effects: this.combatEffectOptions(state, player, cards).map(
        ({ effectId, text, origin, vigorCost, paymentCosts, targetIds }) => ({
          effectId,
          text,
          origin,
          vigorCost,
          paymentCosts,
          targetIds,
        })
      ),
      abilityStates: [
        ...EQUIPMENT_SLOTS.flatMap((slot) => {
          const id = player.equipment[slot]
          const card = id ? cards.get(id) : null
          return card?.type === 'equipment'
            ? card.abilities.flatMap((ability) =>
                ability.id === undefined
                  ? []
                  : [
                      this.describeAbilityState(
                        state,
                        state.memberId,
                        slot,
                        ability,
                        ability.form === 'passive' &&
                          equippedAbility(
                            player,
                            cards,
                            slot,
                            ability.id,
                            true
                          ) !== null
                      ),
                    ]
              )
            : []
        }),
        ...state.enemies.flatMap((enemy) =>
          state.card.enemies[enemy.blockIndex].abilities.flatMap((ability) =>
            ability.id === undefined
              ? []
              : [
                  this.describeAbilityState(
                    state,
                    enemy.id,
                    null,
                    ability,
                    ability.form === 'passive'
                  ),
                ]
          )
        ),
      ],
    }
  }

  private describeAbilityState(
    state: TCombatState,
    actorId: string,
    equipmentSlot: TEquipmentSlot | null,
    ability: TExecutableAbility,
    passive: boolean
  ) {
    const usage = combatAbilityUsage(state, actorId, equipmentSlot, ability.id)
    return {
      actorId,
      equipmentSlot,
      abilityId: ability.id,
      cooldownRemaining: Math.max(
        0,
        (usage?.cooldown ?? 0) - Number(Boolean(usage?.uses))
      ),
      usesRemaining:
        ability.form === 'passive'
          ? 0
          : Math.max(0, ability.usesPerTurn - (usage?.uses ?? 0)),
      charges: ability.form === 'channeled' ? (usage?.charges ?? 0) : null,
      active: passive || (usage?.activeUntilCycle ?? 0) > state.cycle,
    }
  }

  adventureAbilityOptions(
    cards: ReadonlyMap<string, TCard> = this.eventCatalog
  ) {
    if (
      this.status !== 'inSession' ||
      this.props.combat ||
      this.triggeredEffectChoice ||
      this.pendingRewards.length ||
      this.eventEncounter?.outcome ||
      this.eventEncounter?.payments.length
    )
      return []
    const player = this.props.members[this.actorIndex()].player
    return player.down ? [] : this.abilityOptions(player, cards)
  }

  combatPlayerModifiers(cards: ReadonlyMap<string, TCard>) {
    const state = this.props.combat
    if (!state) return null
    return this.combatPlayer(
      this.props.members[this.actorIndex()].player,
      cards
    ).modifiers
  }

  private abilityOptions(
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    state?: TCombatState
  ) {
    if (
      player.health === 0 ||
      (state &&
        (state.turn.actorId !== state.memberId ||
          state.turn.phase !== 'prepare' ||
          combatIsTerminal(state, player.health)))
    )
      return []
    const enemies =
      state?.enemies.filter(({ health }) => health > 0).map(({ id }) => id) ??
      []
    return EQUIPMENT_SLOTS.flatMap((equipmentSlot) => {
      const cardId = player.equipment[equipmentSlot]
      const card = cardId ? cards.get(cardId) : undefined
      if (card?.type !== 'equipment') return []
      return card.abilities.flatMap((ability) => {
        if (
          ability.id === undefined ||
          ability.form === 'passive' ||
          ability.target === 'ally' ||
          !equippedAbility(
            player,
            cards,
            equipmentSlot,
            ability.id,
            Boolean(state)
          )
        )
          return []
        const usage = state
          ? combatAbilityUsage(state, state.memberId, equipmentSlot, ability.id)
          : player.abilityUsage?.[
              adventureAbilityKey(equipmentSlot, card.id, ability.id)
            ]
        if (
          (usage?.cooldown ?? 0) > 0 ||
          (usage?.uses ?? 0) >= ability.usesPerTurn ||
          (state && this.continuousAbilityActive(state, equipmentSlot, ability))
        )
          return []
        const payment = describeAbilityPayment(
          player,
          card.id,
          abilityWithModifiers(ability, player, cards, enemies.length).cost,
          cards,
          this.rngState,
          enemies.length
        )
        if (!payment) return []
        return [
          {
            ...payment,
            equipmentSlot,
            abilityId: ability.id,
            targetIds:
              ability.target === 'opponent' || ability.target === 'allOpponents'
                ? enemies
                : [],
          },
        ]
      })
    })
  }

  private continuousAbilityActive(
    state: TCombatState,
    slot: TEquipmentSlot,
    ability: TExecutableAbility
  ) {
    return (
      ability.form === 'continuous' &&
      state.abilityUsage?.some(
        (entry) =>
          entry.actorId === state.memberId &&
          entry.equipmentSlot === slot &&
          (entry.activeUntilCycle ?? 0) > state.cycle
      )
    )
  }

  private combatEffectOptions(
    state: TCombatState,
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>
  ) {
    if (
      state.turn.actorId !== state.memberId ||
      state.turn.phase !== 'prepare' ||
      combatIsTerminal(state, player.health)
    )
      return []
    const sources = [
      ...[...new Set(player.inventory.map(({ cardId }) => cardId))].flatMap(
        (cardId) => {
          const card = cards.get(cardId)
          return card?.type === 'item' ? [{ card, equipmentSlot: null }] : []
        }
      ),
      ...EQUIPMENT_SLOTS.flatMap((equipmentSlot) => {
        const cardId = player.equipment[equipmentSlot]
        const card = cardId ? cards.get(cardId) : null
        return card?.type === 'equipment' &&
          !player.brokenEquipment?.includes(equipmentSlot) &&
          (card.peakRequirement === null || player.peak >= card.peakRequirement)
          ? [{ card, equipmentSlot }]
          : []
      }),
    ]
    return sources.flatMap(({ card, equipmentSlot }) =>
      card.effects.flatMap((effect, effectIndex) => {
        if (effect.trigger !== null || !effect.cost.length) return []
        const nullified = player.statuses.some(({ activation }) =>
          activation.some(
            (entry) =>
              entry.kind === 'nullifyEffects' &&
              ((equipmentSlot &&
                entry.target === 'equipment' &&
                (!entry.slots.length || entry.slots.includes(equipmentSlot))) ||
                (card.type === 'item' &&
                  entry.target === 'item' &&
                  (!entry.itemCategories.length ||
                    entry.itemCategories.includes(card.itemCategory))))
          )
        )
        if (nullified) return []
        const payment = describeAbilityPayment(
          player,
          card.id,
          effect.cost,
          cards,
          this.rngState,
          state.enemies.filter(({ health }) => health > 0).length
        )
        if (!payment) return []
        const targetsEnemy = effect.activation.some(
          ({ kind }) =>
            kind === 'effectDamage' ||
            kind === 'enemyModifierFlat' ||
            kind === 'defeatEnemy' ||
            kind === 'removeEnemyElement' ||
            kind === 'skipEnemyTurn' ||
            kind === 'swapCombatOrder' ||
            kind === 'elementVulnerability'
        )
        return [
          {
            ...payment,
            effect,
            text: effect.text,
            targetIds: targetsEnemy
              ? state.enemies
                  .filter(({ health }) => health > 0)
                  .map(({ id }) => id)
              : [],
            effectId: JSON.stringify([
              state.turn.id,
              equipmentSlot,
              card.id,
              effectIndex,
            ]),
            origin:
              equipmentSlot === null
                ? { type: 'inventory' as const, cardId: card.id, effectIndex }
                : {
                    type: 'equipment' as const,
                    equipmentSlot,
                    cardId: card.id,
                    effectIndex,
                  },
          },
        ]
      })
    )
  }

  eventActionBlock(
    action: TPartyAction
  ): TEventRefusal | TCombatRefusal | null {
    if (action.type === 'resolveTriggeredEffect') return null
    if ('combatId' in action) return null
    if (this.triggeredEffectChoice) return 'choicePending'
    if (this.props.combat) return 'combatInProgress'
    if (action.type === 'resolveReward') return null
    if (this.props.pendingReward) return 'choicePending'
    if (this.props.members[this.actorIndex()]?.player.down) return 'playerDown'
    if ('encounterId' in action) return null
    const encounter = this.eventEncounter
    if (!encounter) return null
    switch (action.type) {
      case 'prepare':
        if (encounter.outcome) return 'choicePending'
        if (encounter.payments.length) return 'eventPaymentStarted'
        return action.operation === 'activate' ||
          action.operation === 'useAbility'
          ? null
          : 'choicePending'
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
      ? [
          ...deck.cards,
          ...deck.discard,
          ...this.combatDeckAdditions(
            zone.zoneType,
            dimension,
            cards,
            combatEnabled
          ),
        ]
      : (dimension?.eventDecks
          ?.find((entry) => entry.zoneType === zone.zoneType)
          ?.cards.map(({ cardId }) => cardId) ?? [])
    return ids.some((id) =>
      combatEnabled
        ? isPlayableEvent(cards.get(id))
        : isExecutableEvent(cards.get(id))
    )
  }

  combatActions(state = this.combat): TCombatAction['type'][] {
    if (
      !state ||
      state.turn.actorId !== state.memberId ||
      combatIsTerminal(
        state,
        this.props.members[this.actorIndex()].player.health
      )
    )
      return []
    const actions: TCombatAction['type'][] = []
    if (state.effects.length) actions.push('activateCombatEffect')
    if (state.abilities.length) actions.push('useAbility')
    if (state.escape.unavailableReason === null) actions.push('escapeCombat')
    if (state.attackTargetIds.length) actions.push('combatAttack')
    actions.push('endCombatTurn')
    return actions
  }

  private combatDeckAdditions(
    zoneType: TEventDeck['zoneType'],
    dimension: TDimensionCard | null,
    cards: ReadonlyMap<string, TCard>,
    combatEnabled: boolean
  ): string[] {
    const upgraded = this.props.upgradedCombatDecks
    if (
      !combatEnabled ||
      !upgraded ||
      upgraded.includes(zoneType) ||
      !dimension
    )
      return []
    return (
      dimension.eventDecks?.find((entry) => entry.zoneType === zoneType)
        ?.cards ?? []
    )
      .filter(({ cardId }) => isExecutableCombatEvent(cards.get(cardId)))
      .flatMap(({ cardId, copies }) =>
        Array.from({ length: copies }, () => cardId)
      )
  }

  private combatPlayer(
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    power?: number,
    projectile = false,
    battle: TCombatState | null | undefined = this.props.combat
  ): Parameters<typeof resolveCombatTurn>[1] {
    const equipment = EQUIPMENT_SLOTS.flatMap((slot) => {
      if (player.brokenEquipment?.includes(slot)) return []
      const id = player.equipment[slot]
      const card = id ? cards.get(id) : undefined
      return card?.type === 'equipment' ? [card] : []
    })
    const conditional = battle
      ? this.conditionalCombatStatuses(player, cards, battle)
      : []
    return {
      health: player.health,
      snapshot: player,
      update: (update) => this.updates.push(update),
      withSnapshot: (state) =>
        this.combatPlayer(state, cards, power, projectile, battle),
      statuses: player.statuses,
      projectileAccuracyIncluded: projectile,
      brokenEquipment: player.brokenEquipment,
      equippedSlots: EQUIPMENT_SLOTS.filter(
        (slot) => player.equipment[slot] !== null
      ),
      reactionPending: () => this.triggeredEffectChoice !== null,
      react: (fighter, state, notices, rng) => {
        const triggered = this.resolveCombatReactions(
          fighter.snapshot ?? player,
          cards,
          rng.state(),
          state,
          notices
        )
        return {
          fighter: this.combatPlayer(
            triggered.player,
            cards,
            power,
            projectile,
            triggered.battle ?? state
          ),
          rng: SeededRng.fromState(triggered.rngState),
          state: triggered.battle,
        }
      },
      refresh: (health, statuses, brokenEquipment) =>
        this.combatPlayer(
          { ...player, health, statuses, brokenEquipment },
          cards,
          power,
          projectile,
          battle
        ),
      shield: equipment.some(
        (card) =>
          card.slot === 'shield' &&
          (card.peakRequirement === null || player.peak >= card.peakRequirement)
      ),
      modifiers: effectiveModifiers({
        ...player,
        equipment,
        statuses: [...player.statuses, ...conditional],
        abilityOwner: player,
        combat: {
          power,
          projectileAccuracyBonusPercent: projectile
            ? this.config.projectileAccuracyBonusPercent
            : 0,
          exhaustionPenaltyPercent:
            player.vigor === 0 ? this.config.exhaustionPenaltyPercent : 0,
        },
      }),
    }
  }

  private conditionalCombatStatuses(
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    state: TCombatState
  ) {
    const living = state.enemies.filter(({ health }) => health > 0).length
    const used =
      state.abilityUsage?.filter(({ actorId }) => actorId === state.memberId) ??
      []
    const first = used[0]?.element
    const same =
      first !== undefined &&
      first !== null &&
      used.every(({ element }) => element === first)
    return this.abilityTriggerSources(player, cards, state).flatMap((origin) =>
      origin.effects.flatMap((effect, index) => {
        const trigger = effect.trigger
        if (!trigger || effect.cost.length !== 0) return []
        let matches = trigger.kind === 'whileUsedAbilitiesSameElement' && same
        if (trigger.kind === 'whileEnemyCount') {
          const { count, op } = trigger
          matches = {
            eq: living === count,
            lt: living < count,
            lte: living <= count,
            gt: living > count,
            gte: living >= count,
          }[op]
        }
        if (!matches) return []
        const status = abilityEffectStatus(
          {
            ...effect,
            duration: { kind: 'infinite' },
            mark:
              'mark' in effect
                ? (effect.mark ?? 'buff')
                : effect.polarity === 'positive'
                  ? 'buff'
                  : 'debuff',
          },
          origin.id,
          `${state.id}:conditional:${origin.key}:${index}`,
          index
        )
        return status ? [status] : []
      })
    )
  }

  takeCombatAction(
    action: TCombatAction,
    cards: ReadonlyMap<string, TCard>,
    at: Date
  ): Either<TCombatRefusal, void> {
    const state = this.props.combat
    if (!state || state.id !== action.combatId) return left('staleCombat')
    if (state.turn.id !== action.turnId) return left('staleCombatTurn')
    if (this.triggeredEffectChoice) return left('choicePending')
    const index = this.actorIndex()
    const player = this.props.members[index].player
    if (player.health === 0) return left('playerDown')
    if (
      action.type === 'useAbility' ||
      action.type === 'activateCombatEffect'
    ) {
      if (
        state.turn.actorId !== state.memberId ||
        state.turn.phase !== 'prepare' ||
        combatIsTerminal(state, player.health)
      )
        return left('wrongCombatPhase')
      return action.type === 'useAbility'
        ? this.useCombatAbility(action, state, index, player, cards, at)
        : this.activateCombatEffect(action, state, index, player, cards, at)
    }
    if (action.type === 'escapeCombat') {
      if (
        state.turn.actorId !== state.memberId ||
        combatIsTerminal(state, player.health)
      )
        return left('wrongCombatPhase')
      const escape = this.combatEscape(state, player)
      if (escape.unavailableReason) return left(escape.unavailableReason)
      const reaction = this.resolveCombatReactions(
        player,
        cards,
        this.rngState,
        state,
        [],
        `${state.turn.id}:escape`,
        (trigger) => trigger?.kind === 'onCombatFleeAttempt'
      )
      const battle = reaction.battle ?? state
      this.props.rngState = reaction.rngState
      this.eventCatalog = cards
      const pending = this.props.pendingTriggeredEffects
      if (pending) {
        pending.continuation = { type: 'combatEscape' }
        this.props.combat = battle
        this.replaceActor(index, reaction.player)
      } else {
        this.resolveCombatEscape(battle, index, reaction.player, cards)
      }
      this.props.savedAt = at
      return right(undefined)
    }
    if (!this.combatActions().includes(action.type))
      return left('wrongCombatPhase')
    const targetId =
      action.type === 'combatAttack' ? action.targetId : undefined
    if (
      targetId !== undefined &&
      !combatAttackTargets(state, player.health).includes(targetId)
    )
      return left('combatTargetUnavailable')

    this.finishCombatTurn(state, index, player, cards, targetId)
    this.props.savedAt = at
    return right(undefined)
  }

  private finishCombatTurn(
    state: TCombatState,
    index: number,
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    targetId?: string,
    resume = false,
    failedEscape = false
  ) {
    const resolved = resolveCombatTurn(
      state,
      this.combatPlayer(player, cards, undefined, false, state),
      this.config,
      SeededRng.fromState(this.rngState),
      targetId,
      resume,
      failedEscape
    )
    const pending = this.props.pendingTriggeredEffects
    if (pending) pending.continuation = { type: 'combatTurn' }
    this.props.rngState = resolved.rngState
    this.eventCatalog = cards
    this.settleCombat(
      index,
      resolved.state,
      {
        ...(resolved.snapshot ?? player),
        health: resolved.health,
        statuses: resolved.statuses,
        brokenEquipment: resolved.brokenEquipment,
      },
      cards,
      { playerDownBeforeLastEnemy: resolved.playerDownBeforeLastEnemy }
    )
  }

  private settleCombat(
    index: number,
    state: TCombatState,
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    { escaped = false, playerDownBeforeLastEnemy = false } = {}
  ) {
    const won =
      !playerDownBeforeLastEnemy &&
      state.enemies.every(({ health }) => health === 0)
    const down = player.health === 0
    if (
      this.triggeredEffectChoice ||
      (!escaped && !combatIsTerminal(state, player.health))
    ) {
      this.props.combat = state
      this.replaceActor(index, player)
      return
    }
    const resolution = won ? 'victory' : down ? 'defeat' : 'escaped'
    const cause = won
      ? 'enemiesDefeated'
      : down
        ? 'playerDown'
        : escaped
          ? 'escapeSucceeded'
          : 'cycleLimit'
    const startingPeak = player.peak
    const peak =
      resolution === 'escaped'
        ? Math.max(0, player.peak - this.config.combatEscapePeakLoss)
        : player.peak
    player = {
      ...player,
      down,
      peak,
      vigor: Math.min(peak, player.vigor),
      health: Math.min(player.health, maxHealthOf({ ...player, peak })),
      abilityUsage: undefined,
      statuses: combatStatusesAfterEnd(player.statuses, won),
    }
    this.props.combat = null
    this.props.lastCombatResult = {
      combatId: state.id,
      cardId: state.card.id,
      memberId: state.memberId,
      resolution,
      cause,
      playerDown: down,
      peakDelta: peak - startingPeak,
    }
    const zoneType = this.props.combatZone
    this.props.combatZone = undefined
    if (zoneType === undefined) {
      this.replaceActor(index, player)
      this.updates.push({
        type: 'combatEnded',
        combatId: state.id,
        result: this.props.lastCombatResult,
      })
      return
    }
    const victoryPeak =
      won &&
      !state.card.goodOutcome.steps?.some(
        (step) =>
          step.type === 'effect' &&
          step.effect.activation.some(({ kind }) => kind === 'gainPeak')
      )
        ? state.card.enemies.reduce(
            (total, enemy) =>
              total +
              enemy.count *
                (enemy.enemyCategory === 'boss'
                  ? 15
                  : enemy.enemyCategory === 'elite'
                    ? 3
                    : 1),
            0
          )
        : 0
    this.props.combatOutcome = {
      card: state.card,
      zoneType,
      cursor: { nextStep: 0 },
      startingPeak,
      victoryPeak,
    }
    this.finishCombatOutcome(index, player, cards)
    this.updates.push({
      type: 'combatEnded',
      combatId: state.id,
      result: this.props.lastCombatResult!,
    })
  }

  private finishCombatOutcome(
    index: number,
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    ids?: IdGenerator
  ) {
    const result = this.props.lastCombatResult
    const pending = this.props.combatOutcome
    if (!result || !pending) return
    const { card, zoneType, startingPeak } = pending
    const phase = result.resolution === 'victory' ? 'success' : 'setback'
    const outcome =
      result.resolution === 'escaped'
        ? null
        : phase === 'success'
          ? card.goodOutcome
          : card.badOutcome
    const resolved = this.resolveOutcomeSteps(
      player,
      outcome?.steps ?? [],
      pending.cursor,
      zoneType,
      card.id,
      result.combatId,
      phase,
      { type: 'combatEvent', combatId: result.combatId },
      cards,
      ids
    )
    player = {
      ...resolved.player,
      peak: resolved.player.peak + (resolved.cursor ? 0 : pending.victoryPeak),
      down: resolved.player.health === 0 || result.playerDown,
      health: result.playerDown ? 0 : resolved.player.health,
    }
    this.props.lastCombatResult = {
      ...result,
      playerDown: player.down === true,
      peakDelta: player.peak - startingPeak,
    }
    this.replaceActor(index, player)
    if (resolved.cursor) {
      this.props.combatOutcome = { ...pending, cursor: resolved.cursor }
      return
    }
    this.props.combatOutcome = null
    this.discardEventCard(zoneType, card.id)
  }

  private useCombatAbility(
    action: Extract<TCombatAction, { type: 'useAbility' }>,
    state: TCombatState,
    index: number,
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    at: Date
  ): Either<TCombatRefusal, void> {
    const source = equippedAbility(
      player,
      cards,
      action.equipmentSlot,
      action.abilityId,
      true
    )
    if (!source || source.ability.form === 'passive')
      return left('combatAbilityUnavailable')
    const { card } = source
    const living = state.enemies.filter(({ health }) => health > 0)
    const ability = abilityWithModifiers(
      source.ability,
      player,
      cards,
      living.length
    )
    const usage = combatAbilityUsage(
      state,
      state.memberId,
      action.equipmentSlot,
      ability.id
    )
    if (
      (usage?.cooldown ?? 0) > 0 ||
      (usage?.uses ?? 0) >= ability.usesPerTurn ||
      this.continuousAbilityActive(state, action.equipmentSlot, ability)
    )
      return left('combatAbilityUnavailable')
    const targets =
      ability.target === 'opponent'
        ? living.filter(({ id }) => id === action.targetId)
        : ability.target === 'allOpponents'
          ? living
          : []
    if (
      ability.target === 'ally' ||
      (ability.target === 'opponent'
        ? targets.length === 0
        : action.targetId !== undefined)
    )
      return left('combatTargetUnavailable')
    const paid = payAbility(
      player,
      card.id,
      ability.cost,
      cards,
      this.rngState,
      action.payment,
      { enemyCount: living.length }
    )
    if (paid.isLeft()) return left(paid.value.reason)
    let rng = SeededRng.fromState(paid.value.rngState)
    this.updates.push({
      type: 'combatAbilityUsed',
      combatId: state.id,
      actorId: state.memberId,
      abilityId: ability.id,
      equipmentSlot: action.equipmentSlot,
    })
    const registered = registerCombatAbility(
      state,
      state.memberId,
      action.equipmentSlot,
      ability,
      player.health,
      card.id
    )
    let changed = {
      ...paid.value.player,
      statuses: statusesAfterAbility(
        paid.value.player.statuses,
        ability.element
      ) as readonly TPlayerStatus[],
    }
    let combat: TCombatState = registered.state
    const notices: CombatNotice[] = []
    const usedAbility: UsedTriggerAbility = {
      slot: action.equipmentSlot,
      abilityId: ability.id,
      includeOwnEffects: !registered.charging,
    }
    if (!registered.charging) {
      const active = this.prepareAbilityEffects(
        changed,
        cards,
        card,
        ability,
        rng.state(),
        living.length
      )
      changed = active.player
      rng = SeededRng.fromState(active.rngState)
      const effects = active.effects
      if (ability.target === 'self') {
        changed = effects.reduce(
          (current, effect, effectIndex) =>
            applyAbilityEffect(
              current,
              abilityEffectDuration(ability, effect),
              card.id,
              `${state.turn.id}:${action.equipmentSlot}:${ability.id}:${usage?.uses ?? 0}:${effectIndex}`,
              this.config.purseCapacity,
              effectIndex
            ),
          changed
        )
      } else {
        const resolved = resolvePlayerAbility(
          combat,
          this.combatPlayer(
            changed,
            cards,
            ability.power ?? undefined,
            (ability.channel?.releaseForm ?? ability.form) === 'projectile',
            combat
          ),
          { ...ability, effects },
          targets,
          this.config,
          rng
        )
        combat = resolved.state
        usedAbility.hitTargets = resolved.hitTargets
        usedAbility.advantageTargets = resolved.advantageTargets
        changed = {
          ...changed,
          health: resolved.health,
          statuses: changed.statuses.filter(
            ({ duration }) =>
              (!resolved.attacked || duration.kind !== 'untilAttackMade') &&
              (!resolved.missed || duration.kind !== 'untilAttackMissed') &&
              (!resolved.reflected || duration.kind !== 'untilDamageTaken')
          ),
        }
        if (resolved.advantageHit) notices.push({ type: 'elementalAdvantage' })
      }
      combat = this.applyCombatTurnEffects(combat, effects)
    }
    let reactions = this.resolveCombatReactions(
      changed,
      cards,
      rng.state(),
      combat,
      [...notices, ...enemyDefeatNotices(state, combat)],
      `${state.turn.id}:${action.equipmentSlot}:${ability.id}:${usage?.uses ?? 0}`,
      (trigger) =>
        matchesAbilityUse(trigger, card, action.equipmentSlot, ability),
      usedAbility
    )
    if (reactions.battle) {
      const defeats = enemyDefeatNotices(combat, reactions.battle)
      if (defeats.length)
        reactions = this.resolveCombatReactions(
          reactions.player,
          cards,
          reactions.rngState,
          reactions.battle,
          defeats
        )
    }
    changed = reactions.player
    combat = reactions.battle ?? combat
    this.eventCatalog = cards
    this.props.rngState = reactions.rngState
    this.settleCombat(index, combat, changed, cards)
    this.props.savedAt = at
    return right(undefined)
  }

  private applyCombatTurnEffects(
    state: TCombatState,
    effects: readonly Pick<TEffect, 'activation'>[]
  ) {
    const extraAttacks = effects
      .flatMap(({ activation }) => activation)
      .reduce(
        (count, effect) =>
          effect.kind === 'extraAttack' ? count + effect.count : count,
        0
      )
    return extraAttacks > 0
      ? {
          ...state,
          turn: {
            ...state.turn,
            attacksRemaining: state.turn.attacksRemaining + extraAttacks,
          },
        }
      : state
  }

  private activateCombatEffect(
    action: Extract<TCombatAction, { type: 'activateCombatEffect' }>,
    state: TCombatState,
    index: number,
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    at: Date
  ): Either<TCombatRefusal, void> {
    const option = this.combatEffectOptions(state, player, cards).find(
      ({ effectId }) => effectId === action.effectId
    )
    if (!option) return left('notActivatable')
    const target = state.enemies.find(
      ({ id, health }) => id === action.targetId && health > 0
    )
    if (option.targetIds.length ? !target : action.targetId !== undefined)
      return left('combatTargetUnavailable')
    const { origin, effect } = option
    const paid = payAbility(
      player,
      origin.cardId,
      effect.cost,
      cards,
      this.rngState,
      action.payment,
      { enemyCount: state.enemies.filter(({ health }) => health > 0).length }
    )
    if (paid.isLeft()) return left(paid.value.reason)
    this.updates.push({
      type: 'combatEffectActivated',
      combatId: state.id,
      actorId: state.memberId,
      effectId: option.effectId,
    })
    const rng = SeededRng.fromState(paid.value.rngState)
    const changed = paid.value.player
    const resolved = target
      ? resolvePlayerAbility(
          state,
          this.combatPlayer(changed, cards),
          {
            id: option.effectId,
            form: 'targeted',
            channel: null,
            element: null,
            power: null,
            effects: [effect],
            duration: null,
          },
          [target],
          this.config,
          rng
        )
      : {
          state,
          health: changed.health,
          player: applyAbilityEffect(
            changed,
            effect,
            origin.cardId,
            option.effectId,
            this.config.purseCapacity,
            origin.effectIndex
          ),
        }
    const combat = this.applyCombatTurnEffects(resolved.state, [effect])
    const reactions = this.resolveCombatReactions(
      'player' in resolved
        ? resolved.player
        : { ...changed, health: resolved.health },
      cards,
      rng.state(),
      combat,
      enemyDefeatNotices(state, resolved.state)
    )
    const finalCombat = reactions.battle ?? combat
    this.props.rngState = reactions.rngState
    this.settleCombat(index, finalCombat, reactions.player, cards)
    this.props.savedAt = at
    this.eventCatalog = cards
    return right(undefined)
  }

  useAdventureAbility(
    operation: Extract<TPrepareOperation, { operation: 'useAbility' }>,
    zone: TZoneCard | null,
    dimension: TDimensionCard | null,
    cards: ReadonlyMap<string, TCard>,
    at: Date
  ): Either<
    | TCombatRefusal
    | 'eventPaymentStarted'
    | 'choicePending'
    | 'sessionNotActive',
    void
  > {
    if (this.status !== 'inSession') return left('sessionNotActive')
    const blocked = this.eventActionBlock({ type: 'prepare', ...operation })
    if (
      blocked === 'combatInProgress' ||
      blocked === 'eventPaymentStarted' ||
      blocked === 'choicePending'
    )
      return left(blocked)
    const index = this.actorIndex()
    const player = this.props.members[index].player
    if (player.health === 0) return left('playerDown')
    const source = equippedAbility(
      player,
      cards,
      operation.equipmentSlot,
      operation.abilityId,
      false
    )
    if (!source || source.ability.form === 'passive')
      return left('combatAbilityUnavailable')
    const { card } = source
    const ability = abilityWithModifiers(source.ability, player, cards)
    const key = adventureAbilityKey(
      operation.equipmentSlot,
      card.id,
      ability.id
    )
    const previous = player.abilityUsage?.[key]
    if (
      (previous?.cooldown ?? 0) > 0 ||
      (previous?.uses ?? 0) >= ability.usesPerTurn
    )
      return left('combatAbilityUnavailable')
    const paid = payAbility(
      player,
      card.id,
      ability.cost,
      cards,
      this.rngState,
      operation.payment
    )
    if (paid.isLeft()) return left(paid.value.reason)
    let changed = {
      ...paid.value.player,
      statuses: statusesAfterAbility(
        paid.value.player.statuses,
        ability.element
      ) as readonly TPlayerStatus[],
    }
    let rngState = paid.value.rngState ?? this.rngState
    const usage = (previous?.uses ?? 0) + 1
    const statusId = JSON.stringify([
      this.turn.round,
      this.turn.memberId.toString(),
      key,
      usage,
    ])
    const active = this.prepareAbilityEffects(
      changed,
      cards,
      card,
      ability,
      rngState
    )
    changed = active.player
    rngState = active.rngState
    active.effects.forEach((effect, effectIndex) => {
      changed = applyAbilityEffect(
        changed,
        abilityEffectDuration(ability, effect),
        card.id,
        `${statusId}:ability:${effectIndex}`,
        this.config.purseCapacity,
        effectIndex
      )
    })
    const triggered = this.resolveAbilityTriggers(
      changed,
      cards,
      rngState,
      (trigger) =>
        matchesAbilityUse(trigger, card, operation.equipmentSlot, ability),
      statusId,
      zone,
      dimension,
      undefined,
      {
        slot: operation.equipmentSlot,
        abilityId: ability.id,
        includeOwnEffects: true,
      }
    )
    changed = triggered.player
    rngState = triggered.rngState
    this.replaceActor(index, {
      ...changed,
      abilityUsage: {
        ...player.abilityUsage,
        [key]: {
          uses: usage,
          cooldown: ability.cooldown + (ability.cooldown > 0 ? 1 : 0),
        },
      },
    })
    this.props.rngState = rngState
    this.eventCatalog = cards
    this.props.savedAt = at
    return right(undefined)
  }

  private prepareAbilityEffects(
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    card: TEquipmentCard,
    ability: TExecutableAbility,
    initialRng: RngState,
    enemyCount = 0
  ) {
    let changed = player
    let rngState = initialRng
    const effects = ability.effects.flatMap((effect) => {
      if (effect.trigger !== null) return []
      const paid = payAbility(
        changed,
        card.id,
        effect.cost,
        cards,
        rngState,
        undefined,
        { enemyCount }
      )
      if (paid.isLeft()) return []
      changed = paid.value.player
      rngState = paid.value.rngState
      return [effect]
    })
    return { effects, player: changed, rngState }
  }

  private resolveAbilityTriggers(
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    initialRng: RngState,
    matches: (trigger: TTrigger | null) => boolean,
    statusId: string,
    foundZone?: TZoneCard | null,
    foundDimension?: TDimensionCard | null,
    battle?: TCombatState,
    usedAbility?: UsedTriggerAbility,
    entry?: Extract<TriggerContinuation, { type: 'combatEntry' }>
  ) {
    let changed = player
    let rngState = initialRng
    const pending: PendingTriggeredEffect[] = []
    const sources = this.abilityTriggerSources(
      player,
      cards,
      battle,
      foundZone,
      foundDimension,
      usedAbility,
      entry !== undefined
    )
    for (const origin of sources) {
      origin.effects.forEach((effect, effectIndex) => {
        if (!matches(effect.trigger)) return
        const effectId = `${statusId}:trigger:${origin.key}:${effectIndex}`
        if (origin.origin) {
          pending.push({ sourceKey: origin.key, effectIndex, effectId })
          return
        }
        const paid = payAbility(
          changed,
          origin.id,
          effect.cost,
          cards,
          rngState,
          undefined,
          {
            enemyCount: battle?.enemies.filter(({ health }) => health > 0)
              .length,
          }
        )
        if (paid.isLeft()) return
        rngState = paid.value.rngState
        changed = this.applyTriggeredEffect(
          paid.value.player,
          effect,
          origin.id,
          effectId,
          effectIndex
        )
      })
    }
    if (usedAbility?.includeOwnEffects) {
      const { slot, abilityId } = usedAbility
      const source = equippedAbility(
        player,
        cards,
        slot,
        abilityId,
        battle !== undefined
      )
      source?.ability.effects.forEach((effect, effectIndex) => {
        if (!matches(effect.trigger)) return
        const targetIds =
          source.ability.target === 'self'
            ? undefined
            : effect.trigger?.kind === 'onElementalAdvantageHit'
              ? usedAbility.advantageTargets
              : usedAbility.hitTargets
        if (source.ability.target !== 'self' && !targetIds?.length) return
        const sourceKey = `${slot}:${source.card.id}:${abilityId}`
        pending.push({
          sourceKey,
          effectIndex,
          effectId: `${statusId}:trigger:${sourceKey}:${effectIndex}`,
          usedAbility: { slot, abilityId },
          targetIds,
        })
      })
    }
    if (pending.length) {
      return this.advanceTriggeredEffects(
        pending,
        changed,
        cards,
        rngState,
        battle,
        entry
      )
    }
    return { player: changed, rngState, battle }
  }

  private applyTriggeredEffect(
    player: TPlayerState,
    effect: TEffect | TZoneEffect,
    cardId: string,
    effectId: string,
    effectIndex: number
  ) {
    return applyAbilityEffect(
      player,
      {
        ...effect,
        mark:
          'mark' in effect
            ? effect.mark
            : effect.polarity === 'positive'
              ? 'buff'
              : 'debuff',
      },
      cardId,
      effectId,
      this.config.purseCapacity,
      effectIndex
    )
  }

  private eligibleTriggeredEffects(
    group: PendingTriggeredEffect[],
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    battle?: TCombatState,
    enteringCombat = false
  ): EligibleTriggeredEffect[] {
    const sources = this.abilityTriggerSources(
      player,
      cards,
      battle,
      undefined,
      undefined,
      undefined,
      enteringCombat
    )
    return group.flatMap<EligibleTriggeredEffect>((entry) => {
      if (entry.usedAbility) {
        const { slot, abilityId } = entry.usedAbility
        const source = equippedAbility(
          player,
          cards,
          slot,
          abilityId,
          battle !== undefined
        )
        const effect = source?.ability.effects[entry.effectIndex]
        if (
          !source ||
          !effect ||
          entry.sourceKey !== `${slot}:${source.card.id}:${abilityId}`
        )
          return []
        const origin = {
          type: 'equipmentAbility' as const,
          cardId: source.card.id,
          equipmentSlot: slot,
          abilityId,
        }
        if (
          entry.targetIds &&
          !battle?.enemies.some(
            ({ id, health }) => health > 0 && entry.targetIds?.includes(id)
          )
        )
          return []
        return [
          {
            ...entry,
            origin,
            effect: abilityEffectDuration(source.ability, effect),
            ability: source.ability,
          },
        ]
      }
      const source = sources.find(({ key }) => key === entry.sourceKey)
      const effect = source?.effects[entry.effectIndex]
      return source?.origin && effect
        ? [{ ...entry, origin: source.origin, effect }]
        : []
    })
  }

  private advanceTriggeredEffects(
    effects: PendingTriggeredEffect[],
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    rngState: RngState,
    battle?: TCombatState,
    continuation?: TriggerContinuation
  ) {
    this.props.pendingTriggeredEffects = null
    const eligible = this.eligibleTriggeredEffects(
      effects,
      player,
      cards,
      battle,
      continuation?.type === 'combatEntry'
    )
    const first = eligible[0]
    if (!first) return { player, rngState, battle }
    if (eligible.length === 1 && first.effect.cost.length === 0) {
      return this.applySelectedTriggeredEffect(
        first,
        player,
        cards,
        rngState,
        battle
      )
    }
    const enemyCount = triggeredEffectEnemyCount(battle, continuation)
    const options = eligible.map(
      ({ effectId, effectIndex, origin, effect }): TriggeredEffectOption => {
        const option = {
          effectId,
          origin: { ...origin, effectIndex },
          text: effect.text,
        }
        if (!effect.cost.length)
          return { ...option, mode: 'automatic', paymentCosts: [] }
        const payment = describeAbilityPayment(
          player,
          origin.cardId,
          effect.cost,
          cards,
          rngState,
          enemyCount,
          true
        )!
        return {
          ...option,
          mode: 'optional',
          paymentCosts: payment.paymentCosts,
          canPay: payment.canPay,
        }
      }
    )
    const sequence = (this.props.triggeredEffectSequence ?? 0) + 1
    this.props.triggeredEffectSequence = sequence
    this.props.pendingTriggeredEffects = {
      effects: eligible.map(
        ({ sourceKey, effectId, effectIndex, usedAbility, targetIds }) => ({
          sourceKey,
          effectId,
          effectIndex,
          usedAbility,
          targetIds,
        })
      ),
      continuation,
      choice: {
        choiceId: `${this.id.toString()}:triggered-effect:${sequence}`,
        memberId: this.turn.memberId.toString(),
        decisionDeadlineAt: null,
        effects: options,
      },
    }
    return { player, rngState, battle }
  }

  private applySelectedTriggeredEffect(
    selected: EligibleTriggeredEffect,
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    rngState: RngState,
    battle?: TCombatState
  ) {
    const { effect, origin, effectId, effectIndex, targetIds } = selected
    if (battle)
      this.updates.push({
        type: 'combatEffectActivated',
        combatId: battle.id,
        actorId: battle.memberId,
        effectId,
      })
    if (battle && targetIds && 'mark' in effect && selected.ability) {
      const rng = SeededRng.fromState(rngState)
      const resolved = resolvePlayerAbility(
        battle,
        this.combatPlayer(player, cards, undefined, false, battle),
        {
          ...selected.ability,
          power: null,
          effects: [{ ...effect, trigger: null }],
        },
        battle.enemies.filter(({ id }) => targetIds.includes(id)),
        this.config,
        rng
      )
      return {
        player: { ...player, health: resolved.health },
        rngState: rng.state(),
        battle: this.applyCombatTurnEffects(resolved.state, [effect]),
      }
    }
    return {
      player: this.applyTriggeredEffect(
        player,
        effect,
        origin.cardId,
        effectId,
        effectIndex
      ),
      rngState,
      battle: battle && this.applyCombatTurnEffects(battle, [effect]),
    }
  }

  resolveTriggeredEffect(
    action: TResolveTriggeredEffectAction,
    cards: ReadonlyMap<string, TCard>,
    at: Date
  ): Either<TTriggeredEffectRefusal, void> {
    const pending = this.props.pendingTriggeredEffects
    if (!pending || pending.choice.choiceId !== action.choiceId)
      return left('staleTriggeredEffectChoice')
    if (this.turn.memberId.toString() !== pending.choice.memberId)
      return left('choicePending')
    const index = this.actorIndex()
    let battle = this.props.combat ?? undefined
    const { continuation } = pending
    let player = this.props.members[index].player
    let rngState = this.rngState
    const before = battle
    const selected = this.eligibleTriggeredEffects(
      pending.effects,
      player,
      cards,
      battle,
      continuation?.type === 'combatEntry'
    ).find(({ effectId }) => effectId === action.effectId)
    if (
      !selected ||
      (selected.effect.cost.length === 0) !== (action.decision === 'resolve')
    )
      return left('triggeredEffectUnavailable')
    if (action.decision === 'pay') {
      const paid = payAbility(
        player,
        selected.origin.cardId,
        selected.effect.cost,
        cards,
        rngState,
        action.payment,
        { enemyCount: triggeredEffectEnemyCount(battle, continuation) }
      )
      if (paid.isLeft()) return left('paymentInvalid')
      player = paid.value.player
      rngState = paid.value.rngState
    }
    if (action.decision !== 'decline') {
      const applied = this.applySelectedTriggeredEffect(
        selected,
        player,
        cards,
        rngState,
        battle
      )
      player = applied.player
      rngState = applied.rngState
      battle = applied.battle
    }
    let changed = this.advanceTriggeredEffects(
      pending.effects.filter(({ effectId }) => effectId !== action.effectId),
      player,
      cards,
      rngState,
      battle,
      continuation
    )
    const defeats = [
      ...(pending.defeats ?? []),
      ...(before && changed.battle
        ? enemyDefeatNotices(before, changed.battle)
        : []),
    ]
    if (defeats.length && changed.battle) {
      const next = this.props.pendingTriggeredEffects
      if (next) {
        next.defeats = defeats
      } else {
        changed = this.resolveCombatReactions(
          changed.player,
          cards,
          changed.rngState,
          changed.battle,
          defeats
        )
      }
    }
    this.props.rngState = changed.rngState
    battle = changed.battle
    if (battle) this.props.combat = battle
    this.eventCatalog = cards
    this.replaceActor(index, changed.player)
    if (!this.triggeredEffectChoice) {
      if (continuation?.type === 'combatEntry') {
        this.startCombat(
          continuation.id,
          continuation.card,
          index,
          changed.player,
          cards,
          changed.rngState
        )
      } else if (battle) {
        if (continuation?.type === 'combatTurn') {
          this.finishCombatTurn(
            battle,
            index,
            changed.player,
            cards,
            undefined,
            true
          )
        } else if (continuation?.type === 'combatEscape') {
          this.resolveCombatEscape(battle, index, changed.player, cards)
        } else {
          this.settleCombat(index, battle, changed.player, cards)
        }
      }
    }
    this.props.savedAt = at
    return right(undefined)
  }

  private abilityTriggerSources(
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    battle?: TCombatState,
    foundZone?: TZoneCard | null,
    foundDimension?: TDimensionCard | null,
    usedAbility?: { slot: TEquipmentSlot; abilityId: string },
    enteringCombat = false
  ): {
    id: string
    key: string
    effects: (TZoneCard | TEquipmentCard)['effects']
    origin?: TriggerSourceOrigin
  }[] {
    const zone = foundZone ?? cards.get(player.zoneId)
    const dimension =
      foundDimension ?? cards.get(this.dimension.dimensionCardId)
    return [
      ...(dimension?.type === 'dimension'
        ? [{ id: dimension.id, key: dimension.id, effects: dimension.effects }]
        : []),
      ...(zone?.type === 'zone'
        ? [{ id: zone.id, key: zone.id, effects: zone.effects }]
        : []),
      ...player.inventory.flatMap(({ cardId }) => {
        const card = cards.get(cardId)
        return card?.type === 'item'
          ? [
              {
                id: cardId,
                key: `inventory:${cardId}`,
                effects: card.effects,
                origin: { type: 'inventory' as const, cardId },
              },
            ]
          : []
      }),
      ...EQUIPMENT_SLOTS.flatMap((slot) => {
        const id = player.equipment[slot]
        const equipped = id ? cards.get(id) : undefined
        if (
          equipped?.type !== 'equipment' ||
          player.brokenEquipment?.includes(slot) ||
          player.peak < (equipped.peakRequirement ?? 0)
        )
          return []
        const abilities = equipped.abilities.flatMap((entry) => {
          if (entry.id === undefined || entry.target !== 'self') return []
          const source = equippedAbility(
            player,
            cards,
            slot,
            entry.id,
            battle !== undefined || enteringCombat
          )
          if (!source) return []
          const ability = source.ability
          const active =
            ability.form === 'continuous' &&
            battle !== undefined &&
            (slot !== usedAbility?.slot ||
              ability.id !== usedAbility.abilityId) &&
            (combatAbilityUsage(battle, battle.memberId, slot, ability.id)
              ?.activeUntilCycle ?? 0) > battle.cycle
          if (ability.form !== 'passive' && !active) return []
          return [
            {
              id: equipped.id,
              key: `${slot}:${equipped.id}:${ability.id}`,
              effects: ability.effects,
              origin: {
                type: 'equipmentAbility' as const,
                cardId: equipped.id,
                equipmentSlot: slot,
                abilityId: ability.id,
              },
            },
          ]
        })
        return [
          {
            id: equipped.id,
            key: slot,
            effects: equipped.effects,
            origin: {
              type: 'equipment' as const,
              cardId: equipped.id,
              equipmentSlot: slot,
            },
          },
          ...abilities,
        ]
      }),
    ]
  }

  private resolveCombatReactions(
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    rngState: RngState,
    state: TCombatState,
    notices: readonly CombatNotice[],
    statusId = `${state.turn.id}:reaction:${player.statuses.length}`,
    matchesUse?: (trigger: TTrigger | null) => boolean,
    usedAbility?: UsedTriggerAbility
  ) {
    if (player.health === 0 || (!notices.length && !matchesUse))
      return { player, rngState, battle: state }
    const defeats = notices.flatMap((notice) =>
      notice.type === 'enemyDefeated' ? [notice.id] : []
    )
    const defeated = state.enemies.filter(({ health }) => health === 0)
    const countDefeated = (distinct: boolean, previous: boolean) => {
      const enemies = previous
        ? defeated.filter(({ id }) => !defeats.includes(id))
        : defeated
      return distinct
        ? new Set(enemies.map(({ blockIndex }) => blockIndex)).size
        : enemies.length
    }
    return this.resolveAbilityTriggers(
      player,
      cards,
      rngState,
      (trigger) => {
        if (matchesUse?.(trigger)) return true
        switch (trigger?.kind) {
          case 'onAttackedByEnemyBehavior':
            return notices.some(
              (notice) =>
                notice.type === 'enemyAttack' &&
                notice.behavior === trigger.behavior
            )
          case 'onElementDamageTaken':
            return notices.some(
              (notice) =>
                notice.type === 'elementDamage' &&
                (trigger.element === null || notice.element === trigger.element)
            )
          case 'onElementalAdvantageHit':
            return notices.some(
              (notice) => notice.type === 'elementalAdvantage'
            )
          case 'onEnemyDefeated':
            return trigger.count === 1
              ? defeats.length > 0
              : countDefeated(trigger.distinct, true) < trigger.count &&
                  countDefeated(trigger.distinct, false) >= trigger.count
          case 'onEnemyCategoryDefeated':
            return defeated.some(
              ({ id, blockIndex }) =>
                defeats.includes(id) &&
                state.card.enemies[blockIndex].enemyCategory ===
                  trigger.category
            )
          default:
            return false
        }
      },
      statusId,
      undefined,
      undefined,
      state,
      usedAbility
    )
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
      const deck = this.eventDecks.find(
        (entry) => entry.zoneType === zone.zoneType
      )
      const additions = this.combatDeckAdditions(
        zone.zoneType,
        dimension,
        cards,
        combatEnabled
      )
      if (deck && additions.length) {
        // O v8 podia guardar cartas ainda inelegíveis no fim da pilha.
        const reservedIds = new Set(additions)
        this.updateEventDeck({
          ...deck,
          cards: [
            ...deck.cards.filter((id) => !reservedIds.has(id)),
            ...additions,
          ],
        })
      }
      if (!deck) {
        const configured = dimension?.eventDecks?.find(
          (entry) => entry.zoneType === zone.zoneType
        )
        const initial =
          configured?.cards.flatMap(({ cardId, copies }) =>
            Array.from({ length: copies }, () => cardId)
          ) ?? []
        const eligible = (id: string) =>
          combatEnabled && !this.props.upgradedCombatDecks
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
            ...initial.filter((id) => !eligible(id) && !additions.includes(id)),
            ...additions,
          ],
        })
      }
      const upgraded = this.props.upgradedCombatDecks
      if (
        combatEnabled &&
        dimension &&
        upgraded &&
        !upgraded.includes(zone.zoneType)
      )
        this.props.upgradedCombatDecks = [...upgraded, zone.zoneType]
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
          (combatEnabled &&
            (!this.props.upgradedCombatDecks ||
              this.props.upgradedCombatDecks.includes(encounter.zoneType)) &&
            isExecutableCombatEvent(card))
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
        const started = this.resolveAbilityTriggers(
          current,
          cards,
          rng.state(),
          (trigger) => {
            if (trigger?.kind === 'onEngageEnemyElement')
              return card.enemies.some(
                ({ element }) => element === trigger.element
              )
            if (trigger?.kind === 'onEngageEnemyType')
              return card.enemies.some(({ enemyTypes }) =>
                enemyTypes.some((type) => trigger.enemyTypes.includes(type))
              )
            return false
          },
          `${encounter.id}:combat-start`,
          zone,
          dimension,
          undefined,
          undefined,
          { type: 'combatEntry', id: encounter.id, card }
        )
        this.props.eventEncounter = null
        this.props.combatZone = encounter.zoneType
        this.props.lastCombatResult = null
        complete()
        if (this.triggeredEffectChoice) {
          this.props.rngState = started.rngState
          this.replaceActor(index, started.player)
        } else {
          this.startCombat(
            encounter.id,
            card,
            index,
            started.player,
            cards,
            started.rngState
          )
        }
        return right(undefined)
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
        const fell = changed.health === 0
        const afterPayment = fell ? { ...changed, down: true } : changed
        if (isLast) {
          const resolved = tryResolve(afterPayment, payments)
          if (resolved.isLeft()) return resolved
        } else if (fell) {
          finish(afterPayment, 'gaveUp', null, payments)
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
        return isLast || fell ? right(undefined) : complete()
      }
      case 'escapeEvent': {
        const escape = this.eventEscape(encounter, player)
        if (escape.unavailableReason) return left(escape.unavailableReason)
        const { naturalRoll, total, succeeded } = this.rollEscape(
          player,
          escape,
          rng
        )
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

  private startCombat(
    id: string,
    card: TCombatEventCard,
    index: number,
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>,
    rngState: RngState
  ) {
    player = { ...player, abilityUsage: undefined }
    const state = createCombat(
      id,
      card,
      this.turn.memberId.toString(),
      this.combatPlayer(player, cards),
      this.config
    )
    this.updates.push(
      {
        type: 'combatStarted',
        combatId: state.id,
        cardId: card.id,
        cardTitle: card.title,
        participants: [
          {
            type: 'player',
            id: state.memberId,
            name: this.props.members[index].characterName,
          },
          ...state.enemies.map(({ id, blockIndex, copyIndex }) => ({
            type: 'enemy' as const,
            id,
            name: card.enemies[blockIndex].name,
            blockIndex,
            copyIndex,
          })),
        ],
      },
      combatTurnStarted(state)
    )
    this.props.rngState = rngState
    if (state.turn.actorId !== state.memberId) {
      this.finishCombatTurn(state, index, player, cards)
    } else {
      this.settleCombat(index, state, player, cards)
    }
  }

  private rollEscape(
    player: TPlayerState,
    escape: { automatic: boolean; threshold: number },
    rng: SeededRng
  ) {
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
    return { naturalRoll, total, succeeded }
  }

  private escapeOption(
    player: TPlayerState,
    baseThreshold: number,
    noEscape: boolean
  ) {
    const automatic = player.automaticEventEscape === true
    const vigorCost = automatic
      ? 0
      : Math.max(
          1,
          Math.floor((player.peak * this.props.config.escapeVigorPercent) / 100)
        )
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
      }, baseThreshold)
    const unavailableReason =
      noEscape || (!automatic && player.peak === 0)
        ? ('escapeForbidden' as const)
        : player.vigor < vigorCost
          ? ('notEnoughVigor' as const)
          : null
    return { automatic, vigorCost, threshold, unavailableReason }
  }

  private eventEscape(encounter: TEventEncounter, player: TPlayerState) {
    const escape = this.escapeOption(
      player,
      encounter.card?.escapeThreshold ?? 10,
      encounter.card?.noEscape ?? false
    )
    return {
      ...escape,
      unavailableReason: encounter.payments.length
        ? ('eventPaymentStarted' as const)
        : escape.unavailableReason,
    }
  }

  private combatEscape(state: TCombatState, player: TPlayerState) {
    return this.escapeOption(
      player,
      state.card.escapeThreshold ?? this.config.combatEscapeThreshold,
      state.card.noEscape
    )
  }

  private resolveCombatEscape(
    state: TCombatState,
    index: number,
    player: TPlayerState,
    cards: ReadonlyMap<string, TCard>
  ) {
    if (combatIsTerminal(state, player.health)) {
      this.settleCombat(index, state, player, cards)
      return
    }
    const escape = this.combatEscape(state, player)
    if (escape.unavailableReason) {
      this.settleCombat(index, state, player, cards)
      return
    }
    const rng = SeededRng.fromState(this.rngState)
    const receipt = this.rollEscape(player, escape, rng)
    this.updates.push({
      type: 'combatEscapeAttempted',
      combatId: state.id,
      actorId: state.memberId,
      threshold: escape.threshold,
      vigorSpent: escape.vigorCost,
      ...receipt,
    })
    this.props.rngState = rng.state()
    const paid = { ...player, vigor: player.vigor - escape.vigorCost }
    if (receipt.succeeded)
      this.settleCombat(index, state, paid, cards, { escaped: true })
    else
      this.finishCombatTurn(state, index, paid, cards, undefined, false, true)
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
    const resolved = this.resolveOutcomeSteps(
      player,
      outcome?.steps ?? [],
      encounter.outcome ?? { nextStep: 0, nextCopy: 0 },
      encounter.zoneType,
      card.id,
      encounter.id,
      resolution === 'success' ? 'success' : 'setback',
      { type: 'randomEvent', encounterId: encounter.id },
      cards,
      ids
    )
    player = resolved.player
    if (resolved.cursor && resolution !== 'escaped') {
      this.props.eventEncounter = {
        ...encounter,
        payments,
        phase: resolution,
        outcome: { ...resolved.cursor, startingPeak, cause, escape },
      }
      this.replaceActor(index, player)
      return
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
    this.discardEventCard(encounter.zoneType, card.id)
    this.props.eventEncounter = null
    this.replaceActor(index, next)
  }

  private discardEventCard(zoneType: TEventDeck['zoneType'], cardId: string) {
    const deck = this.eventDecks.find((entry) => entry.zoneType === zoneType)
    if (deck)
      this.updateEventDeck({ ...deck, discard: [...deck.discard, cardId] })
  }

  private resolveOutcomeSteps(
    player: TPlayerState,
    steps: readonly TRandomEventOutcomeStep[],
    cursor: OutcomeCursor,
    zoneType: TEventDeck['zoneType'],
    cardId: string,
    outcomeId: string,
    phase: 'success' | 'setback',
    source: TPendingReward['source'],
    cards: ReadonlyMap<string, TCard>,
    ids?: IdGenerator
  ): { player: TPlayerState; cursor?: OutcomeCursor } {
    const firstStep = cursor.nextStep
    for (let nextStep = firstStep; nextStep < steps.length; nextStep++) {
      const step = steps[nextStep]
      if (step.type === 'effect') {
        player = this.applyEventOutcomeEffect(
          player,
          step.effect,
          cardId,
          nextStep,
          outcomeId,
          phase,
          ids,
          source.type === 'combatEvent'
        )
        continue
      }
      const count =
        step.type === 'searchReward'
          ? 1
          : step.type === 'drawRewards'
            ? step.count
            : step.copies
      const firstCopy = nextStep === firstStep ? (cursor.nextCopy ?? 0) : 0
      for (let copy = firstCopy; copy < count; copy++) {
        let reward: { cardId: string; origin: TRewardOrigin } | null
        switch (step.type) {
          case 'drawRewards': {
            const drawn = this.drawReward(zoneType)
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
            const found = this.searchReward(zoneType, step.cardId)
            player = {
              ...player,
              lastRewardSearch: {
                encounterId: outcomeId,
                cardId: step.cardId,
                found,
              },
            }
            reward = found
              ? {
                  cardId: step.cardId,
                  origin: {
                    type: 'rewardDeck',
                    zoneType: zoneType,
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
        return { player, cursor: { nextStep, nextCopy: copy + 1 } }
      }
    }
    return { player }
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
    } else if (source.type === 'combatEvent') {
      this.finishCombatOutcome(index, player, cards, ids)
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
    ids: IdGenerator | undefined,
    inCombatOutcome: boolean
  ): TPlayerState {
    const activations = effect.activation
      .filter(isExecutableActivation)
      .filter(({ kind }) => !inCombatOutcome || kind !== 'heal')
    if (activations.length === 0 && inCombatOutcome) return player
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
      ...this.eventDecks.flatMap(({ cards, discard }) => [
        ...cards,
        ...discard,
      ]),
      ...this.pendingRewards.map(({ cardId }) => cardId),
      ...this.props.config.reserveDeck.flatMap((entry) =>
        entry.type === 'card' ? [entry.cardId] : []
      ),
    ])
    const combatCard = this.combatOutcomeCard
    if (combatCard) {
      cardIds.add(combatCard.id)
      for (const step of [
        ...(combatCard.goodOutcome.steps ?? []),
        ...(combatCard.badOutcome.steps ?? []),
      ]) {
        if (step.type === 'grantReward' || step.type === 'searchReward')
          cardIds.add(step.cardId)
      }
    }
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
    if (
      this.props.combat ||
      this.props.pendingTriggeredEffects?.continuation?.type === 'combatEntry'
    )
      return left('combatInProgress')
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

  get canResumeLegacyKnockout(): boolean {
    const member = this.props.members[this.actorIndex()]
    const result = this.props.lastCombatResult
    return (
      member.player.down === true &&
      member.player.health === 0 &&
      result?.playerDown === true &&
      result.memberId === member.id.toString() &&
      !this.props.combat &&
      !this.props.combatOutcome &&
      !this.eventEncounter &&
      !this.triggeredEffectChoice &&
      !this.pendingRewards.length
    )
  }

  resumeLegacyKnockout(
    at: Date,
    cards: ReadonlyMap<string, TCard>,
    ids: IdGenerator
  ): boolean {
    if (!this.canResumeLegacyKnockout) return false
    this.respawn(
      this.actorIndex(),
      at,
      cards,
      this.props.lastCombatResult!.combatId,
      ids
    )
    return true
  }

  completeKnockout(ids?: IdGenerator, rewardCombatId?: string): void {
    if (
      this.props.combat ||
      this.triggeredEffectChoice ||
      this.pendingRewards.length
    )
      return

    const index = this.actorIndex()
    let player = this.props.members[index].player
    if (player.health !== 0) return
    const encounter = this.eventEncounter
    if (encounter?.phase === 'encounter' && encounter.card) {
      this.finishEvent(
        index,
        encounter,
        encounter.card,
        { ...player, down: true },
        'gaveUp',
        null,
        encounter.payments,
        ids,
        this.eventCatalog
      )
      if (this.pendingRewards.length) return
      player = this.props.members[index].player
    } else if (encounter?.phase === 'anticipation') {
      this.props.eventEncounter = null
    }

    const ended = this.updates.find((update) => update.type === 'combatEnded')
    this.respawn(
      index,
      this.savedAt,
      this.eventCatalog,
      rewardCombatId ?? ended?.combatId ?? null,
      ids
    )
  }

  private respawn(
    index: number,
    at: Date,
    cards: ReadonlyMap<string, TCard>,
    combatId: string | null,
    ids?: IdGenerator
  ): void {
    let player = this.props.members[index].player
    const config = this.config
    const solo = this.turnOrder.length === 1
    const roundAtKnockout = this.turn.round
    const equipped = EQUIPMENT_SLOTS.flatMap((slot) => {
      const id = player.equipment[slot]
      const card = id ? cards.get(id) : undefined
      return card?.type === 'equipment' ? [card] : []
    })
    const inactiveSources = new Set(
      equipped
        .filter(
          (card) =>
            !equipmentWorks(card, player.peak) ||
            player.brokenEquipment?.includes(card.slot)
        )
        .map(({ id }) => id)
    )
    const protectsPeak = (effect: {
      activation: readonly { kind: string }[]
    }) => effect.activation.some(({ kind }) => kind === 'keepPeakOnKnockout')
    const peakProtected =
      player.statuses.some(
        (status) =>
          !inactiveSources.has(status.sourceCardId) && protectsPeak(status)
      ) ||
      equipped.some(
        (card) =>
          !inactiveSources.has(card.id) &&
          card.effects.some(
            (effect) =>
              effect.trigger === null &&
              effect.cost.length === 0 &&
              effect.duration.kind === 'whileSourceActive' &&
              protectsPeak(effect)
          )
      )
    this.props.members[index] = this.updateStatuses(
      this.props.members[index],
      (status) => (status.duration.kind === 'untilKnockout' ? null : status),
      at
    )
    player = this.props.members[index].player

    const peakLoss =
      peakProtected || player.peak === 0 || config.knockoutPeakLossPercent === 0
        ? 0
        : Math.max(
            1,
            Math.floor((player.peak * config.knockoutPeakLossPercent) / 100)
          )
    const peak = Math.max(0, player.peak - peakLoss)
    const maxHealth = maxHealthOf({ ...player, peak })
    const vigor = Math.min(
      player.vigor,
      Math.floor((peak * config.knockoutVigorCapPercent) / 100)
    )
    const health = Math.max(
      1,
      Math.floor((maxHealth * config.knockoutHealthPercent) / 100)
    )
    const purseGoldLost = solo
      ? Math.floor((player.gold * config.soloKnockoutGoldLossPercent) / 100)
      : 0
    const respawnZoneId = player.respawnZoneId
    this.replaceActor(index, {
      ...player,
      down: false,
      skipNextTurn: !solo,
      zoneId: respawnZoneId,
      peak,
      vigor,
      health,
      gold: player.gold - purseGoldLost,
    })
    this.advancePlayableTurn(at)
    if (solo)
      for (let round = 0; round < config.soloKnockoutWaitRounds; round++)
        this.advancePlayableTurn(at)
    const member = this.props.members[index]
    this.replaceActor(index, {
      ...member.player,
      lastKnockout: {
        id:
          ids?.next().toValue() ??
          `${member.id.toString()}-knockout-${roundAtKnockout}`,
        combatId,
        respawnZoneId,
        healthRestored: health,
        peakLost: player.peak - peak,
        vigorLost: player.vigor - vigor,
        purseGoldLost,
        roundAtKnockout,
        roundAfterRespawn: this.turn.round,
      },
    })
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

    this.advancePlayableTurn(at)
    return right(undefined)
  }

  private advancePlayableTurn(at: Date): void {
    let skipped = this.advanceTurn(at)
    while (skipped) skipped = this.advanceTurn(at)
  }

  private advanceTurn(at: Date): boolean {
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
    const skip = this.turnOrder.length > 1 && nextPlayer.skipNextTurn === true
    if (nextPlayer.abilityUsage) {
      this.replaceActor(nextIndex, {
        ...nextPlayer,
        abilityUsage: Object.fromEntries(
          Object.entries(nextPlayer.abilityUsage)
            .filter(([, value]) => value.cooldown > 1)
            .map(([key, value]) => [
              key,
              { uses: 0, cooldown: value.cooldown - 1 },
            ])
        ),
      })
    }
    const debt = nextPlayer.nextTurnActionPointDebt ?? 0
    if (debt > 0 || skip)
      this.replaceActor(nextIndex, {
        ...this.props.members[nextIndex].player,
        nextTurnActionPointDebt: 0,
        ...(skip && { skipNextTurn: false }),
      })

    this.props.turn = {
      round,
      memberId,
      actionPoints: skip
        ? 0
        : Math.max(0, this.props.config.actionPointsPerTurn - debt),
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
    return skip
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

  saveRespawnPoint(
    zone: TZoneCard | null,
    at: Date
  ): Either<
    | 'sessionNotActive'
    | 'combatInProgress'
    | 'choicePending'
    | 'playerDown'
    | 'noActionPoints'
    | 'zoneActionUnavailable',
    void
  > {
    if (this.status === 'idle') return left('sessionNotActive')
    if (this.props.combat) return left('combatInProgress')
    if (this.triggeredEffectChoice || this.props.pendingReward || this.eventEncounter)
      return left('choicePending')
    const index = this.actorIndex()
    const player = this.props.members[index].player
    if (player.down) return left('playerDown')
    if (this.turn.actionPoints < 1) return left('noActionPoints')
    if (zone?.zoneType !== 'urban' || zone.id !== player.zoneId)
      return left('zoneActionUnavailable')

    this.spendActionPoint()
    this.replaceActor(index, { ...player, respawnZoneId: player.zoneId })
    this.props.savedAt = at
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
    operation: Exclude<TPrepareOperation, { operation: 'useAbility' }>,
    catalog: { cards: readonly TCard[] },
    at: Date,
    ids: IdGenerator
  ): Either<TPrepareRefusal, void>
  prepare(
    operation: Extract<TPrepareOperation, { operation: 'equip' | 'unequip' }>,
    catalog: { cards: readonly TCard[] },
    at: Date
  ): Either<TPrepareRefusal, void>
  prepare(
    operation: Exclude<TPrepareOperation, { operation: 'useAbility' }>,
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
        if (changed.down) {
          this.eventCatalog = new Map(
            catalog.cards.map((card) => [card.id, card])
          )
          this.completeKnockout(ids)
        }
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
