import { DomainError } from '@/core/error/domain-error'

export class ActionAdvancePendingError extends DomainError {
  readonly code = 'ACTION_ADVANCE_PENDING'
  readonly message = 'Outra ação aguarda a conclusão da vez dos ajudantes.'
}

export class ActionIdempotencyConflictError extends DomainError {
  readonly code = 'ACTION_IDEMPOTENCY_CONFLICT'
  readonly message = 'Esta chave de ação já foi usada com outro corpo.'
}
