import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `CLASS_NOT_FOUND`. */
export class ClassNotFoundError extends DomainError {
  readonly code = 'CLASS_NOT_FOUND'
  readonly message = 'Classe não encontrada.'
}
