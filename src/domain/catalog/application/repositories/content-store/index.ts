import type {
  TCard,
  TClassDefinition,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TContentCollection,
  TContentStatus,
  TEditorCard,
  TEditorClass,
} from '@/domain/catalog/enterprise/value-objects/content'

/**
 * Leitura e gravação do conteúdo com `status` (D-46). Sem ordem garantida.
 * A porta `CardCatalog` é a visão só das publicadas (REQ-41) do mesmo conteúdo;
 * por isso as leituras com `status` têm nomes próprios (`listEditorCards`,
 * `findEditorCard`, `listEditorClasses`, `findEditorClass`).
 */
export abstract class ContentStore {
  abstract listCollections(): Promise<TContentCollection[]>
  abstract findCollection(id: string): Promise<TContentCollection | null>
  abstract listEditorCards(collectionId: string): Promise<TEditorCard[]>
  abstract findEditorCard(id: string): Promise<TEditorCard | null>
  /** As classes de **todas** as coleções (o `playerClass` é único no conteúdo todo). */
  abstract listEditorClasses(): Promise<TEditorClass[]>
  abstract findEditorClass(playerClass: string): Promise<TEditorClass | null>

  abstract createCollection(collection: TContentCollection): Promise<void>
  abstract updateCollection(collection: TContentCollection): Promise<void>
  /** Apaga a coleção, todas as suas cartas e as suas classes. */
  abstract deleteCollection(id: string): Promise<void>
  /** Grava a carta; `replacedId` é o id antigo quando um rascunho é renomeado. */
  abstract saveCard(
    card: TCard,
    status: TContentStatus,
    replacedId?: string
  ): Promise<void>
  abstract deleteCard(id: string): Promise<void>
  /** Grava a classe; `replacedPlayerClass` é o `playerClass` antigo quando um rascunho é renomeado. */
  abstract saveClass(
    definition: TClassDefinition,
    status: TContentStatus,
    replacedPlayerClass?: string
  ): Promise<void>
  abstract deleteClass(playerClass: string): Promise<void>
  /** Cria a coleção ou, com `replace`, troca a existente inteira (cartas e classes). */
  abstract importCollection(
    file: {
      collection: TContentCollection
      cards: readonly TEditorCard[]
      classes: readonly TEditorClass[]
    },
    replace: boolean
  ): Promise<void>
}
