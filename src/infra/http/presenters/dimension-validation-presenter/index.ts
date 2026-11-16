/** CONTRATO FEAT-31, tipo `DimensionValidation` (textos já em pt-BR, D-54 b). */
export interface TDimensionValidationHttp {
  valid: boolean
  problems: string[]
}

export class DimensionValidationPresenter {
  static toHTTP(validation: {
    valid: boolean
    problems: readonly string[]
  }): TDimensionValidationHttp {
    return { valid: validation.valid, problems: [...validation.problems] }
  }
}
