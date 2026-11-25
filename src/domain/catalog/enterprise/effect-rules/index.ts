import {
  ITEM_CATEGORIES,
  type TExecutableAbility,
  type TAttributeCard,
  type TDimensionCard,
  type TMountCard,
  type TEquipmentCard,
  type TItemCard,
  type TSpecializationDefinition,
  type TZoneCard,
  EQUIPMENT_SLOTS,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TActivationKind,
  TCostKind,
  TDurationKind,
  TTriggerKind,
} from '@/domain/catalog/enterprise/value-objects/effect'

/**
 * Regras do efeito no conteúdo (REQ-99, README 13). Uma tabela por união,
 * tipada por `Record<kind, Rule>`: variação nova no tipo sem regra aqui não
 * compila (princípio 10). Faixas vêm de `docs/EFEITOS-CATALOGO.md`.
 */

export type TEffectIssueReason =
  | 'unknownEffectKind'
  | 'exactlyOneRequired'
  | 'filterRequired'
  | 'markNotAllowed'
  | 'markRequired'
  | 'consumableNeedsConsumeSelf'
  | 'consumeSelfOnlyInItem'
  | 'citationNotAllowed'
  // só ao publicar (D-91)
  | 'citedCardNotFound'
  | 'citedZoneNotFound'
  // reaproveitados da integridade
  | 'outOfRange'
  | 'duplicateValue'
  | 'empty'

export type TEffectReport = (field: string, reason: TEffectIssueReason) => void

export type TEffectCard =
  | TZoneCard
  | TAttributeCard
  | TEquipmentCard
  | TItemCard
  | TDimensionCard
  | TMountCard

type TEffectSource =
  | TEffectCard
  | ({ type: 'specialization' } & Pick<TSpecializationDefinition, 'effects'>)

/** Inteiro de `min` a `max` (sem `max` = sem teto). */
type Range = readonly [min: number, max?: number]

type Rule = Readonly<{
  /** Inteiros obrigatórios. */
  ints?: Record<string, Range>
  /** Inteiro ou `null`. */
  nullInts?: Record<string, Range>
  /** Inteiro na faixa ou uma palavra fixa (`'halfHealth'`). */
  intsOrWord?: Record<string, readonly [Range, string]>
  /** Tamanho da lista na faixa, sem repetição. */
  lists?: Record<string, Range>
  /** Campos `Quantity` (número ≥ 0 ou fórmula). */
  quantity?: readonly string[]
  /** Campo `changes` (1 a 7 pares modificador/valor); o valor tem esse nome. */
  changes?: string
  /** Exigência de cartas da mão (README 13.2). */
  hand?: true
  /** Oferta de recursos (README 13.2, 13.3). */
  offer?: true
  /** Comparação de modificadores (`left`, `op`, `right`/`value`). */
  modifierComparison?: true
  /** Exatamente um destes dois campos não é nulo. */
  exactlyOne?: readonly [string, string]
  /** Pelo menos um destes campos vem preenchido. */
  anyOf?: readonly string[]
  /** Listas de etiquetas (`tag` não vazia). */
  tagLists?: readonly string[]
  /** Campos com id de carta citada (ou `null`). */
  cardRefs?: readonly string[]
  /** Campos com título de zona citado. */
  zoneRefs?: readonly string[]
}>

const GE0: Range = [0]
const GE1: Range = [1]
const SLOTS: Range = [0, EQUIPMENT_SLOTS.length]
const CATEGORIES: Range = [0, ITEM_CATEGORIES.length]
const MODS: Range = [1, 7]
const PHASES: Range = [1, 4]
const CLASSES: Range = [1, 12]
const ZONE_TYPES_1: Range = [1, 16]
const ZONE_TYPES_0: Range = [0, 16]
const ANY_INT: Range = [-Infinity]
const NONE: Rule = {}
const countOf = (range: Range): Rule => ({ ints: { count: range } })

