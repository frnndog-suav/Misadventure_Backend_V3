import type {
  TCost,
  TEffect,
  TZoneEffect,
} from '@/domain/catalog/enterprise/value-objects/effect'

/**
 * Cartas como dados (Constituição 6, D-18). Espelham os tipos do CONTRATO
 * FEAT-04; os nomes dos enums vêm do glossário (CONTRATO §2.3, §2.5, §2.7).
 * São imutáveis: o catálogo nunca muda uma carta (README 27).
 */

export const CARD_TYPES = [
  'zone',
  'attribute',
  'equipment',
  'item',
  'randomEvent',
  'combatEvent',
  'dimension',
] as const
export type TCardType = (typeof CARD_TYPES)[number]

/** README 24.3 */
export const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const
export type TRarity = (typeof RARITIES)[number]

/** README 3.3 */
export const ZONE_TYPES = [
  'mountainous',
  'forest',
  'coastal',
  'lacustrine',
  'swamp',
  'grassland',
  'desert',
  'volcanic',
  'fluvial',
  'underground',
  'urban',
  'rural',
  'inhabited',
  'fortified',
  'religious',
  'industrial',
] as const
export type TZoneType = (typeof ZONE_TYPES)[number]

/** README 12.2, CONTRATO §2.5 */
export const ZONE_ACTIONS = [
  'move',
  'recover',
  'prepare',
  'adjustDeck',
  'negotiate',
  'abandonQuest',
  'artificerWorkshop',
  'startEvent',
  'scavenge',
  'useVault',
  'takeQuest',
  'continueQuest',
  'finishQuest',
  'takeTrialQuest',
  'completeDimension',
  'visitBlacksmith',
  'visitMarket',
  'trainWithMentor',
  'saveRespawnPoint',
] as const
export type TZoneAction = (typeof ZONE_ACTIONS)[number]

/** README 4.1, CONTRATO §2.3 */
export const ATTRIBUTES = [
  'strength',
  'dexterity',
  'endurance',
  'intelligence',
  'wisdom',
  'charisma',
  'spirit',
  'sanity',
  'luck',
] as const
export type TAttribute = (typeof ATTRIBUTES)[number]

/** README 4.3 */
export const ATTRIBUTE_KINDS = ['basic', 'synergy', 'enhanced'] as const
export type TAttributeKind = (typeof ATTRIBUTE_KINDS)[number]

/** README 7.1, CONTRATO §2.3 */
export const MODIFIERS = [
  'attack',
  'defense',
  'accuracy',
  'evasion',
  'celerity',
  'piercing',
  'reflection',
] as const
export type TModifier = (typeof MODIFIERS)[number]

/** README 5.1 */
export const EQUIPMENT_SLOTS = [
  'head',
  'torso',
  'legs',
  'feet',
  'cape',
  'weapon',
  'shield',
  'accessory',
] as const
export type TEquipmentSlot = (typeof EQUIPMENT_SLOTS)[number]

/** README 5.2 */
export const ITEM_CATEGORIES = [
  'consumable',
  'material',
  'relic',
  'tool',
  'treasure',
  'document',
  'booster',
  'special',
] as const
export type TItemCategory = (typeof ITEM_CATEGORIES)[number]

/** README 8.6 */
export const PLAYER_CLASSES = [
  'warrior',
  'mage',
  'rogue',
  'cleric',
  'ranger',
  'druid',
  'monk',
  'bard',
  'alchemist',
  'artificer',
  'warlock',
  'sorcerer',
] as const
export type TPlayerClass = (typeof PLAYER_CLASSES)[number]

/** README 16.2 */
export const ELEMENTS = [
  'earth',
  'water',
  'fire',
  'air',
  'frost',
  'electric',
  'organic',
  'toxic',
  'arcane',
  'dark',
  'celestial',
  'draconic',
  'cosmic',
  'sonic',
  'psychic',
  'blood',
  'spiritual',
] as const
export type TElement = (typeof ELEMENTS)[number]

/** README 18.2 */
export const ENEMY_TYPES = [
  'beast',
  'humanoid',
  'undead',
  'spirit',
  'demon',
  'celestial',
  'elemental',
  'construct',
  'draconic',
  'aberration',
  'plant',
] as const
export type TEnemyType = (typeof ENEMY_TYPES)[number]

/** README 18.3 (o chefe final fica na Carta de Dimensão, D-19). */
export const ENEMY_CATEGORIES = ['common', 'elite', 'boss'] as const
export type TEnemyCategory = (typeof ENEMY_CATEGORIES)[number]

/** README 18.1, 19.6 */
export const ENEMY_BEHAVIORS = [
  'aggressive',
  'defensive',
  'support',
  'hunter',
] as const
export type TEnemyBehavior = (typeof ENEMY_BEHAVIORS)[number]

export const ZONE_EFFECT_POLARITIES = ['positive', 'negative'] as const
export type TZoneEffectPolarity = (typeof ZONE_EFFECT_POLARITIES)[number]

/** Texto de regra para exibir (pt-BR); habilidades, eventos, refino e encantamento (D-98). */
export type TRuleText = Readonly<{ text: string }>

export type TAbility = Readonly<{ name: string; text: string }>

/** README 3.5, D-37: forma da zona com 2 setas (lados opostos ou vizinhos). */
export const ARROW_LAYOUTS = ['straight', 'corner'] as const
export type TArrowLayout = (typeof ARROW_LAYOUTS)[number]

