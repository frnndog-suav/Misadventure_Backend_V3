import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `COLLECTION_NOT_FOUND`. */
export class CollectionNotFoundError extends DomainError {
  readonly code = 'COLLECTION_NOT_FOUND'
  readonly message = 'Coleção não encontrada.'
}
