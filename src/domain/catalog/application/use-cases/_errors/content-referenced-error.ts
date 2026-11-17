import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `CONTENT_REFERENCED`: carta no deck pré-pronto de uma classe (REQ-40). */
export class ContentReferencedError extends DomainError {
  readonly code = 'CONTENT_REFERENCED'
  readonly message =
    'Esta carta está no deck pré-pronto de uma classe e não pode ser apagada nem renomeada.'
}
