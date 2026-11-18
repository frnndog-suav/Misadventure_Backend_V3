import type {
  Party,
  TPartyStatus,
} from '@/domain/campaign/enterprise/entities/party'
import type {
  PartyMember,
  TPartyMemberKind,
} from '@/domain/campaign/enterprise/entities/party-member'
import { availableActions } from '@/domain/campaign/enterprise/available-actions'
import { connectedZones } from '@/domain/campaign/enterprise/connected-zones'
import { effectiveModifiers } from '@/domain/campaign/enterprise/effective-modifiers'
import { scavengeTargets } from '@/domain/campaign/enterprise/scavenge'
import type { TPartyActionType } from '@/domain/campaign/enterprise/party-action'
import type { TDirection } from '@/domain/campaign/enterprise/map-assembly'
import type { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TCard,
  TEquipmentCard,
  TEquipmentSlot,
  TModifier,
  TPlayerClass,
} from '@/domain/catalog/enterprise/value-objects/card'

/** Cartas do catálogo que o presenter precisa (D-80 b), por id. */
export type TPartyCards = ReadonlyMap<string, TCard>

/** CONTRATO FEAT-09, tipo `CardCopies`. */
export interface TCardCopiesHttp {
  cardId: string
  copies: number
}

/** CONTRATO FEAT-06/FEAT-09, tipo `PlayerState`. A ordem do deck não trafega (D-42). */
export interface TPlayerStateHttp {
  playerClasses: { playerClass: TPlayerClass; deckLockMet: boolean }[]
  gold: number
  baseHealth: number
  maxHealth: number
  health: number
  peak: number
  vigor: number
  modifiers: Record<TModifier, number>
  hand: string[]
  attributeDeckCount: number
  attributeDiscardPileCount: number
  zoneId: string
  respawnZoneId: string
  moveTargets: string[]
  /** FEAT-08 (REQ-58, D-65). */
  availableActions: TPartyActionType[]
  /** FEAT-09 (REQ-62, D-69). */
  build: TCardCopiesHttp[]
  buildSize: number
  tcgFolder: TCardCopiesHttp[]
  tcgFolderCapacity: number
  /** FEAT-10 (REQ-70, REQ-71). */
  inventory: { cardId: string; quantity: number }[]
  inventoryCapacity: number
  equipment: Record<TEquipmentSlot, string | null>
  purseCapacity: number
  effectiveModifiers: Record<TModifier, number>
  /** FEAT-32 (REQ-83, REQ-90, REQ-96). */
  vault: {
    slots: { cardId: string; quantity: number }[]
    decks: TCardCopiesHttp[][]
    gold: number
  }
  vaultCapacity: number
  vaultDeckSlots: number
  vaultGoldCapacity: number
  scavengeTargets: string[]
  lastScavenge: { cardId: string; found: boolean } | null
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
  createdAt: string
  savedAt: string
}

function playerToHTTP(
  party: Party,
  member: PartyMember,
  cards: TPartyCards
): TPlayerStateHttp {
  const player = member.player
  const { map } = party.dimension
  const equipmentCards = Object.values(player.equipment)
    .map((cardId) => (cardId === null ? undefined : cards.get(cardId)))
    .filter((card): card is TEquipmentCard => card?.type === 'equipment')
  const equipmentCardIds = new Set(
    player.inventory
      .map(({ cardId }) => cardId)
      .filter((cardId) => cards.get(cardId)?.type === 'equipment')
  )
  // Zona e Carta de Dimensão lidas no catálogo (D-81, D-92, D-93).
  const zoneCard = cards.get(player.zoneId)
  const zone = zoneCard?.type === 'zone' ? zoneCard : null
  const dimensionCard = cards.get(party.dimension.dimensionCardId)
  const dimension = dimensionCard?.type === 'dimension' ? dimensionCard : null
  const targets = scavengeTargets({
    player,
    zone,
    dimension,
    cards: [...cards.values()],
  })
  return {
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
    hand: [...player.hand],
    attributeDeckCount: player.deck.length,
    attributeDiscardPileCount: player.discard.length,
    zoneId: player.zoneId,
    respawnZoneId: player.respawnZoneId,
    moveTargets: connectedZones(map, player.zoneId),
    availableActions: availableActions(
      party,
      member.id,
      equipmentCardIds,
      zone?.zoneActions ?? [],
      targets
    ),
    build: copiesToHTTP(player.build),
    buildSize: player.build.reduce((sum, { copies }) => sum + copies, 0),
    tcgFolder: copiesToHTTP(player.tcgFolder),
    tcgFolderCapacity: party.config.tcgFolderCapacity,
    inventory: player.inventory.map(({ cardId, quantity }) => ({
      cardId,
      quantity,
    })),
    inventoryCapacity: party.config.inventoryCapacity,
    equipment: { ...player.equipment },
    purseCapacity: party.config.purseCapacity,
    effectiveModifiers: effectiveModifiers({
      modifiers: player.modifiers,
      peak: player.peak,
      equipment: equipmentCards,
    }),
    vault: {
      slots: player.vault.slots.map(({ cardId, quantity }) => ({
        cardId,
        quantity,
      })),
      decks: player.vault.decks.map(copiesToHTTP),
      gold: player.vault.gold,
    },
    vaultCapacity: party.config.vaultCapacity,
    vaultDeckSlots: party.config.vaultDeckSlots,
    vaultGoldCapacity: party.config.vaultGoldCapacity,
    scavengeTargets: targets,
    lastScavenge:
      player.lastScavenge === null
        ? null
        : {
            cardId: player.lastScavenge.cardId,
            found: player.lastScavenge.found,
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
  for (const { player } of party.members) {
    for (const { cardId } of player.inventory) cardIds.add(cardId)
    for (const cardId of Object.values(player.equipment)) {
      if (cardId !== null) cardIds.add(cardId)
    }
    cardIds.add(player.zoneId)
  }
  const cards = new Map<string, TCard>()
  const dimension = await catalog.findCard(party.dimension.dimensionCardId)
  if (dimension) {
    cards.set(dimension.id, dimension)
    if (dimension.type === 'dimension') {
      for (const deck of dimension.rewardDecks) {
        for (const { cardId } of deck.cards) cardIds.add(cardId)
      }
    }
  }
  for (const cardId of cardIds) {
    const card = await catalog.findCard(cardId)
    if (card) cards.set(cardId, card)
  }
  return cards
}

export class PartyPresenter {
  static toHTTP(party: Party, cards: TPartyCards): TPartyHttp {
    const { dimensionCardId, startingCityZoneId, map } = party.dimension
    return {
      id: party.id.toString(),
      name: party.name,
      status: party.status,
      members: party.members.map((member) => ({
        id: member.id.toString(),
        characterName: member.characterName,
        kind: member.kind,
        isHost: party.isHost(member),
        player: playerToHTTP(party, member, cards),
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
      createdAt: party.createdAt.toISOString(),
      savedAt: party.savedAt.toISOString(),
    }
  }
}
