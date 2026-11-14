import type { TCollectionSummary } from '@/domain/catalog/application/use-cases/list-collections'
import type { TCardType } from '@/domain/catalog/enterprise/value-objects/card'

/** CONTRATO FEAT-04, tipo `CollectionSummary`. */
export interface TCollectionSummaryHttp {
  id: string
  name: string
  cardCounts: Record<TCardType, number>
}

export class CollectionPresenter {
  static toHTTP(summary: TCollectionSummary): TCollectionSummaryHttp {
    return {
      id: summary.id,
      name: summary.name,
      cardCounts: { ...summary.cardCounts },
    }
  }
}
