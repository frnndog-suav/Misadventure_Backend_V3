import { DomainError } from '@/core/error/domain-error'
import type { TLabGrantIssue } from '@/domain/campaign/enterprise/lab-grant'

/** CONTRATO §4 `LAB_GRANT_INVALID`; `details` = `LabGrantInvalidDetails` (FEAT-10). */
export class LabGrantInvalidError extends DomainError {
  readonly code = 'LAB_GRANT_INVALID'
  readonly message = 'Doação inválida.'
  override readonly details: { fields: TLabGrantIssue[] }

  constructor(fields: TLabGrantIssue[]) {
    super()
    this.details = { fields }
  }
}
