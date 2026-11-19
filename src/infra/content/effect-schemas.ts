import { z } from 'zod'

import {
  ATTRIBUTES,
  ELEMENTS,
  ENEMY_BEHAVIORS,
  ENEMY_CATEGORIES,
  ENEMY_TYPES,
  EQUIPMENT_SLOTS,
  ITEM_CATEGORIES,
  MODIFIERS,
  PLAYER_CLASSES,
  ZONE_ACTIONS,
  ZONE_EFFECT_POLARITIES,
  ZONE_TYPES,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  COMPARISONS,
  EFFECT_MARKS,
  EVENT_PHASES,
  QUANTITY_BASES,
} from '@/domain/catalog/enterprise/value-objects/effect'

/**
 * Forma de um efeito no conteúdo e no editor (REQ-98, D-97). Espelha as
 * uniões do domínio (`value-objects/effect`) campo a campo: cada parte é uma
 * união discriminada por `kind`. O schema confere só estrutura e pertinência
 * a enums (D-103); faixas, inteiros e regras entre campos ficam no domínio
 * (`effect-rules`, REQ-99). Parâmetros sempre presentes (CONTRATO FEAT-11):
 * lista opcional vem `[]`, escalar opcional vem `null`.
 */

const comparison = z.enum(COMPARISONS)
const eventPhase = z.enum(EVENT_PHASES)
const effectMark = z.enum(EFFECT_MARKS)
const zoneEffectPolarity = z.enum(ZONE_EFFECT_POLARITIES)
const zoneType = z.enum(ZONE_TYPES)
const zoneAction = z.enum(ZONE_ACTIONS)
const attribute = z.enum(ATTRIBUTES)
const attributeOrAny = z.union([attribute, z.literal('any')])
const modifier = z.enum(MODIFIERS)
const equipmentSlot = z.enum(EQUIPMENT_SLOTS)
const itemCategory = z.enum(ITEM_CATEGORIES)
const element = z.enum(ELEMENTS)
const playerClass = z.enum(PLAYER_CLASSES)
const enemyType = z.enum(ENEMY_TYPES)
const enemyCategory = z.enum(ENEMY_CATEGORIES)
const enemyBehavior = z.enum(ENEMY_BEHAVIORS)
const effectSource = z.enum(['any', 'inventory', 'equipment'])
const constraint = z.enum(['none', 'distinct', 'same'])

/** pt-BR para exibir; vazio é regra do domínio (`empty`, REQ-99/D-103). */
const effectText = z.string()

/** README 13.2: número fixo ou fórmula; "mín. N" é conferido no domínio. */
const quantity = z.union([
  z.number(),
  z.strictObject({
    base: z.enum(QUANTITY_BASES),
    multiplier: z.number(),
    minimum: z.number(),
  }),
])

/** Exigência de cartas da mão (custo `discardFromHand`, ativação `discardHandCards`). */
const handRequirementShape = {
  requirements: z.array(
    z.strictObject({ attribute: attributeOrAny, count: z.number() })
  ),
  excludeAttributes: z.array(attribute),
  constraint,
  random: z.boolean(),
}

const equipmentSelectionShape = {
  slots: z.array(equipmentSlot),
  excludeSlots: z.array(equipmentSlot),
  count: z.number(),
  random: z.boolean(),
}

const resourceOfferShape = {
  requirements: z.array(
    z.strictObject({ resource: z.string(), count: z.number() })
  ),
  constraint,
  exclude: z.array(z.string()),
}

const modifierComparisonShape = {
  left: z.array(modifier),
  op: comparison,
  right: z.array(modifier).nullable(),
  value: z.number().nullable(),
}