const TRIGGERS: Record<TTriggerKind, Rule> = {
  onEnterThisZone: NONE,
  onEnterZoneTitle: { zoneRefs: ['zoneTitle'] },
  onEnterZoneFilter: {
    lists: {
      zoneTypes: ZONE_TYPES_0,
      excludeZoneTypes: ZONE_TYPES_0,
      locations: GE0,
      excludeLocations: GE0,
    },
    anyOf: ['zoneTypes', 'excludeZoneTypes', 'locations', 'excludeLocations'],
  },
  onZoneActionUsed: { ints: { times: GE1 } },
  onZoneActionSkipped: { ints: { zones: GE1 } },
  whileZoneActionCountBelow: { ints: { max: GE0 } },
  onQuestCompleted: NONE,
  onZoneQuestsCompleted: NONE,
  onQuestCountReached: countOf(GE1),
  onQuestAbandoned: NONE,
  onEventPhase: { lists: { phases: PHASES } },
  onEnemyDefeated: countOf(GE1),
  onCombatFleeAttempt: NONE,
  onAbilityUsed: {
    lists: { slots: SLOTS, excludeSlots: SLOTS, tags: GE0 },
    anyOf: ['slots', 'excludeSlots', 'tags', 'cardId'],
    tagLists: ['tags'],
    cardRefs: ['cardId'],
  },
  onResourceEffectActivated: countOf(GE1),
  whileResourceActivationCountBelow: { ints: { max: GE0 } },
  whileInventoryResourceCount: countOf(GE0),
  whileEffectUseCount: {
    lists: { slots: SLOTS, excludeSlots: SLOTS, itemCategories: CATEGORIES },
    ints: { count: GE0 },
  },
  whileClassIs: { lists: { classes: CLASSES } },
  whileSpecializationOf: { lists: { classes: CLASSES } },
  whilePrimaryClassCount: { ints: { min: GE1 }, nullInts: { max: GE1 } },
  whileSpecializationCount: { ints: { min: GE1 }, nullInts: { max: GE1 } },
  whileHighestModifier: { lists: { modifiers: MODS } },
  whileLowestModifier: { lists: { modifiers: MODS } },
  whileModifierComparison: { modifierComparison: true },
  whileHandAttributeCount: {
    lists: { attributes: [1, 9] },
    ints: { count: GE1 },
  },
  whileHandDistinctAttributes: countOf(GE1),
  whileHandCount: countOf(GE0),
  whileAttributeDiscardCount: countOf(GE0),
  whileAttributeDeckCount: countOf(GE0),
  whileHealth: { ints: { value: GE0 } },
  whileGold: { ints: { value: GE0 } },
  whileVigorRatio: { ints: { percent: [0, 100] } },
  onVigorReached: { ints: { value: GE0 } },
  whilePeak: { ints: { value: GE0 } },
  onVigorSpent: { ints: { amount: GE1 } },
  onPeakLost: NONE,
  onElementAbilityUsed: NONE,
  onElementalAdvantageHit: NONE,
  onElementDamageTaken: NONE,
  whileUsedAbilitiesSameElement: NONE,
  onEngageEnemyElement: NONE,
  onEngageEnemyType: { lists: { enemyTypes: [1, 11] } },
  onEnemyCategoryDefeated: NONE,
  whileEnemyCount: countOf(GE1),
  onAttackedByEnemyBehavior: NONE,
}

const COSTS: Record<TCostKind, Rule> = {
  consumeSelf: NONE,
  discardFromHand: { hand: true },
  discardHandDownTo: { ints: { leave: GE0, minimum: GE1 } },
  discardWholeHand: { ints: { minimum: GE1 } },
  donateLife: { quantity: ['amount'] },
  payGold: { quantity: ['amount'] },
  abandonEquipment: {
    lists: { slots: SLOTS, excludeSlots: SLOTS },
    ints: { count: [1, 8] },
  },
  offerResources: { offer: true },
  manipulateAttributeCards: {
    ints: { count: GE1 },
    nullInts: { minimum: GE0 },
  },
  spendVigor: { quantity: ['amount'] },
  reducePeak: {
    nullInts: { amount: GE1, percent: [1, 100] },
    exactlyOne: ['amount', 'percent'],
  },
}

