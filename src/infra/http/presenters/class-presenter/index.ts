import type {
  TAttribute,
  TClassDefinition,
  TModifier,
  TPlayerClass,
  TSpecializationDefinition,
} from '@/domain/catalog/enterprise/value-objects/card'

/** CONTRATO FEAT-06, tipo `ClassDefinition`. */
export interface TClassDefinitionHttp {
  playerClass: TPlayerClass
  collectionId: string
  name: string
  essentialAttributes: TAttribute[]
  baseModifiers: Record<TModifier, number>
  starterDeck: { cardId: string; copies: number }[]
  specializations: readonly TSpecializationDefinition[]
}

export class ClassPresenter {
  static toHTTP(classDefinition: TClassDefinition): TClassDefinitionHttp {
    return {
      playerClass: classDefinition.playerClass,
      collectionId: classDefinition.collectionId,
      name: classDefinition.name,
      essentialAttributes: [...classDefinition.essentialAttributes],
      baseModifiers: { ...classDefinition.baseModifiers },
      specializations: classDefinition.specializations ?? [],
      starterDeck: classDefinition.starterDeck.map(({ cardId, copies }) => ({
        cardId,
        copies,
      })),
    }
  }
}
