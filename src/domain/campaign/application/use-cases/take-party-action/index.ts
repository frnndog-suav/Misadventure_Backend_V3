import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import type { IdGenerator } from '@/core/ports/id-generator'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { marketCandidatesOf } from '@/domain/campaign/enterprise/markets'
import { findMarketBoosters } from '@/domain/campaign/application/market-catalog'
import {
  parsePartyAction,
  type TPrepareOperation,
  type TVaultOperation,
} from '@/domain/campaign/enterprise/party-action'
import { rewardSpaces } from '@/domain/campaign/enterprise/rewards'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TAttributeCard,
  TCard,
  TClassDefinition,
  TDimensionCard,
  TZoneAction,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'

import { ActionInvalidError } from '../_errors/action-invalid-error'
import { ActionNotAllowedError } from '../_errors/action-not-allowed-error'
import { DimensionInvalidError } from '../_errors/dimension-invalid-error'
import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { PartySessionNotActiveError } from '../_errors/party-session-not-active-error'
import { findDimensionSuccessor } from '../find-dimension-successor'

export interface TTakePartyActionUseCaseRequest {
  partyId: string
  /** Corpo do POST, ainda não validado (D-62). */
  body: unknown
}

export type TTakePartyActionUseCaseResponse = Either<
  | PartyNotFoundError
  | ActionInvalidError
  | PartySessionNotActiveError
  | ActionNotAllowedError
  | DimensionInvalidError,
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
    private readonly cardCatalog: CardCatalog,
    private readonly ids?: IdGenerator,
    private readonly eventActionsEnabled = true,
    private readonly combatEnabled = true
  ) {}

  execute({
    partyId,
    body,
  }: TTakePartyActionUseCaseRequest): Promise<TTakePartyActionUseCaseResponse> {
    return this.partiesRepository.withLockedParty(partyId, (party, save) =>
      this.takeAction(party, body, save)
    )
  }

  private async takeAction(
    party: Party | null,
    body: unknown,
    save: (party: Party) => Promise<void>
  ): Promise<TTakePartyActionUseCaseResponse> {
    if (!party) {
      return left(new PartyNotFoundError())
    }

    // A porta é ligada no Nest com o save v7, quando os status podem ser persistidos.
    const parsed = parsePartyAction(
      body,
      this.ids !== undefined,
      this.eventActionsEnabled,
      this.combatEnabled
    )
    if (parsed.isLeft()) {
      return left(new ActionInvalidError(parsed.value))
    }

    const action = parsed.value
    if (party.status !== 'inSession')
      return left(new PartySessionNotActiveError())
    await this.provideMarketCandidates(party)
    const blocked =
      action.type === 'saveRespawnPoint' ? null : party.eventActionBlock(action)
    if (typeof blocked === 'string')
      return left(new ActionNotAllowedError(blocked))
    party.clearCombatUpdates()
    const turnBeforeAction = party.turn
    switch (action.type) {
      case 'takeQuest':
      case 'continueQuest':
      case 'finishQuest':
      case 'abandonQuest':
      case 'takeTrialQuest':
      case 'trainWithMentor': {
        if (!this.ids)
          return left(
            new ActionInvalidError([{ field: 'type', reason: 'unknownAction' }])
          )
        const player = party.members.find(({ id }) =>
          party.turn.memberId.equals(id)
        )!.player
        const questCardId =
          action.type === 'takeQuest'
            ? action.questCardId
            : 'questId' in action
              ? player.openZoneQuests?.find(
                  ({ questId }) => questId === action.questId
                )?.questCardId
              : undefined
        const quest = questCardId
          ? await this.cardCatalog.findCard(questCardId)
          : null
        const { cards, dimension } = await this.findEventCatalog(
          party,
          false,
          quest
        )
        const result = party.takeZoneQuestAction(
          action,
          cards,
          this.clock.now(),
          this.ids,
          dimension,
          this.combatEnabled,
          await this.cardCatalog.listClasses()
        )
        if (result.isLeft())
          return left(new ActionNotAllowedError(result.value))
        party.completeKnockout(this.ids)
        break
      }
      case 'resolveTriggeredEffect': {
        const { cards } = await this.findEventCatalog(party)
        const result = party.resolveTriggeredEffect(
          action,
          cards,
          this.clock.now()
        )
        if (result.isLeft())
          return left(new ActionNotAllowedError(result.value))
        party.completeKnockout(this.ids)
        break
      }
      case 'escapeCombat':
      case 'combatAttack':
      case 'useAbility':
      case 'activateCombatEffect':
      case 'endCombatTurn': {
        const { cards } = await this.findEventCatalog(party)
        const result = party.takeCombatAction(action, cards, this.clock.now())
        if (result.isLeft())
          return left(new ActionNotAllowedError(result.value))
        party.completeKnockout(this.ids)
        break
      }
      case 'resolveReward': {
        const pending = party.pendingRewards.find(
          ({ id }) => id === action.rewardId
        )
        if (!pending) return left(new ActionNotAllowedError('staleReward'))
        // REQ-159: `space` fora dos espaços do destino → 400 `unknownOption`.
        if (action.choice === 'keep') {
          const spaces = rewardSpaces(pending.destination)
          const invalid = action.discard.findIndex(
            ({ space }) => space !== undefined && !spaces.includes(space)
          )
          if (invalid >= 0)
            return left(
              new ActionInvalidError([
                { field: `discard.${invalid}.space`, reason: 'unknownOption' },
              ])
            )
        }
        const { cards } = await this.findEventCatalog(party)
        const result = party.resolveReward(
          action,
          cards,
          this.clock.now(),
          this.ids
        )
        if (result.isLeft())
          return left(new ActionNotAllowedError(result.value))
        party.completeKnockout(
          this.ids,
          pending.source.type === 'combatEvent'
            ? pending.source.combatId
            : undefined
        )
        break
      }
      case 'startEvent':
      case 'revealEvent':
      case 'payEventRequirement':
      case 'resolveEvent':
      case 'giveUpEvent':
      case 'escapeEvent': {
        const { zone, dimension, cards } = await this.findEventCatalog(
          party,
          action.type === 'revealEvent' && this.combatEnabled
        )
        const result = party.takeEventAction(
          action,
          zone,
          dimension,
          cards,
          this.clock.now(),
          this.ids,
          this.combatEnabled
        )
        if (result.isLeft()) {
          const refusal = result.value
          return left(
            typeof refusal === 'string'
              ? new ActionNotAllowedError(refusal)
              : new ActionNotAllowedError(
                  refusal.reason,
                  undefined,
                  undefined,
                  refusal.checks
                )
          )
        }
        party.completeKnockout(this.ids)
        break
      }
      case 'move': {
        const moved = party.move(
          action.zoneId,
          this.clock.now(),
          action.viaZoneId
        )
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
            case 'viaZoneNotInMap':
              return left(
                new ActionInvalidError([
                  { field: 'viaZoneId', reason: 'zoneNotInMap' },
                ])
              )
            case 'noActionPoints':
              return left(new ActionNotAllowedError('noActionPoints'))
            case 'noMount':
              return left(new ActionNotAllowedError('noMount'))
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
      case 'prepare': {
        if (action.operation === 'useAbility') {
          const { zone, dimension, cards } = await this.findEventCatalog(party)
          const result = party.useAdventureAbility(
            action,
            zone,
            dimension,
            cards,
            this.clock.now()
          )
          if (result.isLeft())
            return left(
              result.value === 'sessionNotActive'
                ? new PartySessionNotActiveError()
                : new ActionNotAllowedError(result.value)
            )
          party.completeKnockout(this.ids)
          break
        }
        const catalog = {
          cards:
            action.operation === 'activate' && party.eventEncounter
              ? [...(await this.findEventCatalog(party)).cards.values()]
              : await this.findPrepareCatalog(party, action),
        }
        const at = this.clock.now()
        let prepared: ReturnType<Party['prepare']>
        if (action.operation === 'activate') {
          if (!this.ids) {
            return left(
              new ActionInvalidError([
                { field: 'operation', reason: 'unknownOperation' },
              ])
            )
          }
          prepared = party.prepare(action, catalog, at, this.ids)
        } else if (action.operation === 'openBooster') {
          prepared = party.prepare(action, catalog, at, this.ids)
        } else {
          prepared = party.prepare(action, catalog, at)
        }
        if (prepared.isLeft()) {
          const refusal = prepared.value
          if (typeof refusal === 'object') {
            return left(
              new ActionNotAllowedError(refusal.reason, refusal.cardId)
            )
          }
          switch (refusal) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            default: {
              const _exhaustive: never = refusal
              return _exhaustive
            }
          }
        }
        break
      }
      case 'useVault': {
        const used = party.useVault(
          action.operations,
          await this.findVaultCatalog(party, action.operations),
          this.clock.now()
        )
        if (used.isLeft()) {
          const refusal = used.value
          if (typeof refusal === 'object') {
            return left(
              new ActionNotAllowedError(
                refusal.reason,
                refusal.cardId,
                refusal.operationIndex
              )
            )
          }
          switch (refusal) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            case 'noActionPoints':
            case 'zoneActionUnavailable':
              return left(new ActionNotAllowedError(refusal))
            default: {
              const _exhaustive: never = refusal
              return _exhaustive
            }
          }
        }
        break
      }
      case 'visitMarket': {
        const visited = party.visitMarket(
          action.operations,
          await this.findMarketCatalog(party),
          this.clock.now()
        )
        if (visited.isLeft()) {
          const refusal = visited.value
          if (typeof refusal === 'object') {
            return left(
              new ActionNotAllowedError(
                refusal.reason,
                refusal.cardId,
                refusal.operationIndex
              )
            )
          }
          switch (refusal) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            case 'noActionPoints':
            case 'zoneActionUnavailable':
              return left(new ActionNotAllowedError(refusal))
            default: {
              const _exhaustive: never = refusal
              return _exhaustive
            }
          }
        }
        break
      }
      case 'visitBlacksmith': {
        const visited = party.visitBlacksmith(
          action.operations,
          await this.findBlacksmithCatalog(party),
          this.clock.now()
        )
        if (visited.isLeft()) {
          const refusal = visited.value
          if (typeof refusal === 'object') {
            return left(
              new ActionNotAllowedError(
                refusal.reason,
                refusal.cardId,
                refusal.operationIndex
              )
            )
          }
          switch (refusal) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            case 'noActionPoints':
            case 'zoneActionUnavailable':
              return left(new ActionNotAllowedError(refusal))
            default: {
              const _exhaustive: never = refusal
              return _exhaustive
            }
          }
        }
        break
      }
      case 'artificerWorkshop': {
        const { cards } = await this.findBlacksmithCatalog(party)
        const worked = party.artificerWorkshop(
          action.operations,
          { cards },
          this.clock.now()
        )
        if (worked.isLeft()) {
          const refusal = worked.value
          if (typeof refusal === 'object') {
            return left(
              new ActionNotAllowedError(
                refusal.reason,
                refusal.cardId,
                refusal.operationIndex
              )
            )
          }
          switch (refusal) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            case 'noActionPoints':
            case 'artificerInactive':
              return left(new ActionNotAllowedError(refusal))
            default: {
              const _exhaustive: never = refusal
              return _exhaustive
            }
          }
        }
        break
      }
      case 'scavenge': {
        const scavenged = party.scavenge(
          action.cardId,
          await this.findScavengeCatalog(party),
          this.clock.now(),
          this.ids,
          this.eventActionsEnabled
        )
        if (scavenged.isLeft()) {
          const refusal = scavenged.value
          switch (refusal) {
            case 'sessionNotActive':
              return left(new PartySessionNotActiveError())
            case 'noActionPoints':
            case 'zoneActionUnavailable':
            case 'notScavengeable':
            case 'inventoryFull':
              return left(new ActionNotAllowedError(refusal))
            default: {
              const _exhaustive: never = refusal
              return _exhaustive
            }
          }
        }
        break
      }
      case 'saveRespawnPoint': {
        const actor = party.members.find(({ id }) =>
          id.equals(party.turn.memberId)
        )
        const zone = actor
          ? await this.cardCatalog.findCard(actor.player.zoneId)
          : null
        const result = party.saveRespawnPoint(
          zone?.type === 'zone' ? zone : null,
          this.clock.now()
        )
        if (result.isLeft())
          return left(
            result.value === 'sessionNotActive'
              ? new PartySessionNotActiveError()
              : new ActionNotAllowedError(result.value)
          )
        break
      }
      case 'completeDimension': {
        if (!this.ids)
          return left(
            new ActionInvalidError([{ field: 'type', reason: 'unknownAction' }])
          )
        const { zone, dimension, cards } = await this.findEventCatalog(party)
        const completed = party.completeDimension(
          zone,
          dimension,
          cards,
          this.clock.now(),
          this.ids
        )
        if (completed.isLeft())
          return left(new ActionNotAllowedError(completed.value))
        party.completeKnockout(this.ids)
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

    const bossVictory = party.combatUpdates.find(
      (update) =>
        update.type === 'combatEnded' &&
        update.result.finalBoss &&
        update.result.resolution === 'victory'
    )
    if (action.type === 'completeDimension' || bossVictory) {
      const { dimension, cards } = await this.findEventCatalog(party)
      if (
        dimension?.completion &&
        (bossVictory || !dimension.completion.finalBoss)
      ) {
        const result = party.applyDimensionCompletion(
          dimension,
          cards,
          await findDimensionSuccessor(this.cardCatalog, dimension),
          this.clock.now(),
          this.ids,
          bossVictory?.type === 'combatEnded'
            ? bossVictory.result.peakDelta
            : null,
          turnBeforeAction
        )
        if (result.isLeft()) {
          const { dimensionCardId, problems } = result.value
          return left(new DimensionInvalidError(dimensionCardId, problems))
        }
      }
    }
    await save(party)

    return right({ party })
  }

  /** REQ-139: o fim da rodada pode precisar de um novo pool; o agregado recebe as elegíveis da coleção vigente (D-116, D-125). */
  private async provideMarketCandidates(party: Party): Promise<void> {
    if (!party.hasSinglesMarkets) return
    const dimension = await this.cardCatalog.findCard(
      party.dimension.dimensionCardId
    )
    if (dimension?.type !== 'dimension') return
    party.provideMarketCandidates(
      marketCandidatesOf(
        await this.cardCatalog.listCards(dimension.collectionId)
      )
    )
  }

  private async findEventCatalog(
    party: Party,
    revealingCombat = false,
    quest: TCard | null = null
  ) {
    const player = party.members.find(({ id }) =>
      id.equals(party.turn.memberId)
    )?.player
    const [foundZone, foundDimension] = await Promise.all([
      player ? this.cardCatalog.findCard(player.zoneId) : null,
      this.cardCatalog.findCard(party.dimension.dimensionCardId),
    ])
    const zone = foundZone?.type === 'zone' ? foundZone : null
    const dimension =
      foundDimension?.type === 'dimension' ? foundDimension : null
    const zoneType =
      party.eventEncounter?.zoneType ??
      party.combatOutcomeZone ??
      party.questRewardDelivery?.zoneType ??
      zone?.zoneType
    const deck = dimension?.eventDecks?.find(
      (entry) => entry.zoneType === zoneType
    )
    const savedDeck = party.eventDecks.find(
      (entry) => entry.zoneType === zoneType
    )
    const reservedCardId = party.questAttempt?.reservedCardId
    const questStage =
      quest?.type === 'zoneQuest'
        ? quest.stages[
            player?.openZoneQuests?.find(
              ({ questCardId }) => questCardId === quest.id
            )?.stageIndex ?? 0
          ]
        : undefined
    const ids = new Set([
      ...(dimension?.completion?.grandPrize.cards.map(({ cardId }) => cardId) ??
        []),
      ...(player?.openZoneQuests?.map(({ questCardId }) => questCardId) ?? []),
      ...(reservedCardId ? [reservedCardId] : []),
      ...(questStage?.type === 'randomEvent' ? [questStage.eventCardId] : []),
      ...(deck?.cards.map(({ cardId }) => cardId) ?? []),
      ...(savedDeck?.cards ?? []),
      ...(savedDeck?.discard ?? []),
      ...(party.rewardDecks.find((entry) => entry.zoneType === zoneType)
        ?.cards ?? []),
      ...party.config.reserveDeck.flatMap((entry) =>
        entry.type === 'card' ? [entry.cardId] : []
      ),
      ...party.pendingRewards.map(({ cardId }) => cardId),
      ...(party.boosterQueue?.remaining ?? []),
      ...(
        party.questRewardDelivery?.steps ??
        (quest?.type === 'zoneQuest' ? quest.rewards : [])
      ).flatMap((step) =>
        step.type === 'grantReward' || step.type === 'searchReward'
          ? [step.cardId]
          : []
      ),
      ...[
        party.eventEncounter?.card?.goodOutcome,
        party.eventEncounter?.card?.badOutcome,
        party.combatOutcomeCard?.goodOutcome,
        party.combatOutcomeCard?.badOutcome,
        questStage?.type === 'combatEvent'
          ? questStage.combat.goodOutcome
          : undefined,
        questStage?.type === 'combatEvent'
          ? questStage.combat.badOutcome
          : undefined,
      ].flatMap(
        (outcome) =>
          outcome?.steps?.flatMap((step) =>
            step.type === 'grantReward' || step.type === 'searchReward'
              ? [step.cardId]
              : []
          ) ?? []
      ),
      ...(player?.hand ?? []),
      ...(player?.deck ?? []),
      ...(player?.discard ?? []),
      ...(player?.inventory.map(({ cardId }) => cardId) ?? []),
      ...Object.values(player?.equipment ?? {}).filter(
        (id): id is string => id !== null
      ),
      // A montaria em uso vale como equipamento em uso (REQ-157).
      ...(player?.mount ? [player.mount.cardId] : []),
      ...(party.eventEncounter?.payments.flatMap(
        (receipt) => receipt.handCards?.map(({ cardId }) => cardId) ?? []
      ) ?? []),
    ])
    const cards = new Map<string, TCard>()
    for (const card of await Promise.all(
      [...ids].map((id) => this.cardCatalog.findCard(id))
    )) {
      if (card) cards.set(card.id, card)
    }
    if (revealingCombat) {
      const grants = new Set<string>()
      for (const card of cards.values()) {
        if (card.type !== 'combatEvent') continue
        for (const step of [
          ...(card.goodOutcome.steps ?? []),
          ...(card.badOutcome.steps ?? []),
        ]) {
          if (
            (step.type === 'grantReward' || step.type === 'searchReward') &&
            !ids.has(step.cardId)
          )
            grants.add(step.cardId)
        }
      }
      for (const card of await Promise.all(
        [...grants].map((id) => this.cardCatalog.findCard(id))
      )) {
        if (card) cards.set(card.id, card)
      }
    }
    if (zone) cards.set(zone.id, zone)
    if (dimension) cards.set(dimension.id, dimension)
    if (quest) cards.set(quest.id, quest)
    return { zone, dimension, cards }
  }

  /**
   * O que o Preparar precisa do catálogo (D-79): a carta a equipar e os
   * equipamentos em uso pelo membro da vez. A que o catálogo não tem fica de
   * fora (o agregado a trata como não equipamento).
   */
  private async findPrepareCatalog(
    party: Party,
    operation: Exclude<TPrepareOperation, { operation: 'useAbility' }>
  ): Promise<TCard[]> {
    const actor = party.members.find((member) =>
      member.id.equals(party.turn.memberId)
    )
    const cardIds = new Set(
      Object.values(actor?.player.equipment ?? {}).filter(
        (cardId): cardId is string => cardId !== null
      )
    )
    if (operation.operation !== 'unequip') cardIds.add(operation.cardId)
    if (actor && operation.operation === 'activate') {
      actor.player.inventory.forEach(({ cardId }) => cardIds.add(cardId))
      actor.player.hand.forEach((cardId) => cardIds.add(cardId))
    }
    const cards: TCard[] = []
    for (const cardId of cardIds) {
      const card = await this.cardCatalog.findCard(cardId)
      if (card) cards.push(card)
    }
    if (operation.operation === 'openBooster') {
      await this.addBoosterCollections(cards)
    }
    return cards
  }

  /**
   * REQ-144: o sorteio do booster usa as cartas publicadas da coleção dele; o
   * catálogo do agregado recebe essas cartas junto do booster.
   */
  private async addBoosterCollections(
    cards: TCard[],
    boosters: readonly TCard[] = cards
  ): Promise<void> {
    const collectionIds = new Set(
      boosters.flatMap((card) =>
        card.type === 'item' &&
        card.itemCategory === 'booster' &&
        card.boosterCollectionId !== null
          ? [card.boosterCollectionId]
          : []
      )
    )
    const known = new Set(cards.map(({ id }) => id))
    for (const collectionId of collectionIds) {
      for (const card of await this.cardCatalog.listCards(collectionId)) {
        if (known.has(card.id)) continue
        known.add(card.id)
        cards.push(card)
      }
    }
  }

  /**
   * O que o Vasculhar precisa do catálogo (REQ-90, D-87): a zona atual do
   * membro da vez, a Carta de Dimensão do grupo, as cartas do inventário e as
   * citadas pela entrada de `rewardDecks` do tipo da zona. O que o catálogo
   * não tem fica `null` ou de fora (sem alvos).
   */
  private async findScavengeCatalog(party: Party): Promise<{
    zone: TZoneCard | null
    dimension: TDimensionCard | null
    cards: TCard[]
  }> {
    const actor = party.members.find((member) =>
      member.id.equals(party.turn.memberId)
    )
    const found = actor
      ? await this.cardCatalog.findCard(actor.player.zoneId)
      : null
    const zone = found?.type === 'zone' ? found : null
    const foundDimension = await this.cardCatalog.findCard(
      party.dimension.dimensionCardId
    )
    const dimension =
      foundDimension?.type === 'dimension' ? foundDimension : null

    const cardIds = new Set(
      (actor?.player.inventory ?? []).map(({ cardId }) => cardId)
    )
    const entry = dimension?.rewardDecks.find(
      (deck) => deck.zoneType === zone?.zoneType
    )
    entry?.cards.forEach(({ cardId }) => cardIds.add(cardId))
    const cards: TCard[] = []
    for (const cardId of cardIds) {
      const card = await this.cardCatalog.findCard(cardId)
      if (card) cards.push(card)
    }
    return { zone, dimension, cards }
  }

  /**
   * O que o Ir ao Mercado precisa do catálogo (REQ-140): a zona atual, a
   * coleção vigente inteira (a vitrine pode repor com qualquer elegível, ou
   * sortear novo pool), o estoque da zona (de qualquer coleção, D-124),
   * os boosters da coleção vigente e as cartas do inventário e da pasta.
   */
  private async findMarketCatalog(party: Party): Promise<{
    zone: TZoneCard | null
    cards: TCard[]
    collectionId: string | null
  }> {
    const player = party.members.find(({ id }) =>
      id.equals(party.turn.memberId)
    )?.player
    const [zone, dimension] = await Promise.all([
      player ? this.cardCatalog.findCard(player.zoneId) : null,
      this.cardCatalog.findCard(party.dimension.dimensionCardId),
    ])
    const collectionId =
      dimension?.type === 'dimension' ? dimension.collectionId : null
    const cards = new Map<string, TCard>()
    if (collectionId !== null) {
      for (const card of await this.cardCatalog.listCards(collectionId))
        cards.set(card.id, card)
      for (const card of await findMarketBoosters(
        this.cardCatalog,
        collectionId
      ))
        cards.set(card.id, card)
    }
    const cardIds = [
      ...(zone?.type === 'zone' ? (zone.market?.stock ?? []) : []),
      ...(zone?.type === 'zone' ? (zone.market?.mounts ?? []) : []),
      ...(player?.mount ? [player.mount.cardId] : []),
      ...(player?.inventory ?? []).map(({ cardId }) => cardId),
      ...(player?.tcgFolder ?? []).map(({ cardId }) => cardId),
    ]
    for (const cardId of cardIds) {
      if (cards.has(cardId)) continue
      const card = await this.cardCatalog.findCard(cardId)
      if (card) cards.set(cardId, card)
    }
    return {
      zone: zone?.type === 'zone' ? zone : null,
      cards: [...cards.values()],
      collectionId,
    }
  }

  /**
   * O que o Ir ao Ferreiro precisa do catálogo (REQ-149): a carta da zona atual
   * do membro da vez, o equipamento em uso, o inventário e os equipamentos que
   * as receitas do inventário criam.
   */
  private async findBlacksmithCatalog(
    party: Party
  ): Promise<{ zone: TZoneCard | null; cards: TCard[] }> {
    const player = party.members.find(({ id }) =>
      id.equals(party.turn.memberId)
    )?.player
    if (!player) return { zone: null, cards: [] }
    const zone = await this.cardCatalog.findCard(player.zoneId)
    const cards = new Map<string, TCard>()
    const load = async (cardId: string) => {
      if (cards.has(cardId)) return
      const card = await this.cardCatalog.findCard(cardId)
      if (card) cards.set(cardId, card)
    }
    for (const cardId of Object.values(player.equipment))
      if (cardId !== null) await load(cardId)
    for (const { cardId } of player.inventory) await load(cardId)
    for (const card of [...cards.values()])
      if (card.type === 'item' && card.recipe)
        await load(card.recipe.equipmentId)
    return {
      zone: zone?.type === 'zone' ? zone : null,
      cards: [...cards.values()],
    }
  }

  /**
   * O que o Usar cofre precisa do catálogo (D-82): as ações da zona atual do
   * membro da vez, as cartas que as operações, a build, a pasta e o cofre
   * citam, e as classes do jogador. O que o catálogo não tem fica de fora (o
   * agregado trata a carta como inexistente e a classe como sem trava).
   */
  private async findVaultCatalog(
    party: Party,
    operations: readonly TVaultOperation[]
  ): Promise<{
    cards: TCard[]
    classes: TClassDefinition[]
    zoneActions: TZoneAction[]
  }> {
    const actor = party.members.find((member) =>
      member.id.equals(party.turn.memberId)
    )
    const player = actor?.player
    const zone = player ? await this.cardCatalog.findCard(player.zoneId) : null

    const cardIds = new Set<string>()
    for (const operation of operations) {
      switch (operation.operation) {
        case 'store':
        case 'take':
        case 'discard':
        case 'openBooster':
          cardIds.add(operation.cardId)
          break
        case 'saveDeck':
          operation.cards.forEach(({ cardId }) => cardIds.add(cardId))
          break
        case 'editBuild':
          operation.build.forEach(({ cardId }) => cardIds.add(cardId))
          break
        case 'storeGold':
        case 'takeGold':
        case 'unpackDeck':
        case 'swapBuild':
          break
        default: {
          const _exhaustive: never = operation
          return _exhaustive
        }
      }
    }
    for (const { cardId } of [
      ...(player?.build ?? []),
      ...(player?.tcgFolder ?? []),
      ...(player?.vault.slots ?? []),
      ...(player?.vault.decks.flat() ?? []),
    ]) {
      cardIds.add(cardId)
    }
    const cards: TCard[] = []
    for (const cardId of cardIds) {
      const card = await this.cardCatalog.findCard(cardId)
      if (card) cards.push(card)
    }
    const opened = new Set(
      operations.flatMap((operation) =>
        operation.operation === 'openBooster' ? [operation.cardId] : []
      )
    )
    await this.addBoosterCollections(
      cards,
      cards.filter(({ id }) => opened.has(id))
    )
    const classes: TClassDefinition[] = []
    for (const { playerClass } of player?.playerClasses ?? []) {
      const definition = await this.cardCatalog.findClass(playerClass)
      if (definition) classes.push(definition)
    }
    return {
      cards,
      classes,
      zoneActions: zone?.type === 'zone' ? [...zone.zoneActions] : [],
    }
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
