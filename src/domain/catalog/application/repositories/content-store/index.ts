import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TContentCollection,
  TContentStatus,
  TEditorCard,
} from '@/domain/catalog/enterprise/value-objects/content'

/**
 * Leitura e gravação do conteúdo com `status` (D-46). Sem ordem garantida.
 * A porta `CardCatalog` é a visão só das publicadas (REQ-41) do mesmo conteúdo;
 * por isso as leituras com `status` têm nomes próprios (`listEditorCards`,
 * `findEditorCard`).
 */
export abstract class ContentStore {
  abstract listCollections(): Promise<TContentCollection[]>
  abstract findCollection(id: string): Promise<TContentCollection | null>
  abstract listEditorCards(collectionId: string): Promise<TEditorCard[]>
  abstract findEditorCard(id: string): Promise<TEditorCard | null>

  abstract createCollection(collection: TContentCollection): Promise<void>
  abstract updateCollection(collection: TContentCollection): Promise<void>
  /** Apaga a coleção e todas as suas cartas. */
  abstract deleteCollection(id: string): Promise<void>
  /** Grava a carta; `replacedId` é o id antigo quando um rascunho é renomeado. */
  abstract saveCard(
    card: TCard,
    status: TContentStatus,
    replacedId?: string
  ): Promise<void>
  abstract deleteCard(id: string): Promise<void>
  /** Cria a coleção ou, com `replace`, troca a existente inteira. */
  abstract importCollection(
    file: { collection: TContentCollection; cards: readonly TEditorCard[] },
    replace: boolean
  ): Promise<void>
}
