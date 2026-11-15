import { DomainError } from '@/core/error/domain-error'
import type { TPartyIssue } from '@/domain/campaign/enterprise/entities/party'

/** CONTRATO §4 `PARTY_INVALID`; `details` = `PartyInvalidDetails`. */
export class PartyInvalidError extends DomainError {
  readonly code = 'PARTY_INVALID'
  readonly message = 'Dados do grupo inválidos.'
  override readonly details: { fields: TPartyIssue[] }

  constructor(fields: TPartyIssue[]) {
    super()
    this.details = { fields }
  }
}
