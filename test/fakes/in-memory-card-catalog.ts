import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TCard,
  TCollection,
} from '@/domain/catalog/enterprise/value-objects/card'

export class InMemoryCardCatalog implements CardCatalog {
  public collections: TCollection[] = []
  public cards: TCard[] = []

  async listCollections(): Promise<TCollection[]> {
    return [...this.collections]
  }

  async findCollection(id: string): Promise<TCollection | null> {
    return this.collections.find((collection) => collection.id === id) ?? null
  }

  async listCards(collectionId: string): Promise<TCard[]> {
    return this.cards.filter((card) => card.collectionId === collectionId)
  }

  async findCard(id: string): Promise<TCard | null> {
    return this.cards.find((card) => card.id === id) ?? null
  }
}