const AMOUNT: Rule = { ints: { amount: GE1 } }

const ACTIVATIONS: Record<TActivationKind, Rule> = {
  gainGold: AMOUNT,
  loseGold: AMOUNT,
  heal: AMOUNT,
  loseLife: { intsOrWord: { amount: [GE1, 'halfHealth'] } },
  gainPeak: AMOUNT,
  restoreVigor: AMOUNT,
  modifierFlat: { changes: 'amount' },
  modifierPercent: { changes: 'percent' },
  zeroModifiers: { lists: { modifiers: MODS } },
  attributeValueMultiplier: { ints: { factor: [2] } },
  effectDamage: AMOUNT,
  enemyModifierFlat: { changes: 'amount' },
  gainBaseHealth: AMOUNT,
  drawCards: countOf(GE1),
  discardHandCards: { hand: true },
  returnDiscardToDeckTop: countOf(GE1),
  millDeck: countOf(GE1),
  searchAttribute: countOf(GE1),
  handToDeckTop: countOf(GE1),
  nullifyEffects: { lists: { slots: SLOTS, itemCategories: CATEGORIES } },
  nullifyAbilities: {
    lists: { slots: SLOTS, tags: GE0 },
    anyOf: ['slots', 'tags'],
    tagLists: ['tags'],
  },
  keepPeakOnKnockout: NONE,
  actionPointsOverride: { ints: { value: GE1 } },
  actionPointsBonus: AMOUNT,
  moveDistanceBonus: { ints: { zones: [2] } },
  recoverHealPercentOverride: { ints: { percent: [1, 100] } },
  skipEventBackfire: NONE,
  handLimit: { ints: { max: GE0 } },
  fleeTargetOverride: { ints: { value: GE1 } },
  fleeTargetModifier: { intsOrWord: { amount: [ANY_INT, 'minusHandCount'] } },
  marketShowcaseModifier: { ints: { value: GE0 } },
  diceChooseResult: NONE,
  diceResultModifier: { intsOrWord: { amount: [ANY_INT, 'minusHandCount'] } },
  breakEquipment: { lists: { slots: SLOTS } },
  abandonOwnEquipment: {
    lists: { slots: SLOTS, excludeSlots: SLOTS },
    ints: { count: [1, 8] },
  },
  repairEquipment: NONE,
  offerResourcesAsEffect: { offer: true },
  changeNextAbilityElement: NONE,
  grantElementToAbility: NONE,
  removeEnemyElement: NONE,
  ignoreElementalDisadvantage: NONE,
  elementalAdvantageOverride: { ints: { percent: GE0 } },
  invertElementalRelations: NONE,
  elementResistance: NONE,
  elementImmunity: NONE,
  elementVulnerability: NONE,
  elementVigorCostModifier: { ints: { percent: ANY_INT } },
  defeatEnemy: NONE,
  extraAttack: countOf(GE1),
  skipEnemyTurn: countOf(GE1),
  swapCombatOrder: NONE,
  reviveAlly: { ints: { healthPercent: [1, 100] } },
  teleportToRespawn: NONE,
  loseMount: NONE,
  moveToZoneOfType: NONE,
  removeDebuffs: NONE,
  removeBuffs: NONE,
}

