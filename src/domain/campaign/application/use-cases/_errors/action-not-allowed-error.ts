import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `ACTION_NOT_ALLOWED`; `details` = `ActionNotAllowedDetails` (FEAT-09+ acrescentam motivos). */
export type TActionNotAllowedReason = 'notConnected' | 'noActionPoints'

export class ActionNotAllowedError extends DomainError {
  readonly code = 'ACTION_NOT_ALLOWED'
  readonly message = 'Esta ação não é permitida agora.'
  override readonly details: { reason: TActionNotAllowedReason }

  constructor(reason: TActionNotAllowedReason) {
    super()
    this.details = { reason }
  }
}