export type TZoneCard = Readonly<{
  type: 'zone'
  id: string
  collectionId: string
  title: string
  zoneType: TZoneType
  location: string
  connectionArrows: number
  /** Só com 2 setas (D-37); `null` com 1, 3 ou 4. */
  arrowLayout: TArrowLayout | null
  zoneActions: readonly TZoneAction[]
  effects: readonly TZoneEffect[]
}>

export type TAttributeCard = Readonly<{
  type: 'attribute'
  id: string
  collectionId: string
  name: string
  flavorText: string | null
  rarity: TRarity
  attributeKind: TAttributeKind
  attributes: readonly TAttribute[]
  effects: readonly TEffect[]
}>

export type TEquipmentCard = Readonly<{
  type: 'equipment'
  id: string
  collectionId: string
  name: string
  flavorText: string | null
  rarity: TRarity
  slot: TEquipmentSlot
  tags: readonly string[]
  modifiers: readonly Readonly<{ modifier: TModifier; value: number }>[]
  peakRequirement: number | null
  classRestriction: readonly TPlayerClass[]
  blocksShield: boolean
  abilities: readonly TAbility[]
  effects: readonly TEffect[]
  refinement: Readonly<{ maxLevel: number; materials: TRuleText }> | null
  enchantment: TRuleText | null
  priceMultiplier: number
  /** D-86: `toolKind` da ferramenta que coleta esta carta (README 12.6). */
  scavengeTool: string | null
}>

export type TItemCard = Readonly<{
  type: 'item'
  id: string
  collectionId: string
  name: string
  flavorText: string | null
  rarity: TRarity
  itemCategory: TItemCategory
  tags: readonly string[]
  effects: readonly TEffect[]
  /** D-86: só em `tool` (`kebab-case`); senão `null`. */
  toolKind: string | null
  /** D-86: zonas onde a ferramenta vasculha; não vazia se e só se `toolKind`. */
  scavengeZoneTypes: readonly TZoneType[]
  /** D-86: `toolKind` da ferramenta que coleta esta carta. */
  scavengeTool: string | null
}>

export type TRandomEventRequirement = Readonly<{ id: string; text: string }> &
  (
    | {
        kind: 'attributes'
        specific: Partial<Record<TAttribute, number>>
        any: number
      }
    | { kind: 'minimum'; stat: 'peak' | 'vigor' | TModifier; value: number }
    | Extract<
        TCost,
        { kind: Exclude<TCost['kind'], 'consumeSelf' | 'reducePeak'> }
      >
  )

export type TRandomEventOutcomeStep =
  | {
      type: 'effect'
      effect: Omit<TEffect, 'trigger' | 'cost' | 'duration'> & {
        duration: TEffect['duration'] | { kind: 'untilEventPhaseEnd' }
      }
    }
  | { type: 'drawRewards'; count: number }
  | { type: 'searchReward'; cardId: string }
  | { type: 'grantReward'; cardId: string; copies: number }

type TRandomEventOutcome = Readonly<{
  text: string
  steps: readonly TRandomEventOutcomeStep[]
}>

export type TRandomEventCard = Readonly<{
  type: 'randomEvent'
  id: string
  collectionId: string
  title: string
  flavorText: string | null
  requirements: readonly (TRuleText | TRandomEventRequirement)[]
  goodOutcome: TRuleText | TRandomEventOutcome
  badOutcome: TRuleText | TRandomEventOutcome
  noEscape: boolean
  escapeThreshold?: number | null
}>

export type TEnemy = Readonly<{
  name: string
  flavorText: string | null
  count: number
  enemyTypes: readonly TEnemyType[]
  creature: string
  enemyCategory: TEnemyCategory
  element: TElement | null
  health: number
  modifiers: Readonly<Record<TModifier, number>>
  vigor: number | null
  abilities: readonly TAbility[]
  behavior: TEnemyBehavior
}>

export type TCombatEventCard = Readonly<{
  type: 'combatEvent'
  id: string
  collectionId: string
  title: string
  flavorText: string | null
  enemies: readonly TEnemy[]
  goodOutcome: TRuleText
  badOutcome: TRuleText
  noEscape: boolean
}>

/** README 3.4, D-74: composição do deck de recompensas de um tipo de zona. */
export type TRewardDeck = Readonly<{
  zoneType: TZoneType
  cards: readonly Readonly<{ cardId: string; copies: number }>[]
}>

/** README 3.2, mínima (D-39): as zonas da dimensão são as da sua coleção. */
export type TDimensionCard = Readonly<{
  type: 'dimension'
  id: string
  collectionId: string
  name: string
  flavorText: string | null
  releaseOrder: number
  arrivalZoneTitle: string | null
  effects: readonly TZoneEffect[]
  rewardDecks: readonly TRewardDeck[]
  eventDecks?: readonly TRewardDeck[]
}>

export type TCard =
  | TZoneCard
  | TAttributeCard
  | TEquipmentCard
  | TItemCard
  | TRandomEventCard
  | TCombatEventCard
  | TDimensionCard

export type TCollection = Readonly<{ id: string; name: string }>

/** Classe com deck pré-pronto (README 8.5 a 8.7, 4.4; D-40). Não é carta. */
export type TStarterDeckEntry = Readonly<{ cardId: string; copies: number }>

export type TClassDefinition = Readonly<{
  playerClass: TPlayerClass
  collectionId: string
  name: string
  essentialAttributes: readonly TAttribute[]
  baseModifiers: Readonly<Record<TModifier, number>>
  starterDeck: readonly TStarterDeckEntry[]
}>

export function isCardType(value: unknown): value is TCardType {
  return (
    typeof value === 'string' &&
    (CARD_TYPES as readonly string[]).includes(value)
  )
}
