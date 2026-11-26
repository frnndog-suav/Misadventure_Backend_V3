import type {
  TAttribute,
  TCard,
  TClassDefinition,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import type { TPlayerState } from '../entities/party-member'
import type { TPartyAction } from '../party-action'

/** Completa uma trava de cada vez com os atributos já disponíveis nas pastas. */
export function aiBuildOptions(
  player: TPlayerState,
  cards: ReadonlyMap<string, TCard>,
  classes: readonly TClassDefinition[],
  config: TGameConfigValues
): Extract<TPartyAction, { type: 'adjustDeck' }>[] {
  const available = new Map<string, number>()
  for (const { cardId, copies } of [
    ...player.tcgFolder,
    ...(player.mount?.tcgFolder ?? []),
  ]) {
    available.set(cardId, (available.get(cardId) ?? 0) + copies)
  }
  const ownedBuild = new Map(
    player.build.map(({ cardId, copies }) => [cardId, copies])
  )
  const options: Extract<TPartyAction, { type: 'adjustDeck' }>[] = []

  for (const owned of player.playerClasses) {
    const definition = classes.find(
      ({ playerClass }) => playerClass === owned.playerClass
    )
    if (!definition?.essentialAttributes.length) continue
    const minimum =
      definition.essentialAttributes.length === 1
        ? config.lockOneEssential
        : config.lockTwoEssentials
    const base = new Map<TAttribute, number>(
      definition.essentialAttributes.map((attribute) => [attribute, minimum])
    )
    if (!owned.deckLockMet) addOption(base)
    for (const specialization of player.specializations ?? []) {
      if (
        specialization.playerClass !== owned.playerClass ||
        specialization.deckLockMet
      )
        continue
      const definitionOption = definition.specializations?.find(
        ({ id }) => id === specialization.specializationId
      )
      if (!definitionOption) continue
      const needs = new Map(base)
      for (const attribute of definitionOption.reinforcedAttributes) {
        if (needs.has(attribute))
          needs.set(attribute, minimum + config.lockSpecializationReinforcement)
      }
      for (const attribute of definitionOption.additionalAttributes) {
        needs.set(
          attribute,
          Math.max(
            needs.get(attribute) ?? 0,
            config.lockSpecializationAdditional
          )
        )
      }
      addOption(needs)
    }
  }
  return options

  function addOption(needs: ReadonlyMap<TAttribute, number>) {
    const build = new Map(ownedBuild)
    let added = 0
    for (const [attribute, minimum] of needs) {
      let missing = minimum
      for (const [id, copies] of build) {
        const card = cards.get(id)
        if (card?.type === 'attribute' && card.attributes.includes(attribute))
          missing -= copies
      }
      if (missing <= 0) continue
      for (const [id, copies] of available) {
        const card = cards.get(id)
        if (card?.type !== 'attribute' || !card.attributes.includes(attribute))
          continue
        const current = build.get(id) ?? 0
        const limit =
          card.attributeKind === 'basic'
            ? copies
            : Math.max(0, config.maxCopiesPerCard - current)
        const increase = Math.min(
          missing,
          limit,
          copies - (current - (ownedBuild.get(id) ?? 0))
        )
        if (increase <= 0) continue
        build.set(id, current + increase)
        added += increase
        missing -= increase
        if (missing === 0) break
      }
      if (missing > 0) return
    }
    if (added > 0)
      options.push({
        type: 'adjustDeck',
        build: [...build].map(([cardId, copies]) => ({ cardId, copies })),
      })
  }
}