const DURATIONS: Record<TDurationKind, Rule> = {
  immediate: NONE,
  whileSourceActive: NONE,
  infinite: NONE,
  untilThisCardDiscarded: NONE,
  untilCardDiscarded: { cardRefs: ['cardId'] },
  untilHandCount: countOf(GE0),
  untilResourcesInLimbo: countOf(GE1),
  untilEndOfTurn: NONE,
  untilStartOfNextTurn: NONE,
  forOwnTurns: { ints: { turns: GE1 } },
  untilEndOfNextPlayerTurn: NONE,
  untilEndOfRound: NONE,
  forRounds: { ints: { rounds: GE1 } },
  untilStartOfNextRound: NONE,
  whileInThisZone: NONE,
  untilLeaveZone: NONE,
  untilEnterZoneType: { lists: { zoneTypes: ZONE_TYPES_1 } },
  forZonesPassed: countOf(GE1),
  untilEventEnd: NONE,
  forEvents: countOf(GE1),
  untilEventSuccess: NONE,
  untilEventFailure: NONE,
  untilNextCombatEnd: NONE,
  forCombats: countOf(GE1),
  untilCombatWon: NONE,
  untilEventPhaseEnd: NONE,
  duringEventPhases: { lists: { phases: PHASES } },
  untilZoneActionUsed: countOf(GE1),
  forZoneActions: countOf(GE1),
  untilOwnCombatTurnEnd: NONE,
  forOwnCombatTurns: { ints: { turns: GE1 } },
  forCombatCycles: { ints: { cycles: GE1 } },
  untilDamageTaken: NONE,
  untilAttackMade: NONE,
  untilAttackMissed: NONE,
  untilAbilityUsed: NONE,
  forAbilitiesUsed: countOf(GE1),
  whileAbilityActive: { cardRefs: ['cardId'] },
  untilOtherResourceEffectActivated: NONE,
  untilAnyEffectNullified: NONE,
  whileEffectActive: { cardRefs: ['cardId'], ints: { effectIndex: GE0 } },
  whileAttributeInHand: countOf(GE1),
  untilAttributeDiscarded: NONE,
  untilAttributeInDiscard: countOf(GE1),
  untilKnockout: NONE,
  whileHealthThreshold: { ints: { value: GE0 } },
  untilHandEmpty: NONE,
  untilGoldSpent: AMOUNT,
  whileResourceInInventory: { cardRefs: ['cardId'] },
  untilInventoryFull: NONE,
  untilResourceOffered: NONE,
  whileHighestModifierIs: { lists: { modifiers: MODS } },
  untilVigorBelow: { ints: { value: GE0 } },
  whileModifierComparison: { modifierComparison: true },
  whileHasClass: { lists: { classes: CLASSES } },
  untilSpecializationGained: NONE,
  whileSinglePrimaryClass: NONE,
  untilPartyEnd: NONE,
  untilLeaveDimension: NONE,
}

/** Os `kind` de cada união, na ordem trigger, cost, activation, duration. */
export const EFFECT_KINDS = {
  trigger: Object.keys(TRIGGERS),
  cost: Object.keys(COSTS),
  activation: Object.keys(ACTIVATIONS),
  duration: Object.keys(DURATIONS),
} as const

type Rec = Readonly<Record<string, unknown>>

function isRec(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inRange(value: unknown, [min, max = Infinity]: Range): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  )
}

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

/** README 13 ("O que um efeito pode citar"): `tag:<texto>` com texto. */
function isTagCitation(value: string): boolean {
  return value.startsWith('tag:') && value.slice(4).trim() !== ''
}

const RESOURCE_CITATIONS: readonly string[] = [
  'item',
  'equipment',
  'any',
  ...ITEM_CATEGORIES,
]
const EXCLUDE_CITATIONS: readonly string[] = [
  'item',
  'equipment',
  ...ITEM_CATEGORIES,
  ...EQUIPMENT_SLOTS,
]

function checkCitation(
  value: unknown,
  allowed: readonly string[],
  path: string,
  report: TEffectReport
): void {
  if (typeof value !== 'string') {
    report(path, 'citationNotAllowed')
  } else if (!allowed.includes(value) && !isTagCitation(value)) {
    report(path, 'citationNotAllowed')
  }
}

function checkList(
  value: unknown,
  range: Range,
  path: string,
  report: TEffectReport
): value is readonly unknown[] {
  if (!Array.isArray(value) || !inRange(value.length, range)) {
    report(path, 'outOfRange')
    return false
  }
  if (new Set(value).size !== value.length) report(path, 'duplicateValue')
  return true
}

