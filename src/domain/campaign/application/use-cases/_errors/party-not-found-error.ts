import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `PARTY_NOT_FOUND`. */
export class PartyNotFoundError extends DomainError {
  readonly code = 'PARTY_NOT_FOUND'
  readonly message = 'Grupo não encontrado.'
}
