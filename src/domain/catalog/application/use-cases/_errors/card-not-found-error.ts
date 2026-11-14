import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `CARD_NOT_FOUND`. */
export class CardNotFoundError extends DomainError {
  readonly code = 'CARD_NOT_FOUND'
  readonly message = 'Carta não encontrada.'
}
