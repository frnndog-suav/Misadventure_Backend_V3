import type {
  TEditorCollection,
  TEditorCollectionSummary,
} from '@/domain/catalog/enterprise/editor-collection'
import type {
  TCardType,
  TRarity,
} from '@/domain/catalog/enterprise/value-objects/card'

/** CONTRATO FEAT-31, tipo `EditorCollectionSummary`. */
export interface TEditorCollectionSummaryHttp {
  id: string
  name: string
  description: string
  publishedCount: number
  draftCount: number
}

/** CONTRATO FEAT-31, tipo `EditorCollection`. */
export interface TEditorCollectionHttp extends TEditorCollectionSummaryHttp {
  cardCounts: Record<TCardType, number>
  rarityCounts: Record<TRarity, number>
  tags: string[]
}

export class EditorCollectionPresenter {
  static toSummaryHTTP(
    summary: TEditorCollectionSummary
  ): TEditorCollectionSummaryHttp {
    return {
      id: summary.id,
      name: summary.name,
      description: summary.description,
      publishedCount: summary.publishedCount,
      draftCount: summary.draftCount,
    }
  }

  static toHTTP(collection: TEditorCollection): TEditorCollectionHttp {
    return {
      ...EditorCollectionPresenter.toSummaryHTTP(collection),
      cardCounts: { ...collection.cardCounts },
      rarityCounts: { ...collection.rarityCounts },
      tags: [...collection.tags],
    }
  }
}
