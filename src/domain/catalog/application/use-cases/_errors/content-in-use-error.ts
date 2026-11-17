import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `CONTENT_IN_USE`: conteúdo usado por algum save (REQ-39). */
export class ContentInUseError extends DomainError {
  readonly code = 'CONTENT_IN_USE'
  readonly message =
    'Este conteúdo é usado por algum save e não pode ser apagado.'
}
