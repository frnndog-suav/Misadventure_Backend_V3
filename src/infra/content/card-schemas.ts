import { z } from 'zod'

import {
  ARROW_LAYOUTS,
  ATTRIBUTE_KINDS,
  ATTRIBUTES,
  ELEMENTS,
  ENEMY_BEHAVIORS,
  ENEMY_CATEGORIES,
  ENEMY_TYPES,
  EQUIPMENT_SLOTS,
  ITEM_CATEGORIES,
  MODIFIERS,
  PLAYER_CLASSES,
  RARITIES,
  ZONE_ACTIONS,
  ZONE_TYPES,
  type TCardType,
  type TModifier,
} from '@/domain/catalog/enterprise/value-objects/card'
import { CONTENT_STATUSES } from '@/domain/catalog/enterprise/value-objects/content'

import {
  costSchema,
  durationSchema,
  effectSchema,
  zoneEffectSchema,
} from './effect-schemas'

/**
 * Forma dos arquivos de `content/` (D-21). Cada `<tipo>.json` é um array de
 * cartas no formato do contrato **sem** `type` e `collectionId`, que vêm do
 * caminho (decisão do autor, 2026-11-14). Objetos estritos: campo
 * desconhecido é erro (pega erro de digitação). Faixas e regras entre campos
 * ficam em `checkCatalogIntegrity` (REQ-15, D-23). `status` (ausente =
 * `published`) e `description` (ausente = `""`) são opcionais (D-47).
 */

const text = z.string().min(1)
const flavorText = z.string().min(1).nullable()
const ruleText = z.strictObject({ text })
const ability = z.strictObject({ name: text, text })

const eventRequirementBase = { id: text, text }
export const eventRequirement = z.union([
  z.strictObject({
    ...eventRequirementBase,
    kind: z.literal('attributes'),
    specific: z.partialRecord(
      z.enum(ATTRIBUTES),
      z.number().int().nonnegative()
    ),
    any: z.number().int().nonnegative(),
  }),
  z.strictObject({
    ...eventRequirementBase,
    kind: z.literal('minimum'),
    stat: z.enum(['peak', 'vigor', ...MODIFIERS]),
    value: z.number().int().nonnegative(),
  }),
  ...costSchema.options
    .filter(
      (option) =>
        option.shape.kind.value !== 'consumeSelf' &&
        option.shape.kind.value !== 'reducePeak'
    )
    .map((option) => option.extend(eventRequirementBase)),
])
const eventEffect = effectSchema.omit({ trigger: true, cost: true }).extend({
  duration: z.union([
    durationSchema,
    z.strictObject({ kind: z.enum(['untilEventPhaseEnd', 'untilEventEnd']) }),
  ]),
})
export const eventOutcome = z.strictObject({
  text,
  steps: z
    .discriminatedUnion('type', [
      z.strictObject({ type: z.literal('effect'), effect: eventEffect }),
      z.strictObject({
        type: z.literal('drawRewards'),
        count: z.number().int().positive(),
      }),
      z.strictObject({ type: z.literal('searchReward'), cardId: text }),
      z.strictObject({
        type: z.literal('grantReward'),
        cardId: text,
        copies: z.number().int().positive(),
      }),
    ])
    .array(),
})
const zoneDeck = z.strictObject({
  zoneType: z.enum(ZONE_TYPES),
  cards: z.array(z.strictObject({ cardId: text, copies: z.number() })),
})

const enemyModifiers = z.strictObject(
  Object.fromEntries(MODIFIERS.map((modifier) => [modifier, z.number()])) as {
    [K in TModifier]: z.ZodNumber
  }
)

const enemy = z.strictObject({
  name: text,
  flavorText,
  count: z.number(),
  enemyTypes: z.array(z.enum(ENEMY_TYPES)),
  creature: text,
  enemyCategory: z.enum(ENEMY_CATEGORIES),
  element: z.enum(ELEMENTS).nullable(),
  health: z.number(),
  modifiers: enemyModifiers,
  vigor: z.number().nullable(),
  abilities: z.array(ability),
  behavior: z.enum(ENEMY_BEHAVIORS),
})

const id = text

