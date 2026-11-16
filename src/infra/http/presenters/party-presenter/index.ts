import type {
  Party,
  TPartyStatus,
} from '@/domain/campaign/enterprise/entities/party'
import type { TPartyMemberKind } from '@/domain/campaign/enterprise/entities/party-member'

/** CONTRATO FEAT-05, tipo `PartyMember`. */
export interface TPartyMemberHttp {
  id: string
  characterName: string
  kind: TPartyMemberKind
  isHost: boolean
}

/** CONTRATO FEAT-05, tipo `Party`. */
export interface TPartyHttp {
  id: string
  name: string
  status: TPartyStatus
  members: TPartyMemberHttp[]
  createdAt: string
  savedAt: string
}

export class PartyPresenter {
  static toHTTP(party: Party): TPartyHttp {
    return {
      id: party.id.toString(),
      name: party.name,
      status: party.status,
      members: party.members.map((member) => ({
        id: member.id.toString(),
        characterName: member.characterName,
        kind: member.kind,
        isHost: party.isHost(member),
      })),
      createdAt: party.createdAt.toISOString(),
      savedAt: party.savedAt.toISOString(),
    }
  }
}
