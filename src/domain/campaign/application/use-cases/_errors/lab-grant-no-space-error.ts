import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `LAB_GRANT_NO_SPACE`; `details` = `LabGrantNoSpaceDetails` (FEAT-10). */
export class LabGrantNoSpaceError extends DomainError {
  readonly code = 'LAB_GRANT_NO_SPACE'
  readonly message = 'Não há espaço para essa doação.'
  override readonly details: { reason: 'inventoryFull' | 'tcgFolderFull' }

  constructor(reason: 'inventoryFull' | 'tcgFolderFull') {
    super()
    this.details = { reason }
  }
}
