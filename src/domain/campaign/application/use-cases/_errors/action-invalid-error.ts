import { DomainError } from '@/core/error/domain-error'
import type { TActionIssue } from '@/domain/campaign/enterprise/party-action'

/** CONTRATO §4 `ACTION_INVALID`; `details` = `ActionInvalidDetails`. */
export class ActionInvalidError extends DomainError {
  readonly code = 'ACTION_INVALID'
  readonly message = 'Ação inválida.'
  override readonly details: { fields: TActionIssue[] }

  constructor(fields: TActionIssue[]) {
    super()
    this.details = { fields }
  }
}