function checkHand(node: Rec, path: string, report: TEffectReport): void {
  const requirements = node.requirements
  if (checkListLoose(requirements, [1, 9], `${path}.requirements`, report)) {
    requirements.forEach((entry, index) => {
      if (!isRec(entry) || !inRange(entry.count, GE1)) {
        report(`${path}.requirements[${index}].count`, 'outOfRange')
      }
    })
  }
  checkList(node.excludeAttributes, GE0, `${path}.excludeAttributes`, report)
}

/** Lista cujos itens podem repetir (objetos): só confere o tamanho. */
function checkListLoose(
  value: unknown,
  range: Range,
  path: string,
  report: TEffectReport
): value is readonly unknown[] {
  if (!Array.isArray(value) || !inRange(value.length, range)) {
    report(path, 'outOfRange')
    return false
  }
  return true
}

function checkOffer(node: Rec, path: string, report: TEffectReport): void {
  const requirements = node.requirements
  if (checkListLoose(requirements, GE1, `${path}.requirements`, report)) {
    requirements.forEach((entry, index) => {
      const at = `${path}.requirements[${index}]`
      if (!isRec(entry) || !inRange(entry.count, GE1)) {
        report(`${at}.count`, 'outOfRange')
      }
      checkCitation(
        isRec(entry) ? entry.resource : undefined,
        RESOURCE_CITATIONS,
        `${at}.resource`,
        report
      )
    })
  }
  const exclude = node.exclude
  if (Array.isArray(exclude)) {
    exclude.forEach((entry, index) =>
      checkCitation(
        entry,
        EXCLUDE_CITATIONS,
        `${path}.exclude[${index}]`,
        report
      )
    )
  }
}

function checkQuantity(
  value: unknown,
  path: string,
  report: TEffectReport
): void {
  if (!isRec(value)) {
    if (!inRange(value, GE0)) report(path, 'outOfRange')
    return
  }
  if (!inRange(value.multiplier, GE1))
    report(`${path}.multiplier`, 'outOfRange')
  if (!inRange(value.minimum, GE0)) report(`${path}.minimum`, 'outOfRange')
}

function checkModifierComparison(
  node: Rec,
  path: string,
  report: TEffectReport
): void {
  checkList(node.left, MODS, `${path}.left`, report)
  if (node.right !== null) checkList(node.right, MODS, `${path}.right`, report)
  if (node.value !== null && !inRange(node.value, GE0)) {
    report(`${path}.value`, 'outOfRange')
  }
  if ((node.right === null) === (node.value === null)) {
    report(path, 'exactlyOneRequired')
  }
}

