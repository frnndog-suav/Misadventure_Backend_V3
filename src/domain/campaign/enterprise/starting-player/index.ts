import type { SeededRng } from '@/core/rng/seeded-rng'
import { isClassActive } from '@/domain/catalog/enterprise/class-lock'
import type {
  TAttributeCard,
  TClassDefinition,
  TModifier,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import { maxHealthOf, type TPlayerState } from '../entities/party-member'
import { shuffle } from '../shuffle'

export type TStartingPlayerInput = Readonly<{
  config: TGameConfigValues
  classDefinition: TClassDefinition
  /** Cartas de atributo do `starterDeck` (as que não vierem não contam na trava). */
  attributeCards: readonly TAttributeCard[]
  startingCityZoneId: string
  rng: SeededRng
}>

function defaultModifiers(
  config: TGameConfigValues
): Record<TModifier, number> {
  return {
    attack: config.defaultAttack,
    defense: config.defaultDefense,
    accuracy: config.defaultAccuracy,
    evasion: config.defaultEvasion,
    celerity: config.defaultCelerity,
    piercing: config.defaultPiercing,
    reflection: config.defaultReflection,
  }
}

/**
 * Estado inicial do jogador (README 4.4, 7.4, 8.2, 9.1, 20.1; REQ-34). O deck
 * é a build expandida na ordem do `starterDeck` e embaralhada; a mão são as
 * `initialHandSize` primeiras (saem do deck).
 */
export function createStartingPlayer({
  config,
  classDefinition,
  attributeCards,
  startingCityZoneId,
  rng,
}: TStartingPlayerInput): TPlayerState {
  const build = classDefinition.starterDeck.map(({ cardId, copies }) => ({
    cardId,
    copies,
  }))
  const deckLockMet = isClassActive({
    build: build.flatMap(({ cardId, copies }) => {
      const card = attributeCards.find((c) => c.id === cardId)
      return card ? [{ card, copies }] : []
    }),
    essentialAttributes: classDefinition.essentialAttributes,
    lockOneEssential: config.lockOneEssential,
    lockTwoEssentials: config.lockTwoEssentials,
  })

  const shuffled = shuffle(
    build.flatMap(({ cardId, copies }) =>
      Array.from({ length: copies }, () => cardId)
    ),
    rng
  )
  const hand = shuffled.slice(0, config.initialHandSize)
  const deck = shuffled.slice(hand.length)

  const baseHealth = config.baseHealth
  const peak = config.initialPeak

  return {
    playerClasses: [{ playerClass: classDefinition.playerClass, deckLockMet }],
    build,
    deck,
    hand,
    discard: [],
    gold: config.initialGold,
    baseHealth,
    health: maxHealthOf({ baseHealth, peak }),
    peak,
    vigor: config.initialVigor,
    modifiers: deckLockMet
      ? { ...classDefinition.baseModifiers }
      : defaultModifiers(config),
    zoneId: startingCityZoneId,
    respawnZoneId: startingCityZoneId,
  }
}
