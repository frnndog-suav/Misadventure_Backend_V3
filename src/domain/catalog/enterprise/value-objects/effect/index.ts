import type {
  TAttribute,
  TElement,
  TEnemyBehavior,
  TEnemyCategory,
  TEnemyType,
  TEquipmentSlot,
  TItemCategory,
  TModifier,
  TPlayerClass,
  TZoneAction,
  TZoneType,
} from '@/domain/catalog/enterprise/value-objects/card'

/**
 * Modelo de efeitos (README 13, REQ-98, D-97). Espelha o CONTRATO FEAT-11 e o
 * catálogo `docs/EFEITOS-CATALOGO.md`: cada parte é uma união discriminada por
 * `kind`. Só é executado o que as FEATs trazem (D-100); o resto é dado.
 */

export const COMPARISONS = ['eq', 'lt', 'lte', 'gt', 'gte'] as const
export type TComparison = (typeof COMPARISONS)[number]

export const EVENT_PHASES = [
  'anticipation',
  'encounter',
  'success',
  'setback',
] as const
export type TEventPhase = (typeof EVENT_PHASES)[number]

export const EFFECT_MARKS = ['buff', 'debuff'] as const
export type TEffectMark = (typeof EFFECT_MARKS)[number]

export const QUANTITY_BASES = [
  'equipmentInUseCount',
  'equipmentInInventoryCount',
  'resourcesInInventoryCount',
  'relicsAndDocumentsInInventoryCount',
  'attributeDiscardCount',
  'halfHealth',
  'halfGold',
  'halfVigor',
  'allVigor',
  'highestModifier',
  'lowestModifier',
  'perEnemy',
] as const
export type TQuantityBase = (typeof QUANTITY_BASES)[number]

/** README 13.2: número fixo (≥ 0) ou fórmula; "mín. N" não alcançado = não ativa. */
export type TQuantity =
  | number
  | Readonly<{
      base: TQuantityBase
      multiplier: number
      minimum: number
    }>

export type TConstraint = 'none' | 'distinct' | 'same'

export type THandRequirement = Readonly<{
  requirements: readonly Readonly<{
    attribute: TAttribute | 'any'
    count: number
  }>[]
  excludeAttributes: readonly TAttribute[]
  constraint: TConstraint
  random: boolean
}>

export type TEquipmentSelection = Readonly<{
  slots: readonly TEquipmentSlot[]
  excludeSlots: readonly TEquipmentSlot[]
  count: number
  random: boolean
}>

export type TResourceOffer = Readonly<{
  /** `resource`: 'item' | 'equipment' | 'any' | ItemCategory | 'tag:<texto>'. */
  requirements: readonly Readonly<{ resource: string; count: number }>[]
  constraint: TConstraint
  /** 'item' | 'equipment' | ItemCategory | EquipmentSlot | 'tag:<texto>'. */
  exclude: readonly string[]
}>

export type TModifierComparison = Readonly<{
  left: readonly TModifier[]
  op: TComparison
  /** Exatamente um de `right` e `value` não é nulo. */
  right: readonly TModifier[] | null
  value: number | null
}>

export type TEffectSource = 'any' | 'inventory' | 'equipment'

