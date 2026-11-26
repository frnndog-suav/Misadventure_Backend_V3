import { DomainError } from '@/core/error/domain-error'
import type { TBlacksmithRefusalReason } from '../../../enterprise/blacksmith'
import type { TMarketRefusalReason } from '../../../enterprise/market-trade'
import type { TCombatRefusal } from '../../../enterprise/combat'
import type { TTriggeredEffectRefusal } from '../../../enterprise/entities/party'
import type {
  TEventRefusal,
  TMinimumCheck,
} from '../../../enterprise/random-event'
import type { TRewardRefusal } from '../../../enterprise/rewards'
import type { TQuestRefusal } from '../../../enterprise/zone-quests'

/** CONTRATO §4 `ACTION_NOT_ALLOWED`; `details` = `ActionNotAllowedDetails` (FEATs seguintes acrescentam motivos). */
export type TActionNotAllowedReason =
  | TCombatRefusal
  | TQuestRefusal['reason']
  | TTriggeredEffectRefusal
  | Extract<TEventRefusal, string>
  | TRewardRefusal
  | 'eventMinimumNotMet'
  | 'notConnected'
  | 'noActionPoints'
  | 'noCompletion'
  | 'notCompletionZone'
  | 'completionRequirementNotMet'
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
  | 'notBooster'
  | 'boosterEmpty'
  | TMarketRefusalReason
  | TBlacksmithRefusalReason
  | 'artificerInactive'

export class ActionNotAllowedError extends DomainError {
  readonly code = 'ACTION_NOT_ALLOWED'
  readonly message = 'Esta ação não é permitida agora.'
  override readonly details: {
    reason: TActionNotAllowedReason
    cardId?: string
    operationIndex?: number
    checks?: TMinimumCheck[]
    questId?: string
    questCardId?: string
    classId?: string
    specializationId?: string
  }

  /**
   * `cardId` só em `notOwned` e `copyLimitExceeded` (CONTRATO FEAT-09);
   * `operationIndex` só no `useVault`, no `visitMarket`, no `visitBlacksmith` e no `artificerWorkshop` (CONTRATO FEAT-32, FEAT-16 e FEAT-17).
   */
  constructor(
    reason: TActionNotAllowedReason | TQuestRefusal,
    cardId?: string,
    operationIndex?: number,
    checks?: TMinimumCheck[]
  ) {
    super()
    this.details =
      typeof reason === 'object'
        ? reason
        : {
            reason,
            ...(cardId === undefined ? {} : { cardId }),
            ...(operationIndex === undefined ? {} : { operationIndex }),
            ...(checks === undefined ? {} : { checks }),
          }
  }
}
