import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
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
 * Conteúdo em memória: serve o editor (`ContentStore`) e o catálogo
 * (`CardCatalog`, só com o publicado, REQ-41).
 */
export class InMemoryContentStore implements ContentStore, CardCatalog {
  public collections: TContentCollection[] = []
  public cards: TEditorCard[] = []
  public classes: TEditorClass[] = []

  // ContentStore

  async listCollections(): Promise<TContentCollection[]> {
    return [...this.collections]
  }

  async findCollection(id: string): Promise<TContentCollection | null> {
    return this.collections.find((collection) => collection.id === id) ?? null
  }

  async listEditorCards(collectionId: string): Promise<TEditorCard[]> {
    return this.cards.filter(
      (entry) => entry.card.collectionId === collectionId
    )
  }

  async findEditorCard(id: string): Promise<TEditorCard | null> {
    return this.cards.find((entry) => entry.card.id === id) ?? null
  }

  async listEditorClasses(): Promise<TEditorClass[]> {
    return [...this.classes]
  }

  async findEditorClass(playerClass: string): Promise<TEditorClass | null> {
    return (
      this.classes.find(
        (entry) => entry.classDefinition.playerClass === playerClass
      ) ?? null
    )
  }

  async createCollection(collection: TContentCollection): Promise<void> {
    this.collections.push(collection)
  }

  async updateCollection(collection: TContentCollection): Promise<void> {
    this.collections = this.collections.map((current) =>
      current.id === collection.id ? collection : current
    )
  }

  async deleteCollection(id: string): Promise<void> {
    this.collections = this.collections.filter(
      (collection) => collection.id !== id
    )
    this.cards = this.cards.filter((entry) => entry.card.collectionId !== id)
    this.classes = this.classes.filter(
      (entry) => entry.classDefinition.collectionId !== id
    )
  }

  async saveCard(
    card: TCard,
    status: TContentStatus,
    replacedId?: string
  ): Promise<void> {
    const oldId = replacedId ?? card.id
    const index = this.cards.findIndex((entry) => entry.card.id === oldId)
    if (index === -1) this.cards.push({ status, card })
    else this.cards[index] = { status, card }
  }

  async deleteCard(id: string): Promise<void> {
    this.cards = this.cards.filter((entry) => entry.card.id !== id)
  }

  async saveClass(
    definition: TClassDefinition,
    status: TContentStatus,
    replacedPlayerClass?: string
  ): Promise<void> {
    const oldId = replacedPlayerClass ?? definition.playerClass
    const index = this.classes.findIndex(
      (entry) => entry.classDefinition.playerClass === oldId
    )
    const entry = { status, classDefinition: definition }
    if (index === -1) this.classes.push(entry)
    else this.classes[index] = entry
  }

  async deleteClass(playerClass: string): Promise<void> {
    this.classes = this.classes.filter(
      (entry) => entry.classDefinition.playerClass !== playerClass
    )
  }

  async importCollection(
    file: {
      collection: TContentCollection
      cards: readonly TEditorCard[]
      classes: readonly TEditorClass[]
    },
    replace: boolean
  ): Promise<void> {
    if (replace) await this.deleteCollection(file.collection.id)
    this.collections.push(file.collection)
    this.cards.push(...file.cards)
    this.classes.push(...file.classes)
  }

  // CardCatalog: só as publicadas (REQ-41)

  async listCards(collectionId: string): Promise<TCard[]> {
    return this.cards
      .filter(
        (entry) =>
          entry.status === 'published' &&
          entry.card.collectionId === collectionId
      )
      .map((entry) => entry.card)
  }

  async findCard(id: string): Promise<TCard | null> {
    const entry = this.cards.find((current) => current.card.id === id)
    return entry?.status === 'published' ? entry.card : null
  }

  async listClasses(): Promise<TClassDefinition[]> {
    return this.classes
      .filter((entry) => entry.status === 'published')
      .map((entry) => entry.classDefinition)
  }

  async findClass(playerClass: string): Promise<TClassDefinition | null> {
    const entry = this.classes.find(
      (current) => current.classDefinition.playerClass === playerClass
    )
    return entry?.status === 'published' ? entry.classDefinition : null
  }
}
