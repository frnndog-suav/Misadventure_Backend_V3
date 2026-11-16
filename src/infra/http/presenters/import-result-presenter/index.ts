/** CONTRATO FEAT-31, tipo `ImportResult`. */
export interface TImportResultHttp {
  collectionId: string
  cardCount: number
  classCount: number
}

export class ImportResultPresenter {
  static toHTTP(result: TImportResultHttp): TImportResultHttp {
    return {
      collectionId: result.collectionId,
      cardCount: result.cardCount,
      classCount: result.classCount,
    }
  }
}
