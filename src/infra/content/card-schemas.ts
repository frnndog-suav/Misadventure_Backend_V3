import { z } from 'zod'

import {
  ABILITY_FORMS,
  ABILITY_RELEASE_FORMS,
  ARROW_LAYOUTS,
  ATTRIBUTE_KINDS,
  ATTRIBUTES,
  ELEMENTS,
  ENCHANTMENT_KINDS,
  ENEMY_ABILITY_PRIORITIES,
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
const legacyAbility = z.strictObject({ name: text, text })
const executableAbility = legacyAbility.extend({
  id: text,
  form: z.enum(ABILITY_FORMS),
  element: z.enum(ELEMENTS).nullable(),
  cost: z.array(costSchema),
  power: z.number().int().nonnegative().nullable(),
  effects: z.array(effectSchema),
  cooldown: z.number().int().nonnegative(),
  timing: z.enum(['combat', 'outsideCombat', 'both']),
  classRestriction: z.array(z.enum(PLAYER_CLASSES)),
  usesPerTurn: z.number().int().positive(),
  target: z.enum(['self', 'opponent', 'ally', 'allOpponents']),
  duration: durationSchema.nullable(),
  channel: z
    .strictObject({
      chargesRequired: z.number().int().positive(),
      releaseForm: z.enum(ABILITY_RELEASE_FORMS),
    })
    .nullable(),
})
const ability = z.unknown().transform((value, ctx) => {
  const schema =
    typeof value === 'object' && value !== null && Object.hasOwn(value, 'id')
      ? executableAbility
      : legacyAbility
  const result = schema.safeParse(value)
  if (result.success) return result.data
  for (const issue of result.error.issues)
    ctx.issues.push({ ...issue, input: undefined })
  return z.NEVER
})

/** D-129: material e quantidade (a faixa fica na integridade). */
const materialRequirement = z.strictObject({
  cardId: text,
  quantity: z.number(),
})
/** Conteúdo legado: materiais em texto viram lista vazia (REQ-145). */
const refinementMaterials = z.union([
  z.array(materialRequirement),
  ruleText.transform(() => []),
])
/** Conteúdo legado: encantamento em texto vira null (REQ-145). */
const equipmentEnchantment = z.union([
  z.strictObject({
    slots: z.array(
      z.strictObject({
        kind: z.enum(ENCHANTMENT_KINDS),
        minRefinement: z.number(),
      })
    ),
  }),
  ruleText.transform(() => null),
])
const blacksmithEnchantmentBase = {
  id: text,
  name: text,
  materials: z.array(materialRequirement),
}
export const blacksmithEnchantment = z.discriminatedUnion('kind', [
  z.strictObject({
    ...blacksmithEnchantmentBase,
    kind: z.literal('element'),
    element: z.enum(ELEMENTS),
    bonusPercent: z.number(),
  }),
  z.strictObject({
    ...blacksmithEnchantmentBase,
    kind: z.literal('effect'),
    effects: z.array(effectSchema),
    abilities: z.array(ability),
  }),
])

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
  combatRules: z
    .strictObject({
      abilityUsesPerTurn: z.number().int().positive().optional(),
      abilityPriority: z.array(z.enum(ENEMY_ABILITY_PRIORITIES)).optional(),
      preferredAbilityIds: z.array(text).optional(),
    })
    .optional(),
})

const combatFields = {
  enemies: z.array(enemy),
  escapeThreshold: z.number().int().min(0).max(20).nullable().optional(),
  noEscape: z.boolean(),
}

