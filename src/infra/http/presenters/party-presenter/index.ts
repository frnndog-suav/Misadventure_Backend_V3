import type {
  Party,
  TPartyStatus,
} from '@/domain/campaign/enterprise/entities/party'
import type {
  PartyMember,
  TKnockoutResult,
  TPartyMemberKind,
  TPlayerState,
} from '@/domain/campaign/enterprise/entities/party-member'
import {
  handCopiesOf,
  type THandCopy,
  type TEventResult,
} from '@/domain/campaign/enterprise/random-event'
import type {
  TPendingReward,
  TRewardDelivery,
  TRewardSearch,
} from '@/domain/campaign/enterprise/rewards'
import {
  activatableEffects,
  type TActivatableEffect,
} from '@/domain/campaign/enterprise/activatable-effects'
import type {
  TMarketView,
  TMarketVisitResult,
} from '@/domain/campaign/enterprise/market-trade'
import type {
  TBlacksmithView,
  TBlacksmithVisitResult,
  TServiceEquipment,
} from '@/domain/campaign/enterprise/blacksmith'
import type { TPlayerStatus } from '@/domain/campaign/enterprise/player-status'
import { findMarketBoosters } from '@/domain/campaign/application/market-catalog'
import {
  isBooster,
  type TBoosterOpeningResult,
} from '@/domain/campaign/enterprise/booster'
import { availableActions } from '@/domain/campaign/enterprise/available-actions'
import {
  moveRoutes,
  type TMoveRoute,
} from '@/domain/campaign/enterprise/connected-zones'
import { effectiveModifiers } from '@/domain/campaign/enterprise/effective-modifiers'
import { mountCardOf } from '@/domain/campaign/enterprise/mount'
import {
  DEFAULT_EQUIPMENT_STATE,
  enchantmentActive,
  wornStateOf,
  type TAppliedEnchantment,
  type TEquipmentState,
} from '@/domain/campaign/enterprise/equipment-state'
import { scavengeTargets } from '@/domain/campaign/enterprise/scavenge'
import type { TPartyActionType } from '@/domain/campaign/enterprise/party-action'
import type { TDirection } from '@/domain/campaign/enterprise/map-assembly'
import {
  capacitiesOf,
  noExpansions,
  type TMarketExpansion,
} from '@/domain/campaign/enterprise/markets'
import { questBoard } from '@/domain/campaign/enterprise/zone-quests'
import type { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TCard,
  TClassDefinition,
  TEquipmentCard,
  TEquipmentSlot,
  TModifier,
  TPlayerClass,
} from '@/domain/catalog/enterprise/value-objects/card'
import { EQUIPMENT_SLOTS } from '@/domain/catalog/enterprise/value-objects/card'
import type { TInventorySlot } from '@/domain/campaign/enterprise/inventory'

/** Cartas do catálogo que o presenter precisa (D-80 b), por id. */
export type TPartyCards = ReadonlyMap<string, TCard>

/** CONTRATO FEAT-09, tipo `CardCopies`. */
export interface TCardCopiesHttp {
  cardId: string
  copies: number
}

/** CONTRATO FEAT-17, tipo `EquipmentState`: cada encantamento traz `active`. */
export interface TEquipmentStateHttp {
  refinement: number
  enchantments: (TAppliedEnchantment & { active: boolean })[]
  repairMarks: number
  broken: boolean
}

/** CONTRATO FEAT-17, tipo `BlacksmithView`: o estado de cada equipamento com `active`. */
export type TBlacksmithViewHttp = Omit<
  TBlacksmithView,
  'blacksmith' | 'workshop'
> & {
  blacksmith: TServiceViewHttp | null
  workshop: TServiceViewHttp | null
}
type TServiceViewHttp = {
  equipment: (Omit<TServiceEquipment, 'state'> & {
    state: TEquipmentStateHttp
  })[]
}

/** CONTRATO FEAT-10/FEAT-17, tipo `InventorySlot` (e slot do cofre). */
export interface TInventorySlotHttp {
  cardId: string
  quantity: number
  /** Só em equipamento (sempre presente ali). */
  equipmentState?: TEquipmentStateHttp
}

