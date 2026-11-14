import { z } from 'zod'

import {
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
  ZONE_EFFECT_POLARITIES,
  ZONE_TYPES,
  type TCardType,
  type TModifier,
} from '@/domain/catalog/enterprise/value-objects/card'

/**
 * Forma dos arquivos de `content/` (D-21). Cada `<tipo>.json` é um array de
 * cartas no formato do contrato **sem** `type` e `collectionId`, que vêm do
 * caminho (decisão do autor, 2026-11-14). Objetos estritos: campo
 * desconhecido é erro (pega erro de digitação). Faixas e regras entre campos
 * ficam em `checkCatalogIntegrity` (REQ-15, D-23).
 */

const text = z.string().min(1)
const flavorText = z.string().min(1).nullable()
const ruleText = z.strictObject({ text })
const ability = z.strictObject({ name: text, text })

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

export const cardFileSchemas = {
  zone: z.strictObject({
    id,
    title: text,
    zoneType: z.enum(ZONE_TYPES),
    location: text,
    connectionArrows: z.number(),
    zoneActions: z.array(z.enum(ZONE_ACTIONS)),
    effects: z.array(
      z.strictObject({ text, polarity: z.enum(ZONE_EFFECT_POLARITIES) })
    ),
  }),
  attribute: z.strictObject({
    id,
    name: text,
    flavorText,
    rarity: z.enum(RARITIES),
    attributeKind: z.enum(ATTRIBUTE_KINDS),
    attributes: z.array(z.enum(ATTRIBUTES)),
    effects: z.array(ruleText),
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
    effects: z.array(ruleText),
    refinement: z
      .strictObject({ maxLevel: z.number(), materials: ruleText })
      .nullable(),
    enchantment: ruleText.nullable(),
    priceMultiplier: z.number(),
  }),
  item: z.strictObject({
    id,
    name: text,
    flavorText,
    rarity: z.enum(RARITIES),
    itemCategory: z.enum(ITEM_CATEGORIES),
    tags: z.array(text),
    effects: z.array(ruleText),
  }),
  randomEvent: z.strictObject({
    id,
    title: text,
    flavorText,
    requirements: z.array(ruleText),
    goodOutcome: ruleText,
    badOutcome: ruleText,
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
} satisfies Record<TCardType, z.ZodType>

export const collectionFileSchema = z.strictObject({ name: text })