/** README 13.1. Nenhum gatilho é executado na FEAT-11. */
export const triggerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('onEnterThisZone') }),
  z.strictObject({
    kind: z.literal('onEnterZoneTitle'),
    zoneTitle: z.string(),
  }),
  z.strictObject({
    kind: z.literal('onEnterZoneFilter'),
    zoneTypes: z.array(zoneType),
    excludeZoneTypes: z.array(zoneType),
    locations: z.array(z.string()),
    excludeLocations: z.array(z.string()),
  }),
  z.strictObject({
    kind: z.literal('onZoneActionUsed'),
    action: zoneAction,
    times: z.number(),
    consecutive: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('onZoneActionSkipped'),
    action: zoneAction,
    zones: z.number(),
  }),
  z.strictObject({
    kind: z.literal('whileZoneActionCountBelow'),
    action: zoneAction,
    max: z.number(),
  }),
  z.strictObject({ kind: z.literal('onQuestCompleted') }),
  z.strictObject({ kind: z.literal('onZoneQuestsCompleted') }),
  z.strictObject({
    kind: z.literal('onQuestCountReached'),
    count: z.number(),
    perZone: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('onQuestAbandoned') }),
  z.strictObject({
    kind: z.literal('onEventPhase'),
    phases: z.array(eventPhase),
    exclude: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('onEnemyDefeated'),
    count: z.number(),
    distinct: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('onCombatFleeAttempt') }),
  z.strictObject({
    kind: z.literal('onAbilityUsed'),
    slots: z.array(equipmentSlot),
    excludeSlots: z.array(equipmentSlot),
    tags: z.array(z.string()),
    cardId: z.string().nullable(),
  }),
  z.strictObject({
    kind: z.literal('onResourceEffectActivated'),
    source: effectSource,
    count: z.number(),
    distinct: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('whileResourceActivationCountBelow'),
    max: z.number(),
    distinct: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('whileInventoryResourceCount'),
    count: z.number(),
    op: comparison,
    distinct: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('whileEffectUseCount'),
    source: effectSource,
    slots: z.array(equipmentSlot),
    excludeSlots: z.array(equipmentSlot),
    itemCategories: z.array(itemCategory),
    count: z.number(),
    op: comparison,
    distinct: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('whileClassIs'),
    classes: z.array(playerClass),
    mode: z.enum(['anyOf', 'allOf']),
  }),
  z.strictObject({
    kind: z.literal('whileSpecializationOf'),
    classes: z.array(playerClass),
  }),
  z.strictObject({
    kind: z.literal('whilePrimaryClassCount'),
    min: z.number(),
    max: z.number().nullable(),
  }),
  z.strictObject({
    kind: z.literal('whileSpecializationCount'),
    min: z.number(),
    max: z.number().nullable(),
  }),
  z.strictObject({
    kind: z.literal('whileHighestModifier'),
    modifiers: z.array(modifier),
  }),
  z.strictObject({
    kind: z.literal('whileLowestModifier'),
    modifiers: z.array(modifier),
  }),
  z.strictObject({
    kind: z.literal('whileModifierComparison'),
    ...modifierComparisonShape,
  }),
  z.strictObject({
    kind: z.literal('whileHandAttributeCount'),
    attributes: z.array(attribute),
    mode: z.enum(['each', 'any']),
    count: z.number(),
    op: comparison,
  }),
  z.strictObject({
    kind: z.literal('whileHandDistinctAttributes'),
    count: z.number(),
    op: comparison,
  }),
  z.strictObject({
    kind: z.literal('whileHandCount'),
    count: z.number(),
    op: comparison,
  }),
  z.strictObject({
    kind: z.literal('whileAttributeDiscardCount'),
    count: z.number(),
    op: comparison,
  }),
  z.strictObject({
    kind: z.literal('whileAttributeDeckCount'),
    count: z.number(),
    op: comparison,
  }),
  z.strictObject({
    kind: z.literal('whileHealth'),
    value: z.number(),
    op: comparison,
  }),
  z.strictObject({
    kind: z.literal('whileGold'),
    value: z.number(),
    op: comparison,
  }),
  z.strictObject({
    kind: z.literal('whileVigorRatio'),
    percent: z.number(),
    op: comparison,
  }),
  z.strictObject({ kind: z.literal('onVigorReached'), value: z.number() }),
  z.strictObject({
    kind: z.literal('whilePeak'),
    value: z.number(),
    op: comparison,
  }),
  z.strictObject({ kind: z.literal('onVigorSpent'), amount: z.number() }),
  z.strictObject({ kind: z.literal('onPeakLost') }),
  z.strictObject({ kind: z.literal('onElementAbilityUsed'), element }),
  z.strictObject({ kind: z.literal('onElementalAdvantageHit') }),
  z.strictObject({
    kind: z.literal('onElementDamageTaken'),
    element: element.nullable(),
  }),
  z.strictObject({ kind: z.literal('whileUsedAbilitiesSameElement') }),
  z.strictObject({ kind: z.literal('onEngageEnemyElement'), element }),
  z.strictObject({
    kind: z.literal('onEngageEnemyType'),
    enemyTypes: z.array(enemyType),
  }),
  z.strictObject({
    kind: z.literal('onEnemyCategoryDefeated'),
    category: enemyCategory,
  }),
  z.strictObject({
    kind: z.literal('whileEnemyCount'),
    count: z.number(),
    op: comparison,
  }),
  z.strictObject({
    kind: z.literal('onAttackedByEnemyBehavior'),
    behavior: enemyBehavior,
  }),
])

