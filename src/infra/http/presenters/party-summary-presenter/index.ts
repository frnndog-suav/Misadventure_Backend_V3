import type {
  Party,
  TPartyStatus,
} from '@/domain/campaign/enterprise/entities/party'

/** CONTRATO FEAT-05, tipo `PartySummary`. */
export interface TPartySummaryHttp {
  id: string
  name: string
  status: TPartyStatus
  characterNames: string[]
  createdAt: string
  savedAt: string
}

export class PartySummaryPresenter {
  static toHTTP(party: Party): TPartySummaryHttp {
    return {
      id: party.id.toString(),
      name: party.name,
      status: party.status,
      characterNames: party.members.map((member) => member.characterName),
      createdAt: party.createdAt.toISOString(),
      savedAt: party.savedAt.toISOString(),
    }
  }
}