/** CONTRATO FEAT-06/FEAT-09, tipo `PlayerState`. A ordem do deck não trafega (D-42). */
export interface TPlayerStateHttp {
  down: boolean
  skipNextTurn: boolean
  lastKnockout: TKnockoutResult | null
  usableAbilities: ReturnType<Party['adventureAbilityOptions']>
  playerClasses: { playerClass: TPlayerClass; deckLockMet: boolean }[]
  questBoard: ReturnType<Party['questState']>['questBoard']
  openQuests: ReturnType<Party['questState']>['openQuests']
  questChoices: ReturnType<Party['questState']>['questChoices']
  specializations: {
    classId: TPlayerClass
    specializationId: string
    deckLockMet: boolean
  }[]
  gold: number
  baseHealth: number
  maxHealth: number
  health: number
  peak: number
  vigor: number
  modifiers: Record<TModifier, number>
  hand: string[]
  handCopies: readonly THandCopy[]
  nextTurnActionPointDebt: number
  lastRandomEvent: TEventResult | null
  lastRewardSearch: TRewardSearch | null
  lastRewardDelivery: TRewardDelivery | null
  attributeDeckCount: number
  attributeDiscardPileCount: number
  zoneId: string
  respawnZoneId: string
  moveTargets: string[]
  moveRoutes: TMoveRoute[]
  /** FEAT-08 (REQ-58, D-65). */
  availableActions: TPartyActionType[]
  /** FEAT-09 (REQ-62, D-69). */
  build: TCardCopiesHttp[]
  buildSize: number
  tcgFolder: TCardCopiesHttp[]
  tcgFolderCapacity: number
  /** FEAT-10 (REQ-70, REQ-71). */
  inventory: TInventorySlotHttp[]
  completionItems: TPlayerState['completionItems']
  inventoryCapacity: number
  equipment: Record<TEquipmentSlot, string | null>
  /** FEAT-17 (REQ-147): estado do equipamento em uso; `null` onde não há. */
  equipmentStates: Record<TEquipmentSlot, TEquipmentStateHttp | null>
  /** FEAT-18 (REQ-157): `null` sem montaria. */
  mount: {
    cardId: string
    inventory: TInventorySlotHttp[]
    inventoryCapacity: number
    tcgFolder: TCardCopiesHttp[]
    tcgFolderCapacity: number
  } | null
  purseCapacity: number
  effectiveModifiers: Record<TModifier, number>
  statuses: readonly TPlayerStatus[]
  activatableEffects: TActivatableEffect[]
  /** FEAT-32 (REQ-83, REQ-90, REQ-96). */
  vault: {
    slots: TInventorySlotHttp[]
    decks: TCardCopiesHttp[][]
    gold: number
  }
  vaultCapacity: number
  vaultDeckSlots: number
  vaultGoldCapacity: number
  scavengeTargets: string[]
  /** FEAT-16 (REQ-140). Só para o membro da vez numa zona com mercado. */
  market: TMarketViewHttp | null
  /** FEAT-16 (REQ-143). Contagem de cada expansão comprada; as capacidades acima já são as efetivas. */
  expansions: Record<TMarketExpansion, number>
  lastMarketVisit: TMarketVisitResult | null
  /** FEAT-17 (REQ-149). Só para o membro da vez numa zona com ferreiro. */
  blacksmith: TBlacksmithViewHttp | null
  /** FEAT-17 (REQ-149). */
  lastBlacksmithVisit: TBlacksmithVisitResult | null
  /** FEAT-16 (REQ-144). */
  lastBoosterOpening: TBoosterOpeningResult | null
  lastScavenge:
    | (NonNullable<TPlayerState['lastScavenge']> & {
        delivery: NonNullable<
          NonNullable<TPlayerState['lastScavenge']>['delivery']
        >
      })
    | null
}

const copiesToHTTP = (
  list: readonly { cardId: string; copies: number }[]
): TCardCopiesHttp[] => list.map(({ cardId, copies }) => ({ cardId, copies }))

/** CONTRATO FEAT-08, tipo `PartyTurn`. */
export interface TPartyTurnHttp {
  round: number
  memberId: string
  actionPoints: number
}

/** CONTRATO FEAT-05/FEAT-06, tipo `PartyMember`. */
export interface TPartyMemberHttp {
  id: string
  characterName: string
  kind: TPartyMemberKind
  isHost: boolean
  player: TPlayerStateHttp
}

/** CONTRATO FEAT-06, tipo `PartyDimension`. */
export interface TPartyDimensionHttp {
  dimensionCardId: string
  startingCityZoneId: string
  map: {
    zones: { zoneId: string; x: number; y: number; arrows: TDirection[] }[]
    crossings: { zoneIds: [string, string] }[]
  }
}