/** README 13.2 e 13 ("Usar um recurso"). */
export const costSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('consumeSelf') }),
  z.strictObject({
    kind: z.literal('discardFromHand'),
    ...handRequirementShape,
  }),
  z.strictObject({
    kind: z.literal('discardHandDownTo'),
    leave: z.number(),
    minimum: z.number(),
  }),
  z.strictObject({ kind: z.literal('discardWholeHand'), minimum: z.number() }),
  z.strictObject({ kind: z.literal('donateLife'), amount: quantity }),
  z.strictObject({ kind: z.literal('payGold'), amount: quantity }),
  z.strictObject({
    kind: z.literal('abandonEquipment'),
    ...equipmentSelectionShape,
  }),
  z.strictObject({ kind: z.literal('offerResources'), ...resourceOfferShape }),
  z.strictObject({
    kind: z.literal('manipulateAttributeCards'),
    mode: z.enum([
      'millTop',
      'millBottom',
      'reshuffleDiscard',
      'reshuffleHand',
      'handToTop',
      'handToBottom',
    ]),
    count: z.number(),
    minimum: z.number().nullable(),
  }),
  z.strictObject({ kind: z.literal('spendVigor'), amount: quantity }),
  z.strictObject({
    kind: z.literal('reducePeak'),
    amount: z.number().nullable(),
    percent: z.number().nullable(),
  }),
])

const amountOrWord = (word: 'halfHealth' | 'minusHandCount') =>
  z.union([z.number(), z.literal(word)])

const changesAmount = z.array(z.strictObject({ modifier, amount: z.number() }))
const changesPercent = z.array(
  z.strictObject({ modifier, percent: z.number() })
)

