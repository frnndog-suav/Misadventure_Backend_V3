import type {
  TAttribute,
  TClassDefinition,
  TModifier,
  TPlayerClass,
} from '@/domain/catalog/enterprise/value-objects/card'

/** CONTRATO FEAT-06, tipo `ClassDefinition`. */
export interface TClassDefinitionHttp {
  playerClass: TPlayerClass
  collectionId: string
  name: string
  essentialAttributes: TAttribute[]
  baseModifiers: Record<TModifier, number>
  starterDeck: { cardId: string; copies: number }[]
}

export class ClassPresenter {
  static toHTTP(classDefinition: TClassDefinition): TClassDefinitionHttp {
    return {
      playerClass: classDefinition.playerClass,
      collectionId: classDefinition.collectionId,
      name: classDefinition.name,
      essentialAttributes: [...classDefinition.essentialAttributes],
      baseModifiers: { ...classDefinition.baseModifiers },
      starterDeck: classDefinition.starterDeck.map(({ cardId, copies }) => ({
        cardId,
        copies,
      })),
    }
  }
}
