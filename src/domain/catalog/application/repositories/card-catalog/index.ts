import type {
  TCard,
  TClassDefinition,
  TCollection,
} from '@/domain/catalog/enterprise/value-objects/card'

/** Leitura do conteúdo publicado (Constituição 6, D-18). Sem ordem garantida. */
export abstract class CardCatalog {
  abstract listCollections(): Promise<TCollection[]>
  abstract findCollection(id: string): Promise<TCollection | null>
  abstract listCards(collectionId: string): Promise<TCard[]>
  abstract findCard(id: string): Promise<TCard | null>
  /** Classes publicadas (D-40). Sem ordem garantida. */
  abstract listClasses(): Promise<TClassDefinition[]>
  /** Recebe texto cru (REQ-35): valor fora do enum → `null`. */
  abstract findClass(playerClass: string): Promise<TClassDefinition | null>
}