/** README 13.3 e 13.6. */
export const activationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('gainGold'), amount: z.number() }),
  z.strictObject({ kind: z.literal('loseGold'), amount: z.number() }),
  z.strictObject({ kind: z.literal('heal'), amount: z.number() }),
  z.strictObject({
    kind: z.literal('loseLife'),
    amount: amountOrWord('halfHealth'),
  }),
  z.strictObject({ kind: z.literal('gainPeak'), amount: z.number() }),
  z.strictObject({ kind: z.literal('restoreVigor'), amount: z.number() }),
  z.strictObject({ kind: z.literal('modifierFlat'), changes: changesAmount }),
  z.strictObject({
    kind: z.literal('modifierPercent'),
    changes: changesPercent,
  }),
  z.strictObject({
    kind: z.literal('zeroModifiers'),
    modifiers: z.array(modifier),
  }),
  z.strictObject({
    kind: z.literal('attributeValueMultiplier'),
    attribute,
    factor: z.number(),
  }),
  z.strictObject({ kind: z.literal('effectDamage'), amount: z.number() }),
  z.strictObject({
    kind: z.literal('enemyModifierFlat'),
    changes: changesAmount,
  }),
  z.strictObject({ kind: z.literal('gainBaseHealth'), amount: z.number() }),
  z.strictObject({ kind: z.literal('drawCards'), count: z.number() }),
  z.strictObject({
    kind: z.literal('discardHandCards'),
    ...handRequirementShape,
  }),
  z.strictObject({
    kind: z.literal('returnDiscardToDeckTop'),
    count: z.number(),
  }),
  z.strictObject({
    kind: z.literal('millDeck'),
    count: z.number(),
    from: z.enum(['top', 'bottom']),
  }),
  z.strictObject({
    kind: z.literal('searchAttribute'),
    attribute,
    count: z.number(),
    source: z.enum(['deck', 'discardPile']),
    shuffle: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('handToDeckTop'), count: z.number() }),
  z.strictObject({
    kind: z.literal('nullifyEffects'),
    target: z.enum(['equipment', 'item', 'attributeCard']),
    slots: z.array(equipmentSlot),
    itemCategories: z.array(itemCategory),
  }),
  z.strictObject({
    kind: z.literal('nullifyAbilities'),
    slots: z.array(equipmentSlot),
    tags: z.array(z.string()),
  }),
  z.strictObject({ kind: z.literal('keepPeakOnKnockout') }),
  z.strictObject({
    kind: z.literal('actionPointsOverride'),
    value: z.number(),
  }),
  z.strictObject({ kind: z.literal('actionPointsBonus'), amount: z.number() }),
  z.strictObject({ kind: z.literal('moveDistanceBonus'), zones: z.number() }),
  z.strictObject({
    kind: z.literal('recoverHealPercentOverride'),
    percent: z.number(),
  }),
  z.strictObject({ kind: z.literal('skipEventBackfire') }),
  z.strictObject({ kind: z.literal('handLimit'), max: z.number() }),
  z.strictObject({ kind: z.literal('fleeTargetOverride'), value: z.number() }),
  z.strictObject({
    kind: z.literal('fleeTargetModifier'),
    amount: amountOrWord('minusHandCount'),
  }),
  z.strictObject({
    kind: z.literal('marketShowcaseModifier'),
    mode: z.enum(['add', 'set']),
    value: z.number(),
  }),
  z.strictObject({ kind: z.literal('diceChooseResult') }),
  z.strictObject({
    kind: z.literal('diceResultModifier'),
    amount: amountOrWord('minusHandCount'),
  }),
  z.strictObject({
    kind: z.literal('breakEquipment'),
    slots: z.array(equipmentSlot),
  }),
  z.strictObject({
    kind: z.literal('abandonOwnEquipment'),
    ...equipmentSelectionShape,
  }),
  z.strictObject({
    kind: z.literal('repairEquipment'),
    target: z.enum(['self', 'allyInZone']),
  }),
  z.strictObject({
    kind: z.literal('offerResourcesAsEffect'),
    ...resourceOfferShape,
  }),
  z.strictObject({ kind: z.literal('changeNextAbilityElement'), element }),
  z.strictObject({ kind: z.literal('grantElementToAbility'), element }),
  z.strictObject({ kind: z.literal('removeEnemyElement') }),
  z.strictObject({ kind: z.literal('ignoreElementalDisadvantage') }),
  z.strictObject({
    kind: z.literal('elementalAdvantageOverride'),
    percent: z.number(),
  }),
  z.strictObject({ kind: z.literal('invertElementalRelations') }),
  z.strictObject({ kind: z.literal('elementResistance'), element }),
  z.strictObject({ kind: z.literal('elementImmunity'), element }),
  z.strictObject({ kind: z.literal('elementVulnerability'), element }),
  z.strictObject({
    kind: z.literal('elementVigorCostModifier'),
    element,
    percent: z.number(),
  }),
  z.strictObject({ kind: z.literal('defeatEnemy') }),
  z.strictObject({ kind: z.literal('extraAttack'), count: z.number() }),
  z.strictObject({ kind: z.literal('skipEnemyTurn'), count: z.number() }),
  z.strictObject({ kind: z.literal('swapCombatOrder') }),
  z.strictObject({
    kind: z.literal('reviveAlly'),
    healthPercent: z.number(),
  }),
  z.strictObject({ kind: z.literal('teleportToRespawn') }),
  z.strictObject({
    kind: z.literal('moveToZoneOfType'),
    zoneType: z.union([zoneType, z.literal('sameAsCurrent')]),
  }),
  z.strictObject({
    kind: z.literal('removeDebuffs'),
    target: z.enum(['self', 'allyInZone', 'enemy']),
  }),
  z.strictObject({
    kind: z.literal('removeBuffs'),
    target: z.enum(['self', 'allyInZone', 'enemy']),
  }),
])

