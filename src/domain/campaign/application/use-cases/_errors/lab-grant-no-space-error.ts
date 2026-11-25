import { DomainError } from '@/core/error/domain-error'

export type TLabGrantNoSpaceReason =
  | 'inventoryFull'
  | 'tcgFolderFull'
  /** FEAT-18: carta `mount` para quem já tem montaria (REQ-157). */
  | 'mountAlreadyOwned'

/** CONTRATO §4 `LAB_GRANT_NO_SPACE`; `details` = `LabGrantNoSpaceDetails` (FEAT-10). */
export class LabGrantNoSpaceError extends DomainError {
  readonly code = 'LAB_GRANT_NO_SPACE'
  readonly message = 'Não há espaço para essa doação.'
  override readonly details: { reason: TLabGrantNoSpaceReason }

  constructor(reason: TLabGrantNoSpaceReason) {
    super()
    this.details = { reason }
  }
}
