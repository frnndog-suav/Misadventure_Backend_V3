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
import type { TPartyActionType } from '@/domain/campaign/enterprise/party-action'
import type { TDirection } from '@/domain/campaign/enterprise/map-assembly'
import type {
  TModifier,
  TPlayerClass,
} from '@/domain/catalog/enterprise/value-objects/card'

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

function playerToHTTP(party: Party, member: PartyMember): TPlayerStateHttp {
  const player = member.player
  const { map } = party.dimension
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
    // T-29: os ids de equipamento do inventário vêm do catálogo (REQ-75).
    availableActions: availableActions(party, member.id, new Set()),
    build: copiesToHTTP(player.build),
    buildSize: player.build.reduce((sum, { copies }) => sum + copies, 0),
    tcgFolder: copiesToHTTP(player.tcgFolder),
    tcgFolderCapacity: party.config.tcgFolderCapacity,
  }
}

export class PartyPresenter {
  static toHTTP(party: Party): TPartyHttp {
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
        player: playerToHTTP(party, member),
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
