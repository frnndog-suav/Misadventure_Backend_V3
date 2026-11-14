import { DomainError } from '@/core/error/domain-error'
import type { TGameConfigIssue } from '@/domain/lab/enterprise/value-objects/game-config'

/** CONTRATO §4 `LAB_CONFIG_INVALID`; `details` = `LabConfigInvalidDetails`. */
export class LabConfigInvalidError extends DomainError {
  readonly code = 'LAB_CONFIG_INVALID'
  readonly message = 'Configuração do laboratório inválida.'
  override readonly details: { fields: TGameConfigIssue[] }

  constructor(fields: TGameConfigIssue[]) {
    super()
    this.details = { fields }
  }
}