const cardSchemas = {
  zone: z.strictObject({
    id,
    title: text,
    zoneType: z.enum(ZONE_TYPES),
    location: text,
    connectionArrows: z.number(),
    arrowLayout: z.enum(ARROW_LAYOUTS).nullable(),
    zoneActions: z.array(z.enum(ZONE_ACTIONS)),
    effects: z.array(zoneEffectSchema),
  }),
  attribute: z.strictObject({
    id,
    name: text,
    flavorText,
    rarity: z.enum(RARITIES),
    attributeKind: z.enum(ATTRIBUTE_KINDS),
    attributes: z.array(z.enum(ATTRIBUTES)),
    effects: z.array(effectSchema),
  }),
  equipment: z.strictObject({
    id,
    name: text,
    flavorText,
    rarity: z.enum(RARITIES),
    slot: z.enum(EQUIPMENT_SLOTS),
    tags: z.array(text),
    modifiers: z.array(
      z.strictObject({ modifier: z.enum(MODIFIERS), value: z.number() })
    ),
    peakRequirement: z.number().nullable(),
    classRestriction: z.array(z.enum(PLAYER_CLASSES)),
    blocksShield: z.boolean(),
    abilities: z.array(ability),
    effects: z.array(effectSchema),
    refinement: z
      .strictObject({ maxLevel: z.number(), materials: ruleText })
      .nullable(),
    enchantment: ruleText.nullable(),
    priceMultiplier: z.number(),
    scavengeTool: text.nullable(),
  }),
  item: z.strictObject({
    id,
    name: text,
    flavorText,
    rarity: z.enum(RARITIES),
    itemCategory: z.enum(ITEM_CATEGORIES),
    tags: z.array(text),
    effects: z.array(effectSchema),
    toolKind: text.nullable(),
    scavengeZoneTypes: z.array(z.enum(ZONE_TYPES)),
    scavengeTool: text.nullable(),
  }),
  randomEvent: z.strictObject({
    id,
    title: text,
    flavorText,
    requirements: z.array(z.union([ruleText, eventRequirement])),
    goodOutcome: z.union([ruleText, eventOutcome]),
    badOutcome: z.union([ruleText, eventOutcome]),
    escapeThreshold: z.number().int().nonnegative().nullable().optional(),
    noEscape: z.boolean(),
  }),
  combatEvent: z.strictObject({
    id,
    title: text,
    flavorText,
    enemies: z.array(enemy),
    goodOutcome: ruleText,
    badOutcome: ruleText,
    noEscape: z.boolean(),
  }),
  dimension: z.strictObject({
    id,
    name: text,
    flavorText,
    releaseOrder: z.number(),
    arrivalZoneTitle: text.nullable(),
    effects: z.array(zoneEffectSchema),
    rewardDecks: z.array(zoneDeck),
    eventDecks: z.array(zoneDeck).optional(),
  }),
} satisfies Record<TCardType, z.ZodType>

const status = z.enum(CONTENT_STATUSES).optional()

/** Uma carta do `<tipo>.json`. */
export const cardFileSchemas = {
  zone: cardSchemas.zone.extend({ status }),
  attribute: cardSchemas.attribute.extend({ status }),
  equipment: cardSchemas.equipment.extend({ status }),
  item: cardSchemas.item.extend({ status }),
  randomEvent: cardSchemas.randomEvent.extend({ status }),
  combatEvent: cardSchemas.combatEvent.extend({ status }),
  dimension: cardSchemas.dimension.extend({ status }),
} satisfies Record<TCardType, z.ZodType>

function inputKeys<T extends TCardType>(type: T) {
  return { type: z.literal(type), slug: z.string() }
}

/**
 * `CardInput` do editor (CONTRATO FEAT-31): o `Card` sem `id` e
 * `collectionId`, com `type` e `slug`. O `kebab-case` do slug é regra do
 * domínio (REQ-43).
 */
export const cardInputSchema = z.discriminatedUnion('type', [
  cardSchemas.zone.omit({ id: true }).extend(inputKeys('zone')),
  cardSchemas.attribute.omit({ id: true }).extend(inputKeys('attribute')),
  cardSchemas.equipment.omit({ id: true }).extend(inputKeys('equipment')),
  cardSchemas.item.omit({ id: true }).extend(inputKeys('item')),
  cardSchemas.randomEvent.omit({ id: true }).extend(inputKeys('randomEvent')),
  cardSchemas.combatEvent.omit({ id: true }).extend(inputKeys('combatEvent')),
  cardSchemas.dimension.omit({ id: true }).extend(inputKeys('dimension')),
])

/**
 * Uma classe do `class.json` (D-40): sem `collectionId` (vem do caminho),
 * `status` opcional como nas cartas (D-47). Faixas, unicidade, deck e trava
 * ficam em `checkCatalogIntegrity` (REQ-26).
 */
/** `ClassInput` do editor (CONTRATO FEAT-06): a classe sem `collectionId`. */
export const classInputSchema = z.strictObject({
  playerClass: z.enum(PLAYER_CLASSES),
  name: text,
  essentialAttributes: z.array(z.enum(ATTRIBUTES)),
  baseModifiers: enemyModifiers,
  starterDeck: z.array(z.strictObject({ cardId: text, copies: z.number() })),
})

export const classFileSchema = classInputSchema.extend({ status })

export const collectionFileSchema = z.strictObject({
  name: text,
  description: z.string().optional(),
})
