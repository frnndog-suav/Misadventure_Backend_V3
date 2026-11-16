import { DomainError } from '@/core/error/domain-error'
import type { TContentIssue } from '@/domain/catalog/enterprise/value-objects/content'

/** CONTRATO §4 `CONTENT_ID_TAKEN`; `details.fields` como em `CONTENT_INVALID`. */
export class ContentIdTakenError extends DomainError {
  readonly code = 'CONTENT_ID_TAKEN'
  readonly message = 'Este identificador já está em uso.'
  override readonly details: { fields: readonly TContentIssue[] }

  constructor(fields: readonly TContentIssue[]) {
    super()
    this.details = { fields }
  }
}