/** CONTRATO FEAT-05/FEAT-06, tipo `Party`. */
export interface TPartyHttp {
  id: string
  name: string
  status: TPartyStatus
  members: TPartyMemberHttp[]
  dimension: TPartyDimensionHttp
  turnOrder: string[]
  turn: TPartyTurnHttp
  randomEventEncounter: ReturnType<Party['describeRandomEvent']>
  triggeredEffectChoice: Party['triggeredEffectChoice']
  pendingRewards: readonly TPendingReward[]
  combat: Party['combat']
  lastCombatResult: Party['lastCombatResult']
  lastDimensionCompletion: Party['lastDimensionCompletion']
  createdAt: string
  savedAt: string
}

function stateToHTTP(
  card: TCard | undefined,
  state: TEquipmentState
): TEquipmentStateHttp {
  return {
    refinement: state.refinement,
    enchantments: state.enchantments.map((applied) => ({
      ...applied,
      active:
        card?.type === 'equipment' && enchantmentActive(applied, card, state),
    })),
    repairMarks: state.repairMarks,
    broken: state.broken,
  }
}

/** FEAT-17 (REQ-154): o estado das ofertas de equipamento sai como no `InventorySlot` (com `active`). */
type TMarketViewHttp = Omit<TMarketView, 'sellOffers'> & {
  sellOffers: (Omit<TMarketView['sellOffers'][number], 'equipmentState'> & {
    equipmentState?: TEquipmentStateHttp
  })[]
}

function marketToHTTP(
  view: TMarketView | null,
  cards: TPartyCards
): TMarketViewHttp | null {
  if (view === null) return null
  return {
    ...view,
    sellOffers: view.sellOffers.map(({ equipmentState, ...offer }) =>
      equipmentState === undefined
        ? offer
        : {
            ...offer,
            equipmentState: stateToHTTP(
              cards.get(offer.cardId),
              equipmentState
            ),
          }
    ),
  }
}

function blacksmithToHTTP(
  view: TBlacksmithView | null,
  cards: TPartyCards
): TBlacksmithViewHttp | null {
  if (view === null) return null
  const service = (entry: TBlacksmithView['blacksmith']) =>
    entry && {
      equipment: entry.equipment.map((item) => ({
        ...item,
        state: stateToHTTP(cards.get(item.cardId), item.state),
      })),
    }
  return {
    ...view,
    blacksmith: service(view.blacksmith),
    workshop: service(view.workshop),
  }
}

/** Equipamento sempre leva `equipmentState` (o padrão preenchido); as demais cartas, nunca. */
function slotToHTTP(
  { cardId, quantity, equipmentState }: TInventorySlot,
  cards: TPartyCards
): TInventorySlotHttp {
  const card = cards.get(cardId)
  return {
    cardId,
    quantity,
    ...(card?.type === 'equipment' && {
      equipmentState: stateToHTTP(
        card,
        equipmentState ?? DEFAULT_EQUIPMENT_STATE
      ),
    }),
  }
}

