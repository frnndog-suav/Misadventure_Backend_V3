import { Entity } from '@/core/entities/entity'
import type { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type {
  TModifier,
  TPlayerClass,
  TStarterDeckEntry,
} from '@/domain/catalog/enterprise/value-objects/card'

/** Na FEAT-20 entra o ajudante de IA. */
export type TPartyMemberKind = 'human'

/** Estado do jogador na partida (D-42). `maxHealth` é derivado (README 7.4). */
export type TPlayerState = Readonly<{
  /** Na ordem em que foram obtidas (README 8.2). */
  playerClasses: readonly Readonly<{
    playerClass: TPlayerClass
    deckLockMet: boolean
  }>[]
  /** Cartas de atributo e cópias (README 4.4). */
  build: readonly TStarterDeckEntry[]
  /** Ids em ordem; o topo é o índice 0. */
  deck: readonly string[]
  /** Na ordem em que foram compradas. */
  hand: readonly string[]
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
    return new PartyMember({ ...props }, id)
  }
}
