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

/** Texto de regra para exibir (pt-BR); estruturado na FEAT-11 (D-20). */
export type TRuleText = Readonly<{ text: string }>

export type TAbility = Readonly<{ name: string; text: string }>

export type TZoneCard = Readonly<{
  type: 'zone'
  id: string
  collectionId: string
  title: string
  zoneType: TZoneType
  location: string
  connectionArrows: number
  zoneActions: readonly TZoneAction[]
  effects: readonly Readonly<TRuleText & { polarity: TZoneEffectPolarity }>[]
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
  effects: readonly TRuleText[]
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
  effects: readonly TRuleText[]
  refinement: Readonly<{ maxLevel: number; materials: TRuleText }> | null
  enchantment: TRuleText | null
  priceMultiplier: number
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
  effects: readonly TRuleText[]
}>

export type TRandomEventCard = Readonly<{
  type: 'randomEvent'
  id: string
  collectionId: string
  title: string
  flavorText: string | null
  requirements: readonly TRuleText[]
  goodOutcome: TRuleText
  badOutcome: TRuleText
  noEscape: boolean
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

export type TCard =
  | TZoneCard
  | TAttributeCard
  | TEquipmentCard
  | TItemCard
  | TRandomEventCard
  | TCombatEventCard

export type TCollection = Readonly<{ id: string; name: string }>

export function isCardType(value: unknown): value is TCardType {
  return (
    typeof value === 'string' &&
    (CARD_TYPES as readonly string[]).includes(value)
  )
}
