import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TCard,
  TClassDefinition,
  TCollection,
} from '@/domain/catalog/enterprise/value-objects/card'

export class InMemoryCardCatalog implements CardCatalog {
  public collections: TCollection[] = []
  public cards: TCard[] = []
  public classes: TClassDefinition[] = []

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

  async listClasses(): Promise<TClassDefinition[]> {
    return [...this.classes]
  }

  async findClass(playerClass: string): Promise<TClassDefinition | null> {
    return (
      this.classes.find((entry) => entry.playerClass === playerClass) ?? null
    )
  }
}
