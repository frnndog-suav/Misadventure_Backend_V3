import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { validateClassCandidate } from '@/domain/catalog/enterprise/class-validation'
import type { TClassDefinition } from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TContentIssue,
  TContentStatus,
  TEditorCard,
} from '@/domain/catalog/enterprise/value-objects/content'

/**
 * Problemas da classe candidata (REQ-38) contra o conteúdo do `store`.
 * `replacedPlayerClass` = o `playerClass` que ela já tinha (fica fora das
 * outras classes). Com o `playerClass` já usado por outra classe, o nome
 * repetido não é problema à parte: a repetição vira 409 no caso de uso.
 */
export async function checkClassCandidate(
  contentStore: ContentStore,
  candidate: TClassDefinition,
  status: TContentStatus,
  replacedPlayerClass?: string
): Promise<TContentIssue[]> {
  const others = (await contentStore.listEditorClasses()).filter(
    ({ classDefinition }) =>
      classDefinition.playerClass !== replacedPlayerClass &&
      classDefinition.playerClass !== candidate.playerClass
  )

  const cards: TEditorCard[] = []
  for (const { cardId } of candidate.starterDeck) {
    const entry = await contentStore.findEditorCard(cardId)
    if (entry) cards.push(entry)
  }

  return validateClassCandidate({ candidate, status, others, cards })
}

/** `playerClass` já usado por outra classe do conteúdo todo (rascunho ou publicada). */
export async function isPlayerClassTaken(
  contentStore: ContentStore,
  playerClass: string
): Promise<boolean> {
  return (await contentStore.findEditorClass(playerClass)) !== null
}
