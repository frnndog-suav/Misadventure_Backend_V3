import type { TCollectionExport } from '@/domain/catalog/enterprise/value-objects/content'
import {
  EditorClassPresenter,
  type TEditorClassHttp,
} from '../editor-class-presenter'
import {
  EditorCardPresenter,
  type TEditorCardHttp,
} from '../editor-card-presenter'

/** CONTRATO FEAT-31, tipo `CollectionExport` (`classes` preenchido pela FEAT-06). */
export interface TCollectionExportHttp {
  formatVersion: 1
  collection: { id: string; name: string; description: string }
  cards: TEditorCardHttp[]
  classes: TEditorClassHttp[]
}

export class CollectionExportPresenter {
  static toHTTP(file: TCollectionExport): TCollectionExportHttp {
    return {
      formatVersion: file.formatVersion,
      collection: {
        id: file.collection.id,
        name: file.collection.name,
        description: file.collection.description,
      },
      cards: file.cards.map((entry) => EditorCardPresenter.toHTTP(entry)),
      classes: file.classes.map((entry) => EditorClassPresenter.toHTTP(entry)),
    }
  }
}