function playerToHTTP(
  party: Party,
  member: PartyMember,
  cards: TPartyCards,
  encounter: TPartyHttp['randomEventEncounter'],
  classes: readonly TClassDefinition[]
): TPlayerStateHttp {
  const player = member.player
  const expansions = player.expansions ?? noExpansions()
  const capacities = capacitiesOf(party.config, expansions)
  const { map } = party.dimension
  const equipmentCards = Object.values(player.equipment)
    .map((cardId) => (cardId === null ? undefined : cards.get(cardId)))
    .filter((card): card is TEquipmentCard => card?.type === 'equipment')
  const equipmentCardIds = new Set(
    player.inventory
      .map(({ cardId }) => cardId)
      .filter((cardId) => cards.get(cardId)?.type === 'equipment')
  )
  const boosterCardIds = new Set(
    player.inventory
      .map(({ cardId }) => cardId)
      .filter((cardId) => isBooster(cards.get(cardId)))
  )
  // Zona e Carta de Dimensão lidas no catálogo (D-81, D-92, D-93).
  const zoneCard = cards.get(player.zoneId)
  const zone = zoneCard?.type === 'zone' ? zoneCard : null
  const isHuman = member.kind === 'human'
  const routes = isHuman
    ? moveRoutes(map, player.zoneId, player.mount !== null)
    : []
  const dimensionCard = cards.get(party.dimension.dimensionCardId)
  const dimension = dimensionCard?.type === 'dimension' ? dimensionCard : null
  const catalogCards = [...cards.values()]
  const effects =
    isHuman &&
    !party.combat &&
    !player.down &&
    !party.triggeredEffectChoice &&
    party.turn.memberId.equals(member.id) &&
    party.pendingRewards.length === 0 &&
    (!encounter ||
      ((encounter.phase === 'anticipation' ||
        encounter.phase === 'encounter') &&
        encounter.payments.length === 0))
      ? activatableEffects(player, catalogCards, encounter?.phase)
      : []
  const targets = isHuman
    ? scavengeTargets({
        player,
        zone,
        dimension,
        cards: catalogCards,
      })
    : []
  const usableAbilities =
    isHuman && party.turn.memberId.equals(member.id)
      ? party.adventureAbilityOptions(cards)
      : []
  const quests = party.questState(member, cards, classes)
  return {
    down: player.down ?? false,
    skipNextTurn: player.skipNextTurn ?? false,
    lastKnockout: player.lastKnockout ?? null,
    usableAbilities,
    ...quests,
    questChoices: isHuman ? quests.questChoices : [],
    specializations: (player.specializations ?? [])
      .map(({ playerClass, specializationId, deckLockMet }) => ({
        classId: playerClass,
        specializationId,
        deckLockMet,
      }))
      .sort(
        (first, second) =>
          player.playerClasses.findIndex(
            ({ playerClass }) => playerClass === first.classId
          ) -
          player.playerClasses.findIndex(
            ({ playerClass }) => playerClass === second.classId
          )
      ),
    playerClasses: player.playerClasses.map(({ playerClass, deckLockMet }) => ({
      playerClass,
      deckLockMet,
    })),
    gold: player.gold,
    baseHealth: player.baseHealth,
    maxHealth: member.maxHealth,
    health: player.health,
    peak: player.peak,
    vigor: player.vigor,
    modifiers: { ...player.modifiers },
    hand: isHuman ? [...player.hand] : [],
    handCopies: isHuman ? handCopiesOf(player) : [],
    nextTurnActionPointDebt: player.nextTurnActionPointDebt ?? 0,
    lastRandomEvent: player.lastRandomEvent ?? null,
    lastRewardSearch: player.lastRewardSearch ?? null,
    lastRewardDelivery: rewardDeliveryToHTTP(player.lastRewardDelivery, cards),
    attributeDeckCount: player.deck.length,
    attributeDiscardPileCount: player.discard.length,
    zoneId: player.zoneId,
    respawnZoneId: player.respawnZoneId,
    moveTargets: routes.map((route) => route.zoneId),
    moveRoutes: routes,
    availableActions: isHuman
      ? availableActions(
          party,
          member.id,
          equipmentCardIds,
          zone?.zoneActions ?? [],
          targets,
          effects,
          party.canStartEvent(zone, dimension, cards),
          encounter,
          usableAbilities.length > 0,
          party.describeCombat(cards),
          zone?.zoneType === 'urban',
          quests.questChoices,
          boosterCardIds,
          party.canCompleteDimension(zone, dimension)
        )
      : [],
    build: copiesToHTTP(player.build),
    buildSize: player.build.reduce((sum, { copies }) => sum + copies, 0),
    tcgFolder: copiesToHTTP(player.tcgFolder),
    tcgFolderCapacity: capacities.tcgFolder,
    inventory: player.inventory.map((slot) => slotToHTTP(slot, cards)),
    completionItems: player.completionItems,
    statuses: player.statuses,
    activatableEffects: effects,
    inventoryCapacity: party.config.inventoryCapacity,
    equipment: { ...player.equipment },
    equipmentStates: Object.fromEntries(
      EQUIPMENT_SLOTS.map((slot) => {
        const cardId = player.equipment[slot]
        return [
          slot,
          cardId === null
            ? null
            : stateToHTTP(cards.get(cardId), wornStateOf(player, slot)),
        ]
      })
    ) as Record<TEquipmentSlot, TEquipmentStateHttp | null>,
    mount: player.mount
      ? {
          cardId: player.mount.cardId,
          inventory: player.mount.inventory.map((slot) =>
            slotToHTTP(slot, cards)
          ),
          inventoryCapacity: party.config.mountInventorySlots,
          tcgFolder: copiesToHTTP(player.mount.tcgFolder),
          tcgFolderCapacity: party.config.mountFolderCapacity,
        }
      : null,
    purseCapacity: capacities.purse,
    effectiveModifiers:
      (party.turn.memberId.equals(member.id)
        ? party.combatPlayerModifiers(cards)
        : null) ??
      effectiveModifiers({
        modifiers: player.modifiers,
        peak: player.peak,
        equipment: equipmentCards,
        equipmentStates: player.equipmentStates,
        refineBonusPercent: party.config.refineBonusPercent,
        statuses: player.statuses,
        abilityOwner: player,
        mountCard: mountCardOf(player, cards),
      }),
    vault: {
      slots: player.vault.slots.map((slot) => slotToHTTP(slot, cards)),
      decks: player.vault.decks.map(copiesToHTTP),
      gold: player.vault.gold,
    },
    vaultCapacity: capacities.vaultSlots,
    vaultDeckSlots: capacities.deckSlots,
    vaultGoldCapacity: capacities.vaultGold,
    scavengeTargets: targets,
    market: isHuman
      ? marketToHTTP(party.describeMarket(member, cards), cards)
      : null,
    expansions: { ...expansions },
    lastMarketVisit: marketVisitToHTTP(player.lastMarketVisit),
    blacksmith: isHuman
      ? blacksmithToHTTP(party.describeBlacksmith(member, cards), cards)
      : null,
    lastBlacksmithVisit: blacksmithVisitToHTTP(player.lastBlacksmithVisit),
    lastBoosterOpening: player.lastBoosterOpening ?? null,
    lastScavenge:
      player.lastScavenge === null
        ? null
        : {
            cardId: player.lastScavenge.cardId,
            found: player.lastScavenge.found,
            delivery:
              player.lastScavenge.delivery ??
              (player.lastScavenge.found ? 'inventory' : 'none'),
          },
  }
}