/** Confere um nó (gatilho, custo, ativação ou duração) contra a regra do `kind`. */
function checkNode(
  node: unknown,
  rules: Readonly<Record<string, Rule>>,
  path: string,
  report: TEffectReport
): void {
  const kind = isRec(node) ? node.kind : undefined
  if (!isRec(node) || typeof kind !== 'string' || !Object.hasOwn(rules, kind)) {
    report(`${path}.kind`, 'unknownEffectKind')
    return
  }
  const rule = rules[kind]
  if (!rule) return

  for (const [name, range] of Object.entries(rule.ints ?? {})) {
    if (!inRange(node[name], range)) report(`${path}.${name}`, 'outOfRange')
  }
  for (const [name, range] of Object.entries(rule.nullInts ?? {})) {
    if (node[name] !== null && !inRange(node[name], range)) {
      report(`${path}.${name}`, 'outOfRange')
    }
  }
  for (const [name, [range, word]] of Object.entries(rule.intsOrWord ?? {})) {
    if (node[name] !== word && !inRange(node[name], range)) {
      report(`${path}.${name}`, 'outOfRange')
    }
  }
  for (const [name, range] of Object.entries(rule.lists ?? {})) {
    checkList(node[name], range, `${path}.${name}`, report)
  }
  for (const name of rule.quantity ?? []) {
    checkQuantity(node[name], `${path}.${name}`, report)
  }
  if (rule.changes !== undefined) {
    const changes = node.changes
    if (checkListLoose(changes, MODS, `${path}.changes`, report)) {
      changes.forEach((entry, index) => {
        if (!isRec(entry) || !Number.isInteger(entry[rule.changes ?? ''])) {
          report(`${path}.changes[${index}].${rule.changes}`, 'outOfRange')
        }
      })
    }
  }
  if (rule.hand) checkHand(node, path, report)
  if (rule.offer) checkOffer(node, path, report)
  if (rule.modifierComparison) checkModifierComparison(node, path, report)
  if (rule.exactlyOne) {
    const [a, b] = rule.exactlyOne
    if ((node[a] === null) === (node[b] === null)) {
      report(path, 'exactlyOneRequired')
    }
  }
  if (rule.anyOf) {
    const filled = rule.anyOf.some((name) => {
      const value = node[name]
      return Array.isArray(value) ? value.length > 0 : value != null
    })
    if (!filled) report(path, 'filterRequired')
  }
  for (const name of rule.tagLists ?? []) {
    const tags = node[name]
    if (Array.isArray(tags)) {
      tags.forEach((tag, index) => {
        if (isBlank(tag))
          report(`${path}.${name}[${index}]`, 'citationNotAllowed')
      })
    }
  }
  for (const name of rule.cardRefs ?? []) {
    // `null` = sem citação (onAbilityUsed.cardId).
    if (node[name] !== null && isBlank(node[name])) {
      report(`${path}.${name}`, 'empty')
    }
  }
  for (const name of rule.zoneRefs ?? []) {
    if (isBlank(node[name])) report(`${path}.${name}`, 'empty')
  }
}

/**
 * Regras de REQ-99 sobre cada efeito da carta. `field` no formato do
 * integrador (`effects[0].activation[1].amount`).
 */
export function checkEffects(card: TEffectSource, report: TEffectReport): void {
  const zoneLike = card.type === 'zone' || card.type === 'dimension'

  card.effects.forEach((effect, index) => {
    const path = `effects[${index}]`
    // Entrada não confiável (editor, import): lida campo a campo.
    const draft: Rec = effect as unknown as Rec

    if (isBlank(draft.text)) report(`${path}.text`, 'empty')

    if (draft.trigger !== null) {
      checkNode(draft.trigger, TRIGGERS, `${path}.trigger`, report)
    }

    const cost = Array.isArray(draft.cost) ? (draft.cost as unknown[]) : []
    cost.forEach((entry, costIndex) => {
      checkNode(entry, COSTS, `${path}.cost[${costIndex}]`, report)
      if (
        isRec(entry) &&
        entry.kind === 'consumeSelf' &&
        card.type !== 'item'
      ) {
        report(`${path}.cost[${costIndex}]`, 'consumeSelfOnlyInItem')
      }
    })
    // README 13 ("Usar um recurso"): consumível é gasto por efeito (D-103).
    if (
      card.type === 'item' &&
      card.itemCategory === 'consumable' &&
      !cost.some((entry) => isRec(entry) && entry.kind === 'consumeSelf')
    ) {
      report(`${path}.cost`, 'consumableNeedsConsumeSelf')
    }

    const activation = draft.activation
    if (!Array.isArray(activation) || activation.length === 0) {
      report(`${path}.activation`, 'empty')
    } else {
      activation.forEach((entry, activationIndex) =>
        checkNode(
          entry,
          ACTIVATIONS,
          `${path}.activation[${activationIndex}]`,
          report
        )
      )
    }

    checkNode(draft.duration, DURATIONS, `${path}.duration`, report)

    // README 13.6: instantâneo não marca; com duração, buff ou debuff.
    // Duração desconhecida já foi reportada acima.
    const durationKnown =
      isRec(draft.duration) &&
      typeof draft.duration.kind === 'string' &&
      Object.hasOwn(DURATIONS, draft.duration.kind)
    if (!zoneLike && durationKnown) {
      const immediate =
        isRec(draft.duration) && draft.duration.kind === 'immediate'
      if (immediate && draft.mark !== null) {
        report(`${path}.mark`, 'markNotAllowed')
      } else if (!immediate && draft.mark === null) {
        report(`${path}.mark`, 'markRequired')
      }
    }
  })
}