export type TTrigger =
  | Readonly<{ kind: 'onEnterThisZone' }>
  | Readonly<{ kind: 'onEnterZoneTitle'; zoneTitle: string }>
  | Readonly<{
      kind: 'onEnterZoneFilter'
      zoneTypes: readonly TZoneType[]
      excludeZoneTypes: readonly TZoneType[]
      locations: readonly string[]
      excludeLocations: readonly string[]
    }>
  | Readonly<{
      kind: 'onZoneActionUsed'
      action: TZoneAction
      times: number
      consecutive: boolean
    }>
  | Readonly<{
      kind: 'onZoneActionSkipped'
      action: TZoneAction
      zones: number
    }>
  | Readonly<{
      kind: 'whileZoneActionCountBelow'
      action: TZoneAction
      max: number
    }>
  | Readonly<{ kind: 'onQuestCompleted' }>
  | Readonly<{ kind: 'onZoneQuestsCompleted' }>
  | Readonly<{ kind: 'onQuestCountReached'; count: number; perZone: boolean }>
  | Readonly<{ kind: 'onQuestAbandoned' }>
  | Readonly<{
      kind: 'onEventPhase'
      phases: readonly TEventPhase[]
      exclude: boolean
    }>
  | Readonly<{ kind: 'onEnemyDefeated'; count: number; distinct: boolean }>
  | Readonly<{ kind: 'onCombatFleeAttempt' }>
  | Readonly<{
      kind: 'onAbilityUsed'
      slots: readonly TEquipmentSlot[]
      excludeSlots: readonly TEquipmentSlot[]
      tags: readonly string[]
      cardId: string | null
    }>
  | Readonly<{
      kind: 'onResourceEffectActivated'
      source: TEffectSource
      count: number
      distinct: boolean
    }>
  | Readonly<{
      kind: 'whileResourceActivationCountBelow'
      max: number
      distinct: boolean
    }>
  | Readonly<{
      kind: 'whileInventoryResourceCount'
      count: number
      op: TComparison
      distinct: boolean
    }>
  | Readonly<{
      kind: 'whileEffectUseCount'
      source: TEffectSource
      slots: readonly TEquipmentSlot[]
      excludeSlots: readonly TEquipmentSlot[]
      itemCategories: readonly TItemCategory[]
      count: number
      op: TComparison
      distinct: boolean
    }>
  | Readonly<{
      kind: 'whileClassIs'
      classes: readonly TPlayerClass[]
      mode: 'anyOf' | 'allOf'
    }>
  | Readonly<{
      kind: 'whileSpecializationOf'
      classes: readonly TPlayerClass[]
    }>
  | Readonly<{
      kind: 'whilePrimaryClassCount'
      min: number
      max: number | null
    }>
  | Readonly<{
      kind: 'whileSpecializationCount'
      min: number
      max: number | null
    }>
  | Readonly<{ kind: 'whileHighestModifier'; modifiers: readonly TModifier[] }>
  | Readonly<{ kind: 'whileLowestModifier'; modifiers: readonly TModifier[] }>
  | (Readonly<{ kind: 'whileModifierComparison' }> & TModifierComparison)
  | Readonly<{
      kind: 'whileHandAttributeCount'
      attributes: readonly TAttribute[]
      mode: 'each' | 'any'
      count: number
      op: TComparison
    }>
  | Readonly<{
      kind: 'whileHandDistinctAttributes'
      count: number
      op: TComparison
    }>
  | Readonly<{ kind: 'whileHandCount'; count: number; op: TComparison }>
  | Readonly<{
      kind: 'whileAttributeDiscardCount'
      count: number
      op: TComparison
    }>
  | Readonly<{
      kind: 'whileAttributeDeckCount'
      count: number
      op: TComparison
    }>
  | Readonly<{ kind: 'whileHealth'; value: number; op: TComparison }>
  | Readonly<{ kind: 'whileGold'; value: number; op: TComparison }>
  | Readonly<{ kind: 'whileVigorRatio'; percent: number; op: TComparison }>
  | Readonly<{ kind: 'onVigorReached'; value: number }>
  | Readonly<{ kind: 'whilePeak'; value: number; op: TComparison }>
  | Readonly<{ kind: 'onVigorSpent'; amount: number }>
  | Readonly<{ kind: 'onPeakLost' }>
  | Readonly<{ kind: 'onElementAbilityUsed'; element: TElement }>
  | Readonly<{ kind: 'onElementalAdvantageHit' }>
  | Readonly<{ kind: 'onElementDamageTaken'; element: TElement | null }>
  | Readonly<{ kind: 'whileUsedAbilitiesSameElement' }>
  | Readonly<{ kind: 'onEngageEnemyElement'; element: TElement }>
  | Readonly<{ kind: 'onEngageEnemyType'; enemyTypes: readonly TEnemyType[] }>
  | Readonly<{ kind: 'onEnemyCategoryDefeated'; category: TEnemyCategory }>
  | Readonly<{ kind: 'whileEnemyCount'; count: number; op: TComparison }>
  | Readonly<{ kind: 'onAttackedByEnemyBehavior'; behavior: TEnemyBehavior }>

