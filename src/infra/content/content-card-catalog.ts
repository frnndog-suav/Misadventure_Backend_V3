import type { TCatalogContent } from '@/domain/catalog/enterprise/catalog-integrity'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TCard,
  TCollection,
} from '@/domain/catalog/enterprise/value-objects/card'

/** Catálogo carregado uma vez no boot; nada lê disco depois (REQ-10). */
export class ContentCardCatalog extends CardCatalog {
  constructor(private readonly content: TCatalogContent) {
    super()
  }

  async listCollections(): Promise<TCollection[]> {
    return [...this.content.collections]
  }

  async findCollection(id: string): Promise<TCollection | null> {
    return this.content.collections.find((c) => c.id === id) ?? null
  }

  async listCards(collectionId: string): Promise<TCard[]> {
    return this.content.cards.filter((c) => c.collectionId === collectionId)
  }

  async findCard(id: string): Promise<TCard | null> {
    return this.content.cards.find((c) => c.id === id) ?? null
  }
}
