import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `PARTY_SESSION_NOT_ACTIVE`. */
export class PartySessionNotActiveError extends DomainError {
  readonly code = 'PARTY_SESSION_NOT_ACTIVE'
  readonly message = 'Não há sessão em andamento neste grupo.'
}
