import type {
  TCard,
  TCollection,
} from '@/domain/catalog/enterprise/value-objects/card'

/** Leitura do conteúdo publicado (Constituição 6, D-18). Sem ordem garantida. */
export abstract class CardCatalog {
  abstract listCollections(): Promise<TCollection[]>
  abstract findCollection(id: string): Promise<TCollection | null>
  abstract listCards(collectionId: string): Promise<TCard[]>
  abstract findCard(id: string): Promise<TCard | null>
}
