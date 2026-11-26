import { DomainError } from '@/core/error/domain-error'

export class PartyFrozenError extends DomainError {
  readonly code = 'PARTY_FROZEN'
  readonly message =
    'Este save está congelado até o lançamento da próxima dimensão.'
}
