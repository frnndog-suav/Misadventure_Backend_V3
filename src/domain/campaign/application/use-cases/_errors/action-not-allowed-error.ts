import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `ACTION_NOT_ALLOWED`; `details` = `ActionNotAllowedDetails` (FEATs seguintes acrescentam motivos). */
export type TActionNotAllowedReason =
  | 'notConnected'
  | 'noActionPoints'
  | 'notOwned'
  | 'copyLimitExceeded'
  | 'buildBelowMinimum'
  | 'tcgFolderFull'
  | 'notInInventory'
  | 'notEquipment'
  | 'peakRequirementNotMet'
  | 'classRestricted'
  | 'shieldBlocked'
  | 'inventoryFull'
  | 'slotEmpty'

export class ActionNotAllowedError extends DomainError {
  readonly code = 'ACTION_NOT_ALLOWED'
  readonly message = 'Esta ação não é permitida agora.'
  override readonly details: {
    reason: TActionNotAllowedReason
    cardId?: string
  }

  /** `cardId` só em `notOwned` e `copyLimitExceeded` (CONTRATO FEAT-09). */
  constructor(reason: TActionNotAllowedReason, cardId?: string) {
    super()
    this.details = cardId === undefined ? { reason } : { reason, cardId }
  }
}
