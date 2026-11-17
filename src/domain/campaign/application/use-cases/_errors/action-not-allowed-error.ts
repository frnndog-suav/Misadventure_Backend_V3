import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `ACTION_NOT_ALLOWED`; `details` = `ActionNotAllowedDetails` (FEAT-08+ acrescentam motivos). */
export type TActionNotAllowedReason = 'notConnected'

export class ActionNotAllowedError extends DomainError {
  readonly code = 'ACTION_NOT_ALLOWED'
  readonly message = 'Esta ação não é permitida agora.'
  override readonly details: { reason: TActionNotAllowedReason }

  constructor(reason: TActionNotAllowedReason) {
    super()
    this.details = { reason }
  }
}
