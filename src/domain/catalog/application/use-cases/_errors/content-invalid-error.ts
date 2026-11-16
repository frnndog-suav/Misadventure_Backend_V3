import { DomainError } from '@/core/error/domain-error'
import type { TContentIssue } from '@/domain/catalog/enterprise/value-objects/content'

/** CONTRATO §4 `CONTENT_INVALID`; `details.fields` = problemas (o infra põe os textos pt-BR, D-49). */
export class ContentInvalidError extends DomainError {
  readonly code = 'CONTENT_INVALID'
  readonly message = 'Conteúdo inválido.'
  override readonly details: { fields: readonly TContentIssue[] }

  constructor(fields: readonly TContentIssue[]) {
    super()
    this.details = { fields }
  }
}
