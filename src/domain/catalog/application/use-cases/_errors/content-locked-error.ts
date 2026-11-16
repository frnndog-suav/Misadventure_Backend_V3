import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `CONTENT_LOCKED`. */
export class ContentLockedError extends DomainError {
  readonly code = 'CONTENT_LOCKED'
  readonly message = 'O identificador de uma carta publicada não pode mudar.'
}