/** README 13.4 e 13 (tabela). */
export const durationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('immediate') }),
  z.strictObject({ kind: z.literal('whileSourceActive') }),
  z.strictObject({ kind: z.literal('infinite') }),
  z.strictObject({ kind: z.literal('untilThisCardDiscarded') }),
  z.strictObject({ kind: z.literal('untilCardDiscarded'), cardId: z.string() }),
  z.strictObject({
    kind: z.literal('untilHandCount'),
    count: z.number(),
    op: comparison,
  }),
  z.strictObject({
    kind: z.literal('untilResourcesInLimbo'),
    count: z.number(),
  }),
  z.strictObject({ kind: z.literal('untilEndOfTurn') }),
  z.strictObject({ kind: z.literal('untilStartOfNextTurn') }),
  z.strictObject({ kind: z.literal('forOwnTurns'), turns: z.number() }),
  z.strictObject({ kind: z.literal('untilEndOfNextPlayerTurn') }),
  z.strictObject({ kind: z.literal('untilEndOfRound') }),
  z.strictObject({ kind: z.literal('forRounds'), rounds: z.number() }),
  z.strictObject({ kind: z.literal('untilStartOfNextRound') }),
  z.strictObject({ kind: z.literal('whileInThisZone') }),
  z.strictObject({ kind: z.literal('untilLeaveZone') }),
  z.strictObject({
    kind: z.literal('untilEnterZoneType'),
    zoneTypes: z.array(zoneType),
  }),
  z.strictObject({ kind: z.literal('forZonesPassed'), count: z.number() }),
  z.strictObject({ kind: z.literal('untilEventEnd') }),
  z.strictObject({ kind: z.literal('forEvents'), count: z.number() }),
  z.strictObject({ kind: z.literal('untilEventSuccess') }),
  z.strictObject({ kind: z.literal('untilEventFailure') }),
  z.strictObject({ kind: z.literal('untilNextCombatEnd') }),
  z.strictObject({ kind: z.literal('forCombats'), count: z.number() }),
  z.strictObject({ kind: z.literal('untilCombatWon') }),
  z.strictObject({ kind: z.literal('untilEventPhaseEnd'), phase: eventPhase }),
  z.strictObject({
    kind: z.literal('duringEventPhases'),
    phases: z.array(eventPhase),
  }),
  z.strictObject({
    kind: z.literal('untilZoneActionUsed'),
    action: zoneAction,
    count: z.number(),
  }),
  z.strictObject({ kind: z.literal('forZoneActions'), count: z.number() }),
  z.strictObject({ kind: z.literal('untilOwnCombatTurnEnd') }),
  z.strictObject({ kind: z.literal('forOwnCombatTurns'), turns: z.number() }),
  z.strictObject({ kind: z.literal('forCombatCycles'), cycles: z.number() }),
  z.strictObject({ kind: z.literal('untilDamageTaken') }),
  z.strictObject({ kind: z.literal('untilAttackMade') }),
  z.strictObject({ kind: z.literal('untilAttackMissed') }),
  z.strictObject({
    kind: z.literal('untilAbilityUsed'),
    element: element.nullable(),
  }),
  z.strictObject({ kind: z.literal('forAbilitiesUsed'), count: z.number() }),
  z.strictObject({ kind: z.literal('whileAbilityActive'), cardId: z.string() }),
  z.strictObject({ kind: z.literal('untilOtherResourceEffectActivated') }),
  z.strictObject({ kind: z.literal('untilAnyEffectNullified') }),
  z.strictObject({
    kind: z.literal('whileEffectActive'),
    cardId: z.string(),
    effectIndex: z.number(),
  }),
  z.strictObject({
    kind: z.literal('whileAttributeInHand'),
    attribute,
    count: z.number(),
  }),
  z.strictObject({
    kind: z.literal('untilAttributeDiscarded'),
    attribute,
  }),
  z.strictObject({
    kind: z.literal('untilAttributeInDiscard'),
    attribute,
    count: z.number(),
  }),
  z.strictObject({ kind: z.literal('untilKnockout') }),
  z.strictObject({
    kind: z.literal('whileHealthThreshold'),
    value: z.number(),
    op: comparison,
  }),
  z.strictObject({ kind: z.literal('untilHandEmpty') }),
  z.strictObject({ kind: z.literal('untilGoldSpent'), amount: z.number() }),
  z.strictObject({
    kind: z.literal('whileResourceInInventory'),
    cardId: z.string(),
  }),
  z.strictObject({ kind: z.literal('untilInventoryFull') }),
  z.strictObject({ kind: z.literal('untilResourceOffered') }),
  z.strictObject({
    kind: z.literal('whileHighestModifierIs'),
    modifiers: z.array(modifier),
  }),
  z.strictObject({ kind: z.literal('untilVigorBelow'), value: z.number() }),
  z.strictObject({
    kind: z.literal('whileModifierComparison'),
    ...modifierComparisonShape,
  }),
  z.strictObject({
    kind: z.literal('whileHasClass'),
    classes: z.array(playerClass),
  }),
  z.strictObject({ kind: z.literal('untilSpecializationGained') }),
  z.strictObject({ kind: z.literal('whileSinglePrimaryClass') }),
  z.strictObject({ kind: z.literal('untilPartyEnd') }),
  z.strictObject({ kind: z.literal('untilLeaveDimension') }),
])

const effectShape = {
  text: effectText,
  /** `null` = sem gatilho. */
  trigger: triggerSchema.nullable(),
  /** Vazio = sem custo. Pago na ordem. */
  cost: z.array(costSchema),
  /** Pelo menos 1 (regra do domínio, REQ-99). Aplicadas na ordem. */
  activation: z.array(activationSchema),
  duration: durationSchema,
}

/** README 13, 13.6: efeito de atributo aprimorado, equipamento e item. */
export const effectSchema = z.strictObject({
  ...effectShape,
  mark: effectMark.nullable(),
})

/** README 13.6: efeito de zona e de dimensão traz `polarity` no lugar de `mark`. */
export const zoneEffectSchema = z.strictObject({
  ...effectShape,
  polarity: zoneEffectPolarity,
})