const questLocation = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('zoneType'), zoneType: z.enum(ZONE_TYPES) }),
  z.strictObject({ type: z.literal('zoneTitle'), title: text }),
])
const questStageFields = { location: questLocation, text }
const questStage = z.discriminatedUnion('type', [
  z.strictObject({ ...questStageFields, type: z.literal('interaction') }),
  z.strictObject({
    ...questStageFields,
    type: z.literal('objectives'),
    randomEventSuccesses: z.number().int().nonnegative(),
    combatVictories: z.number().int().nonnegative(),
  }),
  z.strictObject({
    ...questStageFields,
    type: z.literal('randomEvent'),
    eventCardId: text,
  }),
  z.strictObject({
    ...questStageFields,
    type: z.literal('combatEvent'),
    combat: z.strictObject({
      ...combatFields,
      goodOutcome: eventOutcome,
      badOutcome: eventOutcome,
    }),
  }),
])

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
    questDeck: z.array(text).default([]),
    effects: z.array(zoneEffectSchema),
    market: z
      .strictObject({
        stock: z.array(text),
        singles: z.boolean(),
        // REQ-155: conteúdo legado sem Estábulo lê `[]`.
        mounts: z.array(text).default([]),
      })
      .nullable()
      .default(null),
    blacksmith: z
      .strictObject({ enchantments: z.array(blacksmithEnchantment) })
      .nullable()
      .default(null),
  }),
  attribute: z.strictObject({
    id,
    name: text,
    flavorText,
    rarity: z.enum(RARITIES),
    attributeKind: z.enum(ATTRIBUTE_KINDS),
    attributes: z.array(z.enum(ATTRIBUTES)),
    effects: z.array(effectSchema),
    priceMultiplier: z.number().default(1),
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
      .strictObject({ maxLevel: z.number(), materials: refinementMaterials })
      .nullable(),
    enchantment: equipmentEnchantment.nullable(),
    priceMultiplier: z.number(),
    scavengeTool: text.nullable(),
  }),
  item: z.strictObject({
    id,
    name: text,
    flavorText,
    rarity: z.enum(RARITIES),
    itemCategory: z.enum(ITEM_CATEGORIES),
    completionItem: z.boolean().default(false),
    tags: z.array(text),
    effects: z.array(effectSchema),
    toolKind: text.nullable(),
    scavengeZoneTypes: z.array(z.enum(ZONE_TYPES)),
    scavengeTool: text.nullable(),
    priceMultiplier: z.number().default(1),
    stockPrice: z.number().nullable().default(null),
    stockQuantity: z.number().default(1),
    boosterCollectionId: text.nullable().default(null),
    recipe: z
      .strictObject({
        equipmentId: text,
        materials: z.array(materialRequirement),
        gold: z.number(),
        consumed: z.boolean(),
      })
      .nullable()
      .default(null),
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
    ...combatFields,
    goodOutcome: z.union([ruleText, eventOutcome]),
    badOutcome: z.union([ruleText, eventOutcome]),
  }),
  zoneQuest: z.strictObject({
    id,
    title: text,
    summary: text,
    stages: z.array(questStage).min(1),
    rewards: eventOutcome.shape.steps,
  }),
  dimension: z.strictObject({
    id,
    name: text,
    flavorText,
    releaseOrder: z.number(),
    arrivalZoneTitle: text.nullable(),
    completion: z
      .strictObject({
        zoneTitle: text,
        requirement: z.array(
          z.strictObject({ cardId: text, count: z.number() })
        ),
        grandPrize: z.strictObject({
          cards: z.array(z.strictObject({ cardId: text, copies: z.number() })),
          gold: z.number(),
        }),
        finalBoss: z
          .strictObject({ title: text, flavorText, ...combatFields })
          .nullable(),
      })
      .nullable()
      .default(null),
    effects: z.array(zoneEffectSchema),
    rewardDecks: z.array(zoneDeck),
    eventDecks: z.array(zoneDeck).optional(),
  }),
  // REQ-155: tipos e criatura vazios são conferidos na integridade (mensagem própria).
  mount: z.strictObject({
    id,
    name: text,
    flavorText,
    rarity: z.enum(RARITIES),
    mountTypes: z.array(z.enum(ENEMY_TYPES)),
    creature: z.string(),
    effects: z.array(effectSchema),
    abilities: z.array(ability),
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
  zoneQuest: cardSchemas.zoneQuest.extend({ status }),
  dimension: cardSchemas.dimension.extend({ status }),
  mount: cardSchemas.mount.extend({ status }),
} satisfies Record<TCardType, z.ZodType>

/**
 * REQ-145: zona legada com `visitBlacksmith` e sem o campo `blacksmith` é
 * lida com a lista vazia (só a ausência; `null` explícito continua inválido).
 */
export function withLegacyBlacksmith(raw: unknown): unknown {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    Object.hasOwn(raw, 'blacksmith')
  ) {
    return raw
  }
  const zoneActions: unknown = (raw as Record<string, unknown>).zoneActions
  return Array.isArray(zoneActions) && zoneActions.includes('visitBlacksmith')
    ? { ...raw, blacksmith: { enchantments: [] } }
    : raw
}

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
  cardSchemas.zoneQuest.omit({ id: true }).extend(inputKeys('zoneQuest')),
  cardSchemas.dimension.omit({ id: true }).extend(inputKeys('dimension')),
  cardSchemas.mount.omit({ id: true }).extend(inputKeys('mount')),
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
  specializations: z
    .array(
      z.strictObject({
        id: text,
        name: text,
        additionalAttributes: z.array(z.enum(ATTRIBUTES)).max(2),
        reinforcedAttributes: z.array(z.enum(ATTRIBUTES)),
        effects: z.array(effectSchema),
      })
    )
    .default([]),
})

export const classFileSchema = classInputSchema.extend({ status })

export const collectionFileSchema = z.strictObject({
  name: text,
  description: z.string().optional(),
})
