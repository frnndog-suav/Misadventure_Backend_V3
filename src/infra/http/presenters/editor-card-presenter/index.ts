import type {
  TContentStatus,
  TEditorCard,
  TEditorCardSummary,
} from '@/domain/catalog/enterprise/value-objects/content'
import type { TCardType } from '@/domain/catalog/enterprise/value-objects/card'
import { CardPresenter, type TCardHttp } from '../card-presenter'

/** CONTRATO FEAT-31, tipo `EditorCard`. */
export interface TEditorCardHttp {
  status: TContentStatus
  card: TCardHttp
}

/** CONTRATO FEAT-31, tipo `EditorCardSummary`. */
export interface TEditorCardSummaryHttp {
  id: string
  type: TCardType
  name: string
  status: TContentStatus
}

export class EditorCardPresenter {
  static toHTTP(editorCard: TEditorCard): TEditorCardHttp {
    return {
      status: editorCard.status,
      card: CardPresenter.toHTTP(editorCard.card),
    }
  }

  static toSummaryHTTP(summary: TEditorCardSummary): TEditorCardSummaryHttp {
    return {
      id: summary.id,
      type: summary.type,
      name: summary.name,
      status: summary.status,
    }
  }
}