export type TCost =
  | Readonly<{ kind: 'consumeSelf' }>
  | (Readonly<{ kind: 'discardFromHand' }> & THandRequirement)
  | Readonly<{ kind: 'discardHandDownTo'; leave: number; minimum: number }>
  | Readonly<{ kind: 'discardWholeHand'; minimum: number }>
  | Readonly<{ kind: 'donateLife'; amount: TQuantity }>
  | Readonly<{ kind: 'payGold'; amount: TQuantity }>
  | (Readonly<{ kind: 'abandonEquipment' }> & TEquipmentSelection)
  | (Readonly<{ kind: 'offerResources' }> & TResourceOffer)
  | Readonly<{
      kind: 'manipulateAttributeCards'
      mode:
        | 'millTop'
        | 'millBottom'
        | 'reshuffleDiscard'
        | 'reshuffleHand'
        | 'handToTop'
        | 'handToBottom'
      count: number
      minimum: number | null
    }>
  | Readonly<{ kind: 'spendVigor'; amount: TQuantity }>
  /** Exatamente um de `amount` e `percent` não é nulo. */
  | Readonly<{
      kind: 'reducePeak'
      amount: number | null
      percent: number | null
    }>

export type TModifierChange<K extends string> = Readonly<
  { modifier: TModifier } & { [P in K]: number }
>

export type TActivation =
  | Readonly<{ kind: 'gainGold'; amount: number }>
  | Readonly<{ kind: 'loseGold'; amount: number }>
  | Readonly<{ kind: 'heal'; amount: number }>
  | Readonly<{ kind: 'loseLife'; amount: number | 'halfHealth' }>
  | Readonly<{ kind: 'gainPeak'; amount: number }>
  | Readonly<{ kind: 'restoreVigor'; amount: number }>
  | Readonly<{
      kind: 'modifierFlat'
      changes: readonly TModifierChange<'amount'>[]
    }>
  | Readonly<{
      kind: 'modifierPercent'
      changes: readonly TModifierChange<'percent'>[]
    }>
  | Readonly<{ kind: 'zeroModifiers'; modifiers: readonly TModifier[] }>
  | Readonly<{
      kind: 'attributeValueMultiplier'
      attribute: TAttribute
      factor: number
    }>
  | Readonly<{ kind: 'effectDamage'; amount: number }>
  | Readonly<{
      kind: 'enemyModifierFlat'
      changes: readonly TModifierChange<'amount'>[]
    }>
  | Readonly<{ kind: 'gainBaseHealth'; amount: number }>
  | Readonly<{ kind: 'drawCards'; count: number }>
  | (Readonly<{ kind: 'discardHandCards' }> & THandRequirement)
  | Readonly<{ kind: 'returnDiscardToDeckTop'; count: number }>
  | Readonly<{ kind: 'millDeck'; count: number; from: 'top' | 'bottom' }>
  | Readonly<{
      kind: 'searchAttribute'
      attribute: TAttribute
      count: number
      source: 'deck' | 'discardPile'
      shuffle: boolean
    }>
  | Readonly<{ kind: 'handToDeckTop'; count: number }>
  | Readonly<{
      kind: 'nullifyEffects'
      target: 'equipment' | 'item' | 'attributeCard'
      slots: readonly TEquipmentSlot[]
      itemCategories: readonly TItemCategory[]
    }>
  | Readonly<{
      kind: 'nullifyAbilities'
      slots: readonly TEquipmentSlot[]
      tags: readonly string[]
    }>
  | Readonly<{ kind: 'keepPeakOnKnockout' }>
  | Readonly<{ kind: 'actionPointsOverride'; value: number }>
  | Readonly<{ kind: 'actionPointsBonus'; amount: number }>
  | Readonly<{ kind: 'moveDistanceBonus'; zones: number }>
  | Readonly<{ kind: 'recoverHealPercentOverride'; percent: number }>
  | Readonly<{ kind: 'skipEventBackfire' }>
  | Readonly<{ kind: 'handLimit'; max: number }>
  | Readonly<{ kind: 'fleeTargetOverride'; value: number }>
  | Readonly<{
      kind: 'fleeTargetModifier'
      amount: number | 'minusHandCount'
    }>
  | Readonly<{
      kind: 'marketShowcaseModifier'
      mode: 'add' | 'set'
      value: number
    }>
  | Readonly<{ kind: 'diceChooseResult' }>
  | Readonly<{
      kind: 'diceResultModifier'
      amount: number | 'minusHandCount'
    }>
  | Readonly<{ kind: 'breakEquipment'; slots: readonly TEquipmentSlot[] }>
  | (Readonly<{ kind: 'abandonOwnEquipment' }> & TEquipmentSelection)
  | Readonly<{ kind: 'repairEquipment'; target: 'self' | 'allyInZone' }>
  | (Readonly<{ kind: 'offerResourcesAsEffect' }> & TResourceOffer)
  | Readonly<{ kind: 'changeNextAbilityElement'; element: TElement }>
  | Readonly<{ kind: 'grantElementToAbility'; element: TElement }>
  | Readonly<{ kind: 'removeEnemyElement' }>
  | Readonly<{ kind: 'ignoreElementalDisadvantage' }>
  | Readonly<{ kind: 'elementalAdvantageOverride'; percent: number }>
  | Readonly<{ kind: 'invertElementalRelations' }>
  | Readonly<{ kind: 'elementResistance'; element: TElement }>
  | Readonly<{ kind: 'elementImmunity'; element: TElement }>
  | Readonly<{ kind: 'elementVulnerability'; element: TElement }>
  | Readonly<{
      kind: 'elementVigorCostModifier'
      element: TElement
      percent: number
    }>
  | Readonly<{ kind: 'defeatEnemy' }>
  | Readonly<{ kind: 'extraAttack'; count: number }>
  | Readonly<{ kind: 'skipEnemyTurn'; count: number }>
  | Readonly<{ kind: 'swapCombatOrder' }>
  | Readonly<{ kind: 'reviveAlly'; healthPercent: number }>
  | Readonly<{ kind: 'teleportToRespawn' }>
  | Readonly<{ kind: 'loseMount' }>
  | Readonly<{
      kind: 'moveToZoneOfType'
      zoneType: TZoneType | 'sameAsCurrent'
    }>
  | Readonly<{
      kind: 'removeDebuffs'
      target: 'self' | 'allyInZone' | 'enemy'
    }>
  | Readonly<{ kind: 'removeBuffs'; target: 'self' | 'allyInZone' | 'enemy' }>