/** Variantes de FEAT-11 executáveis fora de combate e durações do encontro. */
const EVENT_ACTIVATIONS = [
  'gainGold',
  'loseGold',
  'heal',
  'loseLife',
  'restoreVigor',
  'gainPeak',
  'modifierFlat',
  'modifierPercent',
  'drawCards',
  'removeDebuffs',
  'removeBuffs',
]
const EVENT_DURATIONS = [
  'immediate',
  'untilEndOfTurn',
  'untilStartOfNextTurn',
  'forOwnTurns',
  'untilEndOfRound',
  'forRounds',
  'untilLeaveZone',
  'infinite',
  'untilPartyEnd',
]

export function checkEventCost(
  value: unknown,
  path: string,
  report: TEffectReport
): void {
  checkNode(value, COSTS, path, report)
  if (isRec(value) && isRec(value.amount) && value.amount.base === 'perEnemy') {
    report(`${path}.amount.base`, 'unknownEffectKind')
  }
}

// Variantes de EFEITOS-CATALOGO disponíveis no contexto de uma habilidade inimiga.
const COMBAT_TRIGGERS = new Set([
  'onEnemyDefeated',
  'onCombatFleeAttempt',
  'onAbilityUsed',
  'onElementAbilityUsed',
  'onElementalAdvantageHit',
  'onElementDamageTaken',
  'whileUsedAbilitiesSameElement',
  'onEngageEnemyElement',
  'onEngageEnemyType',
  'onEnemyCategoryDefeated',
  'whileEnemyCount',
  'onAttackedByEnemyBehavior',
])

const COMBAT_COSTS = new Set(['donateLife', 'spendVigor'])

const COMBAT_ACTIVATIONS = new Set([
  'gainGold',
  'loseGold',
  'heal',
  'loseLife',
  'gainPeak',
  'restoreVigor',
  'modifierFlat',
  'modifierPercent',
  'attributeValueMultiplier',
  'effectDamage',
  'enemyModifierFlat',
  'drawCards',
  'nullifyAbilities',
  'fleeTargetOverride',
  'fleeTargetModifier',
  'diceChooseResult',
  'diceResultModifier',
  'breakEquipment',
  'changeNextAbilityElement',
  'grantElementToAbility',
  'removeEnemyElement',
  'ignoreElementalDisadvantage',
  'elementalAdvantageOverride',
  'invertElementalRelations',
  'elementResistance',
  'elementImmunity',
  'elementVulnerability',
  'elementVigorCostModifier',
  'defeatEnemy',
  'extraAttack',
  'skipEnemyTurn',
  'swapCombatOrder',
  'removeDebuffs',
  'removeBuffs',
])

const COMBAT_DURATIONS = new Set([
  'immediate',
  'whileSourceActive',
  'infinite',
  'untilEndOfTurn',
  'untilStartOfNextTurn',
  'forOwnTurns',
  'untilEndOfRound',
  'forRounds',
  'untilLeaveZone',
  'untilNextCombatEnd',
  'forCombats',
  'untilCombatWon',
  'untilOwnCombatTurnEnd',
  'forOwnCombatTurns',
  'forCombatCycles',
  'untilDamageTaken',
  'untilAttackMade',
  'untilAttackMissed',
  'untilAbilityUsed',
  'forAbilitiesUsed',
  'whileAbilityActive',
  'untilPartyEnd',
])

