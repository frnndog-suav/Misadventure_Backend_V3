import { Entity } from '@/core/entities/entity'
import type { UniqueEntityID } from '@/core/entities/unique-entity-id'

/** Na FEAT-20 entra o ajudante de IA. */
export type TPartyMemberKind = 'human'

export interface TPartyMemberProps {
  characterName: string
  kind: TPartyMemberKind
}

/** Membro do grupo (D-27). Só nasce dentro de `Party.create` (README 28.1). */
export class PartyMember extends Entity<TPartyMemberProps> {
  get characterName(): string {
    return this.props.characterName
  }

  get kind(): TPartyMemberKind {
    return this.props.kind
  }

  static create(props: TPartyMemberProps, id: UniqueEntityID): PartyMember {
    return new PartyMember({ ...props }, id)
  }
}