/**
 * Lê no catálogo as cartas do inventário e dos equipamentos em uso de todos os
 * membros (D-80 b), a zona de cada um, a Carta de Dimensão e as cartas citadas
 * no `rewardDecks` dela (FEAT-32: `useVault` e `scavengeTargets`). A que o
 * catálogo não tem fica de fora: não conta como equipamento nem soma
 * modificador; zona ou dimensão ausente = sem ações de zona e sem alvos.
 */
export async function findPartyCards(
  catalog: CardCatalog,
  party: Party
): Promise<TPartyCards> {
  const cardIds = new Set<string>()
  for (const deck of party.eventDecks) {
    for (const id of [...deck.cards, ...deck.discard]) cardIds.add(id)
  }
  for (const payment of party.eventEncounter?.payments ?? []) {
    for (const { cardId } of payment.handCards ?? []) cardIds.add(cardId)
  }
  for (const { id, player } of party.members) {
    if (party.turn.memberId.equals(id)) {
      for (const cardId of player.hand) cardIds.add(cardId)
    }
    for (const { cardId } of player.inventory) cardIds.add(cardId)
    if (player.mount) {
      // REQ-157: a carta da montaria e o inventário extra.
      cardIds.add(player.mount.cardId)
      for (const { cardId } of player.mount.inventory) cardIds.add(cardId)
    }
    for (const { cardId } of player.vault.slots) cardIds.add(cardId)
    for (const cardId of Object.values(player.equipment)) {
      if (cardId !== null) cardIds.add(cardId)
    }
    cardIds.add(player.zoneId)
    const zone = party.dimension.map.zones.find(
      ({ zoneId }) => zoneId === player.zoneId
    )
    for (const id of questBoard(zone, party.config.questBoardSize)) {
      if (id !== null) cardIds.add(id)
    }
    for (const { questCardId } of player.openZoneQuests ?? [])
      cardIds.add(questCardId)
  }
  const cards = new Map<string, TCard>()
  const dimension = await catalog.findCard(party.dimension.dimensionCardId)
  if (dimension) {
    cards.set(dimension.id, dimension)
    if (dimension.type === 'dimension') {
      for (const deck of dimension.rewardDecks) {
        for (const { cardId } of deck.cards) cardIds.add(cardId)
      }
      for (const deck of dimension.eventDecks ?? []) {
        for (const { cardId } of deck.cards) cardIds.add(cardId)
      }
    }
  }
  const actor = party.members.find(({ id }) => party.turn.memberId.equals(id))
  const actorZone = actor ? await catalog.findCard(actor.player.zoneId) : null
  if (actor && actorZone?.type === 'zone' && actorZone.market) {
    // FEAT-16 (REQ-140): estoque, vitrine, pasta e boosters da coleção vigente.
    for (const cardId of actorZone.market.stock) cardIds.add(cardId)
    // FEAT-18 (REQ-158): montarias do Estábulo.
    for (const cardId of actorZone.market.mounts) cardIds.add(cardId)
    for (const cardId of party.markets.find(
      ({ zoneId }) => zoneId === actorZone.id
    )?.showcase ?? [])
      if (cardId !== null) cardIds.add(cardId)
    for (const { cardId } of actor.player.tcgFolder) cardIds.add(cardId)
    const commercialCollectionIds =
      party.dimension.commercialCollectionIds ??
      (dimension?.type === 'dimension' ? [dimension.collectionId] : [])
    if (commercialCollectionIds.length > 0) {
      for (const booster of await findMarketBoosters(
        catalog,
        commercialCollectionIds
      ))
        cards.set(booster.id, booster)
    }
  }
  for (const cardId of cardIds) {
    const card = await catalog.findCard(cardId)
    if (card) cards.set(cardId, card)
  }
  return cards
}

