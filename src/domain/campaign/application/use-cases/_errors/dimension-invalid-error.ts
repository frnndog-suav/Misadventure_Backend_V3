import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `DIMENSION_INVALID` (D-44); `details` = `DimensionInvalidDetails`. */
export class DimensionInvalidError extends DomainError {
  readonly code = 'DIMENSION_INVALID'
  readonly message =
    'Não foi possível preparar a dimensão. Avise o designer da coleção.'
  override readonly details: {
    dimensionCardId: string | null
    problems: string[]
  }

  constructor(dimensionCardId: string | null, problems: string[]) {
    super()
    this.details = { dimensionCardId, problems }
  }
}
