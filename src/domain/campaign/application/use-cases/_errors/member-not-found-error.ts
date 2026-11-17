import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `MEMBER_NOT_FOUND` (FEAT-10). */
export class MemberNotFoundError extends DomainError {
  readonly code = 'MEMBER_NOT_FOUND'
  readonly message = 'Membro não encontrado neste grupo.'
}
