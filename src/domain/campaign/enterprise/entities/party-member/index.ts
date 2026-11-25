import { Entity } from '@/core/entities/entity'
import type { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
  EQUIPMENT_SLOTS,
  type TEquipmentSlot,
  type TModifier,
  type TPlayerClass,
  type TStarterDeckEntry,
} from '@/domain/catalog/enterprise/value-objects/card'

import type { TBlacksmithVisitResult } from '../../blacksmith'
import type { TBoosterOpeningResult } from '../../booster'
import type { TWornStates } from '../../equipment-state'
import type { TInventorySlot } from '../../inventory'
import type { TMarketVisitResult } from '../../market-trade'
import type { TExpansions } from '../../markets'
import type { TMountState } from '../../mount'
import type { TPlayerStatus } from '../../player-status'
import type { TEventResult, THandCopy } from '../../random-event'
import type { TVault } from '../../vault'
import type {
  TGrantedSpecialization,
  TOpenGenericQuest,
  TOpenZoneQuest,
} from '../../zone-quests'

/** Na FEAT-20 entra o ajudante de IA. */
export type TPartyMemberKind = 'human'

export type TKnockoutResult = Readonly<{
  id: string
  combatId: string | null
  respawnZoneId: string
  healthRestored: number
  peakLost: number
  vigorLost: number
  purseGoldLost: number
  roundAtKnockout: number
  roundAfterRespawn: number
}>

/** Estado do jogador na partida (D-42). `maxHealth` é derivado (README 7.4). */
export type TPlayerState = Readonly<{
  openZoneQuests?: readonly TOpenZoneQuest[]
  /** Provação e mentor abertas (README 8.3 e 8.4; REQ-133). */
  openGenericQuests?: readonly TOpenGenericQuest[]
  /** Ids das missões abertas na ordem de aceitação entre os tipos. */
  questOrder?: readonly string[]
  /** Especializações concedidas, na ordem de concessão (REQ-133). */
  specializations?: readonly TGrantedSpecialization[]
  completedZoneQuests?: readonly {
    dimensionCardId: string
    questCardId: string
  }[]
  /** Na ordem em que foram obtidas (README 8.2). */
  playerClasses: readonly Readonly<{
    playerClass: TPlayerClass
    deckLockMet: boolean
  }>[]
  /** Cartas de atributo e cópias, em ordem de `cardId` (README 4.4; REQ-62). */
  build: readonly TStarterDeckEntry[]
  /** Pasta de TCG (README 6.3; D-69): só atributo, em ordem de `cardId`; começa vazia. */
  tcgFolder: readonly TStarterDeckEntry[]
  /** Inventário (README 6.2; REQ-70, D-75): slots na ordem de chegada. */
  inventory: readonly TInventorySlot[]
  /** Equipamento em uso por categoria (README 5.1; REQ-70). */
  equipment: Readonly<Record<TEquipmentSlot, string | null>>
  /** Montaria (README 26; REQ-157): `null`/ausente = sem montaria. */
  mount?: TMountState | null
  /** Cofre (README 6.4; REQ-83, D-83): começa vazio. */
  vault: TVault
  /** Expansões compradas no mercado (REQ-143; D-120); ausente = tudo 0. */
  expansions?: TExpansions
  /** Resultado do último Ir ao Mercado aceito (REQ-140); ausente/`null` até o primeiro. */
  lastMarketVisit?: TMarketVisitResult | null
  /** Resultado do último Ir ao Ferreiro aceito (REQ-149); ausente/`null` até o primeiro. */
  lastBlacksmithVisit?: TBlacksmithVisitResult | null
  /** Resultado do último `openBooster` aceito (REQ-144); ausente/`null` até o primeiro. */
  lastBoosterOpening?: TBoosterOpeningResult | null
  /** Resultado do último Vasculhar aceito (REQ-96); `null` até o primeiro. */
  lastScavenge: Readonly<{
    cardId: string
    found: boolean
    delivery?: 'inventory' | 'mountInventory' | 'pending' | 'left' | 'none'
  }> | null
  lastRewardSearch?: import('../../rewards').TRewardSearch | null
  lastRewardDelivery?: import('../../rewards').TRewardDelivery | null
  /** Efeitos ativos, na ordem em que foram aplicados (REQ-103). */
  statuses: readonly TPlayerStatus[]
  /** Ids em ordem; o topo é o índice 0. */
  deck: readonly string[]
  /** Na ordem em que foram compradas. */
  hand: readonly string[]
  handCopies?: readonly THandCopy[]
  abilityUsage?: Readonly<Record<string, { uses: number; cooldown: number }>>
  /** Equipamento em uso que está quebrado (README 5.1); o `broken` do estado da cópia (D-137). */
  brokenEquipment?: readonly TEquipmentSlot[]
  /** Refino, encantamentos e marcas do equipamento em uso, por slot (REQ-147); ausente = padrão. */
  equipmentStates?: TWornStates
  handCopySequence?: number
  nextTurnActionPointDebt?: number
  lastRandomEvent?: TEventResult | null
  down?: boolean
  lastKnockout?: TKnockoutResult | null
  skipNextTurn?: boolean
  automaticEventEscape?: boolean
  discard: readonly string[]
  gold: number
  baseHealth: number
  health: number
  peak: number
  vigor: number
  modifiers: Readonly<Record<TModifier, number>>
  zoneId: string
  respawnZoneId: string
}>

export interface TPartyMemberProps {
  characterName: string
  kind: TPartyMemberKind
  player: TPlayerState
}

/** As 8 categorias sem nada em uso (README 9.1; REQ-70). */
export function emptyEquipment(): Record<TEquipmentSlot, string | null> {
  return Object.fromEntries(
    EQUIPMENT_SLOTS.map((slot) => [slot, null])
  ) as Record<TEquipmentSlot, string | null>
}

/** ⌊baseHealth × (100 + peak) ÷ 100⌋ (README 7.4; REQ-34). */
export function maxHealthOf({
  baseHealth,
  peak,
}: Pick<TPlayerState, 'baseHealth' | 'peak'>): number {
  return Math.floor((baseHealth * (100 + peak)) / 100)
}

/** Membro do grupo (D-27). Só nasce dentro de `Party.create` (README 28.1). */
export class PartyMember extends Entity<TPartyMemberProps> {
  get characterName(): string {
    return this.props.characterName
  }

  get kind(): TPartyMemberKind {
    return this.props.kind
  }

  get player(): TPlayerState {
    return this.props.player
  }

  get maxHealth(): number {
    return maxHealthOf(this.props.player)
  }

  static create(props: TPartyMemberProps, id: UniqueEntityID): PartyMember {
    return new PartyMember(
      {
        ...props,
        player: {
          ...props.player,
          lastKnockout: props.player.lastKnockout ?? null,
          skipNextTurn: props.player.skipNextTurn ?? false,
        },
      },
      id
    )
  }
}
