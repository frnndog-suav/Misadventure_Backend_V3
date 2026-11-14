import type { DomainError } from '@/core/error/domain-error'

/**
 * Leva um `DomainError` (devolvido como valor pelo caso de uso) do controller
 * até o filtro global, que o traduz para CONTRATO §1.4 (D-14).
 */
export class DomainErrorException extends Error {
  constructor(readonly domainError: DomainError) {
    super(domainError.code)
  }
}
