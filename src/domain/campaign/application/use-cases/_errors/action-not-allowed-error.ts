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
  | 'zoneActionUnavailable'
  | 'notInTcgFolder'
  | 'notStorable'
  | 'notInVault'
  | 'vaultFull'
  | 'notEnoughGold'
  | 'vaultGoldFull'
  | 'notEnoughVaultGold'
  | 'purseFull'
  | 'notAttribute'
  | 'deckSlotsFull'
  | 'deckNotFound'
  | 'notScavengeable'
  | 'equipmentNotInUse'
  | 'effectNotFound'
  | 'notActivatable'
  | 'notActivatableYet'
  | 'notEnoughVigor'
  | 'notEnoughLife'
  | 'notEnoughPeak'
  | 'paymentInvalid'
  | 'minimumNotMet'

export class ActionNotAllowedError extends DomainError {
  readonly code = 'ACTION_NOT_ALLOWED'
  readonly message = 'Esta ação não é permitida agora.'
  override readonly details: {
    reason: TActionNotAllowedReason
    cardId?: string
    operationIndex?: number
  }

  /**
   * `cardId` só em `notOwned` e `copyLimitExceeded` (CONTRATO FEAT-09);
   * `operationIndex` só no `useVault` (CONTRATO FEAT-32).
   */
  constructor(
    reason: TActionNotAllowedReason,
    cardId?: string,
    operationIndex?: number
  ) {
    super()
    this.details = {
      reason,
      ...(cardId === undefined ? {} : { cardId }),
      ...(operationIndex === undefined ? {} : { operationIndex }),
    }
  }
}