export type TDuration =
  | Readonly<{ kind: 'immediate' }>
  | Readonly<{ kind: 'whileSourceActive' }>
  | Readonly<{ kind: 'infinite' }>
  | Readonly<{ kind: 'untilThisCardDiscarded' }>
  | Readonly<{ kind: 'untilCardDiscarded'; cardId: string }>
  | Readonly<{ kind: 'untilHandCount'; count: number; op: TComparison }>
  | Readonly<{ kind: 'untilResourcesInLimbo'; count: number }>
  | Readonly<{ kind: 'untilEndOfTurn' }>
  | Readonly<{ kind: 'untilStartOfNextTurn' }>
  | Readonly<{ kind: 'forOwnTurns'; turns: number }>
  | Readonly<{ kind: 'untilEndOfNextPlayerTurn' }>
  | Readonly<{ kind: 'untilEndOfRound' }>
  | Readonly<{ kind: 'forRounds'; rounds: number }>
  | Readonly<{ kind: 'untilStartOfNextRound' }>
  | Readonly<{ kind: 'whileInThisZone' }>
  | Readonly<{ kind: 'untilLeaveZone' }>
  | Readonly<{ kind: 'untilEnterZoneType'; zoneTypes: readonly TZoneType[] }>
  | Readonly<{ kind: 'forZonesPassed'; count: number }>
  | Readonly<{ kind: 'untilEventEnd' }>
  | Readonly<{ kind: 'forEvents'; count: number }>
  | Readonly<{ kind: 'untilEventSuccess' }>
  | Readonly<{ kind: 'untilEventFailure' }>
  | Readonly<{ kind: 'untilNextCombatEnd' }>
  | Readonly<{ kind: 'forCombats'; count: number }>
  | Readonly<{ kind: 'untilCombatWon' }>
  | Readonly<{ kind: 'untilEventPhaseEnd'; phase: TEventPhase }>
  | Readonly<{ kind: 'duringEventPhases'; phases: readonly TEventPhase[] }>
  | Readonly<{
      kind: 'untilZoneActionUsed'
      action: TZoneAction
      count: number
    }>
  | Readonly<{ kind: 'forZoneActions'; count: number }>
  | Readonly<{ kind: 'untilOwnCombatTurnEnd' }>
  | Readonly<{ kind: 'forOwnCombatTurns'; turns: number }>
  | Readonly<{ kind: 'forCombatCycles'; cycles: number }>
  | Readonly<{ kind: 'untilDamageTaken' }>
  | Readonly<{ kind: 'untilAttackMade' }>
  | Readonly<{ kind: 'untilAttackMissed' }>
  | Readonly<{ kind: 'untilAbilityUsed'; element: TElement | null }>
  | Readonly<{ kind: 'forAbilitiesUsed'; count: number }>
  | Readonly<{ kind: 'whileAbilityActive'; cardId: string }>
  | Readonly<{ kind: 'untilOtherResourceEffectActivated' }>
  | Readonly<{ kind: 'untilAnyEffectNullified' }>
  | Readonly<{ kind: 'whileEffectActive'; cardId: string; effectIndex: number }>
  | Readonly<{
      kind: 'whileAttributeInHand'
      attribute: TAttribute
      count: number
    }>
  | Readonly<{ kind: 'untilAttributeDiscarded'; attribute: TAttribute }>
  | Readonly<{
      kind: 'untilAttributeInDiscard'
      attribute: TAttribute
      count: number
    }>
  | Readonly<{ kind: 'untilKnockout' }>
  | Readonly<{
      kind: 'whileHealthThreshold'
      value: number
      op: TComparison
    }>
  | Readonly<{ kind: 'untilHandEmpty' }>
  | Readonly<{ kind: 'untilGoldSpent'; amount: number }>
  | Readonly<{ kind: 'whileResourceInInventory'; cardId: string }>
  | Readonly<{ kind: 'untilInventoryFull' }>
  | Readonly<{ kind: 'untilResourceOffered' }>
  | Readonly<{
      kind: 'whileHighestModifierIs'
      modifiers: readonly TModifier[]
    }>
  | Readonly<{ kind: 'untilVigorBelow'; value: number }>
  | (Readonly<{ kind: 'whileModifierComparison' }> & TModifierComparison)
  | Readonly<{ kind: 'whileHasClass'; classes: readonly TPlayerClass[] }>
  | Readonly<{ kind: 'untilSpecializationGained' }>
  | Readonly<{ kind: 'whileSinglePrimaryClass' }>
  | Readonly<{ kind: 'untilPartyEnd' }>
  | Readonly<{ kind: 'untilLeaveDimension' }>

type TEffectBase = {
  /** pt-BR, não vazio, para exibir. */
  text: string
  /** `null` = sem gatilho. */
  trigger: TTrigger | null
  /** Vazio = sem custo. Pago na ordem. */
  cost: readonly TCost[]
  /** Pelo menos 1. Aplicadas na ordem. */
  activation: readonly TActivation[]
  duration: TDuration
}

/** README 13, 13.6: efeito de atributo aprimorado, equipamento e item. */
export type TEffect = Readonly<TEffectBase & { mark: TEffectMark | null }>

/** README 13.6: efeito de zona e de dimensão traz `polarity` no lugar de `mark`. */
export type TZoneEffect = Readonly<
  TEffectBase & { polarity: 'positive' | 'negative' }
>

export type TTriggerKind = TTrigger['kind']
export type TCostKind = TCost['kind']
export type TActivationKind = TActivation['kind']
export type TDurationKind = TDuration['kind']