export class PartyPresenter {
  static toHTTP(
    party: Party,
    cards: TPartyCards,
    classes: readonly TClassDefinition[] = []
  ): TPartyHttp {
    const { dimensionCardId, startingCityZoneId, map } = party.dimension
    const encounter = party.describeRandomEvent(cards)
    return {
      id: party.id.toString(),
      name: party.name,
      status: party.status,
      members: party.members.map((member) => ({
        id: member.id.toString(),
        characterName: member.characterName,
        kind: member.kind,
        isHost: party.isHost(member),
        player: playerToHTTP(party, member, cards, encounter, classes),
      })),
      dimension: {
        dimensionCardId,
        startingCityZoneId,
        map: {
          zones: map.zones.map(({ zoneId, x, y, arrows }) => ({
            zoneId,
            x,
            y,
            arrows: [...arrows],
          })),
          crossings: map.crossings.map(({ zoneIds: [first, second] }) => ({
            zoneIds: [first, second],
          })),
        },
      },
      turnOrder: party.turnOrder.map((id) => id.toString()),
      turn: {
        round: party.turn.round,
        memberId: party.turn.memberId.toString(),
        actionPoints: party.turn.actionPoints,
      },
      randomEventEncounter: encounter,
      triggeredEffectChoice: party.triggeredEffectChoice,
      pendingRewards: party.pendingRewards,
      combat: party.describeCombat(cards),
      lastCombatResult: party.lastCombatResult,
      lastDimensionCompletion: party.lastDimensionCompletion,
      createdAt: party.createdAt.toISOString(),
      savedAt: party.savedAt.toISOString(),
    }
  }
}

/** REQ-159 (D-152): save de antes da T-77 sem `space` → o espaço principal (`null` se não ficou). */
function rewardDeliveryToHTTP(
  delivery: TRewardDelivery | null | undefined,
  cards: TPartyCards
): TRewardDelivery | null {
  if (!delivery) return null
  if (delivery.space !== undefined) return delivery
  return {
    ...delivery,
    space:
      delivery.disposition !== 'kept'
        ? null
        : cards.get(delivery.cardId)?.type === 'attribute'
          ? 'tcgFolder'
          : 'inventory',
  }
}

/** REQ-159 (D-152): compra de save antigo sem `received` → tudo no inventário. */
function marketVisitToHTTP(
  visit: TMarketVisitResult | null | undefined
): TMarketVisitResult | null {
  if (!visit) return null
  return {
    ...visit,
    results: visit.results.map((result) => {
      switch (result.operation) {
        case 'buyStock':
          return {
            ...result,
            received: result.received ?? [
              { space: 'inventory', quantity: result.copiesReceived },
            ],
          }
        case 'buyBooster':
          return {
            ...result,
            received: result.received ?? [
              { space: 'inventory', quantity: result.quantity },
            ],
          }
        default:
          return result
      }
    }),
  }
}

/** REQ-159 (D-152): Criar de save antigo sem `destination` → inventário. */
function blacksmithVisitToHTTP(
  visit: TBlacksmithVisitResult | null | undefined
): TBlacksmithVisitResult | null {
  if (!visit) return null
  return {
    ...visit,
    results: visit.results.map((result) =>
      result.operation === 'craft'
        ? { ...result, destination: result.destination ?? 'inventory' }
        : result
    ),
  }
}