export function checkEnemyAbilityExecution(
  ability: TExecutableAbility,
  path: string,
  report: TEffectReport
): void {
  if (ability.duration && !COMBAT_DURATIONS.has(ability.duration.kind)) {
    report(`${path}.duration`, 'unknownEffectKind')
  }
  ability.cost.forEach((cost, index) => {
    if (!COMBAT_COSTS.has(cost.kind))
      report(`${path}.cost.${index}`, 'unknownEffectKind')
    else checkNode(cost, COSTS, `${path}.cost.${index}`, report)
  })
  ability.effects.forEach((effect, index) => {
    const field = `${path}.effects.${index}`
    if (effect.trigger && !COMBAT_TRIGGERS.has(effect.trigger.kind)) {
      report(`${field}.trigger`, 'unknownEffectKind')
    }
    if (!COMBAT_DURATIONS.has(effect.duration.kind)) {
      report(`${field}.duration`, 'unknownEffectKind')
    }
    effect.cost.forEach((cost, costIndex) => {
      if (!COMBAT_COSTS.has(cost.kind))
        report(`${field}.cost.${costIndex}`, 'unknownEffectKind')
      else checkNode(cost, COSTS, `${field}.cost.${costIndex}`, report)
    })
    effect.activation.forEach((activation, activationIndex) => {
      const activationField = `${field}.activation.${activationIndex}`
      if (!COMBAT_ACTIVATIONS.has(activation.kind))
        report(activationField, 'unknownEffectKind')
      else checkNode(activation, ACTIVATIONS, activationField, report)
    })
  })
}

export function checkEventOutcomeEffect(
  effect: {
    readonly text: string
    readonly activation: readonly { kind: string }[]
    readonly duration: { kind: string }
    readonly mark: unknown
  },
  path: string,
  report: TEffectReport
): void {
  if (isBlank(effect.text)) report(`${path}.text`, 'empty')
  if (effect.activation.length === 0) report(`${path}.activation`, 'empty')
  effect.activation.forEach((activation, index) => {
    const field = `${path}.activation[${index}]`
    if (!EVENT_ACTIVATIONS.includes(activation.kind))
      report(field, 'unknownEffectKind')
    else checkNode(activation, ACTIVATIONS, field, report)
  })
  const kind = effect.duration.kind
  if (EVENT_DURATIONS.includes(kind)) {
    checkNode(effect.duration, DURATIONS, `${path}.duration`, report)
  } else if (kind !== 'untilEventPhaseEnd' && kind !== 'untilEventEnd') {
    report(`${path}.duration`, 'unknownEffectKind')
  }

  if (kind === 'immediate' && effect.mark !== null)
    report(`${path}.mark`, 'markNotAllowed')
  if (kind !== 'immediate' && effect.mark === null)
    report(`${path}.mark`, 'markRequired')
}

export type TEffectCitation = Readonly<{
  /** Caminho com pontos (`effects.0.trigger.zoneTitle`). */
  path: string
  type: 'card' | 'zone'
  value: string
}>

/** Cartas e títulos de zona citados pelos efeitos (conferidos ao publicar, D-91). */
export function effectCitations(
  card: Pick<TEffectSource, 'effects'>
): TEffectCitation[] {
  const citations: TEffectCitation[] = []
  const sections: [string, Readonly<Record<string, Rule>>][] = [
    ['trigger', TRIGGERS],
    ['duration', DURATIONS],
  ]
  card.effects.forEach((effect, index) => {
    const draft = effect as unknown as Rec
    for (const [section, rules] of sections) {
      const node = draft[section]
      if (!isRec(node) || typeof node.kind !== 'string') continue
      const rule = Object.hasOwn(rules, node.kind)
        ? rules[node.kind]
        : undefined
      for (const name of rule?.cardRefs ?? []) {
        const value = node[name]
        if (typeof value === 'string' && value !== '') {
          citations.push({
            path: `effects.${index}.${section}.${name}`,
            type: 'card',
            value,
          })
        }
      }
      for (const name of rule?.zoneRefs ?? []) {
        const value = node[name]
        if (typeof value === 'string' && value !== '') {
          citations.push({
            path: `effects.${index}.${section}.${name}`,
            type: 'zone',
            value,
          })
        }
      }
    }
  })
  return citations
}
