import { describe, expect, it } from 'vitest'

import { EFFECT_KINDS } from '@/domain/catalog/enterprise/effect-rules'

import {
  activationSchema,
  costSchema,
  durationSchema,
  effectSchema,
  triggerSchema,
  zoneEffectSchema,
} from './effect-schemas'

/**
 * REQ-98/D-103: os schemas espelham as uniões do domínio campo a campo.
 * Estrutura e pertinência a enums são do schema; faixas, inteiros e regras
 * entre campos são do domínio (`effect-rules`). Um exemplar válido por `kind`,
 * na ordem dos tipos de `value-objects/effect`.
 */

const HAND = {
  requirements: [{ attribute: 'strength', count: 1 }],
  excludeAttributes: [],
  constraint: 'none',
  random: false,
}

const EQUIPMENT = {
  slots: ['weapon'],
  excludeSlots: [],
  count: 1,
  random: false,
}

const OFFER = {
  requirements: [{ resource: 'item', count: 1 }],
  constraint: 'none',
  exclude: [],
}

const COMPARISON = {
  left: ['attack'],
  op: 'gte',
  right: ['defense'],
  value: null,
}

const TRIGGER_CASES: Record<string, Record<string, unknown>> = {
  onEnterThisZone: {},
  onEnterZoneTitle: { zoneTitle: 'Porto Cinzento' },
  onEnterZoneFilter: {
    zoneTypes: ['forest'],
    excludeZoneTypes: [],
    locations: [],
    excludeLocations: [],
  },
  onZoneActionUsed: { action: 'recover', times: 1, consecutive: false },
  onZoneActionSkipped: { action: 'move', zones: 1 },
  whileZoneActionCountBelow: { action: 'recover', max: 1 },
  onQuestCompleted: {},
  onZoneQuestsCompleted: {},
  onQuestCountReached: { count: 1, perZone: true },
  onQuestAbandoned: {},
  onEventPhase: { phases: ['encounter'], exclude: false },
  onEnemyDefeated: { count: 1, distinct: false },
  onCombatFleeAttempt: {},
  onAbilityUsed: {
    slots: ['weapon'],
    excludeSlots: [],
    tags: [],
    cardId: null,
  },
  onResourceEffectActivated: { source: 'any', count: 1, distinct: false },
  whileResourceActivationCountBelow: { max: 1, distinct: false },
  whileInventoryResourceCount: { count: 1, op: 'gte', distinct: false },
  whileEffectUseCount: {
    source: 'any',
    slots: [],
    excludeSlots: [],
    itemCategories: [],
    count: 1,
    op: 'gte',
    distinct: false,
  },
  whileClassIs: { classes: ['warrior'], mode: 'anyOf' },
  whileSpecializationOf: { classes: ['warrior'] },
  whilePrimaryClassCount: { min: 1, max: null },
  whileSpecializationCount: { min: 1, max: null },
  whileHighestModifier: { modifiers: ['attack'] },
  whileLowestModifier: { modifiers: ['defense'] },
  whileModifierComparison: COMPARISON,
  whileHandAttributeCount: {
    attributes: ['strength'],
    mode: 'any',
    count: 1,
    op: 'gte',
  },
  whileHandDistinctAttributes: { count: 1, op: 'gte' },
  whileHandCount: { count: 1, op: 'gte' },
  whileAttributeDiscardCount: { count: 1, op: 'gte' },
  whileAttributeDeckCount: { count: 1, op: 'gte' },
  whileHealth: { value: 1, op: 'gte' },
  whileGold: { value: 1, op: 'gte' },
  whileVigorRatio: { percent: 50, op: 'gte' },
  onVigorReached: { value: 1 },
  whilePeak: { value: 1, op: 'gte' },
  onVigorSpent: { amount: 1 },
  onPeakLost: {},
  onElementAbilityUsed: { element: 'fire' },
  onElementalAdvantageHit: {},
  onElementDamageTaken: { element: null },
  whileUsedAbilitiesSameElement: {},
  onEngageEnemyElement: { element: 'fire' },
  onEngageEnemyType: { enemyTypes: ['beast'] },
  onEnemyCategoryDefeated: { category: 'common' },
  whileEnemyCount: { count: 1, op: 'gte' },
  onAttackedByEnemyBehavior: { behavior: 'aggressive' },
}

const COST_CASES: Record<string, Record<string, unknown>> = {
  consumeSelf: {},
  discardFromHand: HAND,
  discardHandDownTo: { leave: 3, minimum: 1 },
  discardWholeHand: { minimum: 1 },
  donateLife: { amount: 5 },
  payGold: { amount: 5 },
  abandonEquipment: EQUIPMENT,
  offerResources: OFFER,
  manipulateAttributeCards: { mode: 'millTop', count: 1, minimum: null },
  spendVigor: { amount: 5 },
  reducePeak: { amount: 1, percent: null },
}

const ACTIVATION_CASES: Record<string, Record<string, unknown>> = {
  gainGold: { amount: 1 },
  loseGold: { amount: 1 },
  heal: { amount: 1 },
  loseLife: { amount: 'halfHealth' },
  gainPeak: { amount: 1 },
  restoreVigor: { amount: 1 },
  modifierFlat: { changes: [{ modifier: 'attack', amount: 1 }] },
  modifierPercent: { changes: [{ modifier: 'attack', percent: 10 }] },
  zeroModifiers: { modifiers: ['attack'] },
  attributeValueMultiplier: { attribute: 'strength', factor: 2 },
  effectDamage: { amount: 1 },
  enemyModifierFlat: { changes: [{ modifier: 'attack', amount: 1 }] },
  gainBaseHealth: { amount: 1 },
  drawCards: { count: 1 },
  discardHandCards: HAND,
  returnDiscardToDeckTop: { count: 1 },
  millDeck: { count: 1, from: 'top' },
  searchAttribute: {
    attribute: 'strength',
    count: 1,
    source: 'deck',
    shuffle: false,
  },
  handToDeckTop: { count: 1 },
  nullifyEffects: { target: 'equipment', slots: [], itemCategories: [] },
  nullifyAbilities: { slots: [], tags: ['tag:arcano'] },
  keepPeakOnKnockout: {},
  actionPointsOverride: { value: 1 },
  actionPointsBonus: { amount: 1 },
  moveDistanceBonus: { zones: 2 },
  recoverHealPercentOverride: { percent: 50 },
  skipEventBackfire: {},
  handLimit: { max: 5 },
  fleeTargetOverride: { value: 5 },
  fleeTargetModifier: { amount: 'minusHandCount' },
  marketShowcaseModifier: { mode: 'add', value: 1 },
  diceChooseResult: {},
  diceResultModifier: { amount: 1 },
  breakEquipment: { slots: ['weapon'] },
  abandonOwnEquipment: EQUIPMENT,
  repairEquipment: { target: 'self' },
  offerResourcesAsEffect: OFFER,
  changeNextAbilityElement: { element: 'fire' },
  grantElementToAbility: { element: 'fire' },
  removeEnemyElement: {},
  ignoreElementalDisadvantage: {},
  elementalAdvantageOverride: { percent: 10 },
  invertElementalRelations: {},
  elementResistance: { element: 'fire' },
  elementImmunity: { element: 'fire' },
  elementVulnerability: { element: 'fire' },
  elementVigorCostModifier: { element: 'fire', percent: 10 },
  defeatEnemy: {},
  extraAttack: { count: 1 },
  skipEnemyTurn: { count: 1 },
  swapCombatOrder: {},
  reviveAlly: { healthPercent: 50 },
  teleportToRespawn: {},
  moveToZoneOfType: { zoneType: 'sameAsCurrent' },
  removeDebuffs: { target: 'self' },
  removeBuffs: { target: 'self' },
}

const DURATION_CASES: Record<string, Record<string, unknown>> = {
  immediate: {},
  whileSourceActive: {},
  infinite: {},
  untilThisCardDiscarded: {},
  untilCardDiscarded: { cardId: 'fixture.x' },
  untilHandCount: { count: 1, op: 'gte' },
  untilResourcesInLimbo: { count: 1 },
  untilEndOfTurn: {},
  untilStartOfNextTurn: {},
  forOwnTurns: { turns: 1 },
  untilEndOfNextPlayerTurn: {},
  untilEndOfRound: {},
  forRounds: { rounds: 1 },
  untilStartOfNextRound: {},
  whileInThisZone: {},
  untilLeaveZone: {},
  untilEnterZoneType: { zoneTypes: ['forest'] },
  forZonesPassed: { count: 1 },
  untilEventEnd: {},
  forEvents: { count: 1 },
  untilEventSuccess: {},
  untilEventFailure: {},
  untilNextCombatEnd: {},
  forCombats: { count: 1 },
  untilCombatWon: {},
  untilEventPhaseEnd: { phase: 'encounter' },
  duringEventPhases: { phases: ['encounter'] },
  untilZoneActionUsed: { action: 'recover', count: 1 },
  forZoneActions: { count: 1 },
  untilOwnCombatTurnEnd: {},
  forOwnCombatTurns: { turns: 1 },
  forCombatCycles: { cycles: 1 },
  untilDamageTaken: {},
  untilAttackMade: {},
  untilAttackMissed: {},
  untilAbilityUsed: { element: null },
  forAbilitiesUsed: { count: 1 },
  whileAbilityActive: { cardId: 'fixture.x' },
  untilOtherResourceEffectActivated: {},
  untilAnyEffectNullified: {},
  whileEffectActive: { cardId: 'fixture.x', effectIndex: 0 },
  whileAttributeInHand: { attribute: 'strength', count: 1 },
  untilAttributeDiscarded: { attribute: 'strength' },
  untilAttributeInDiscard: { attribute: 'strength', count: 1 },
  untilKnockout: {},
  whileHealthThreshold: { value: 1, op: 'gte' },
  untilHandEmpty: {},
  untilGoldSpent: { amount: 1 },
  whileResourceInInventory: { cardId: 'fixture.x' },
  untilInventoryFull: {},
  untilResourceOffered: {},
  whileHighestModifierIs: { modifiers: ['attack'] },
  untilVigorBelow: { value: 1 },
  whileModifierComparison: {
    left: ['attack'],
    op: 'gte',
    right: null,
    value: 1,
  },
  whileHasClass: { classes: ['warrior'] },
  untilSpecializationGained: {},
  whileSinglePrimaryClass: {},
  untilPartyEnd: {},
  untilLeaveDimension: {},
}

const UNIONS = [
  ['trigger', triggerSchema, TRIGGER_CASES],
  ['cost', costSchema, COST_CASES],
  ['activation', activationSchema, ACTIVATION_CASES],
  ['duration', durationSchema, DURATION_CASES],
] as const

describe('REQ-98: espelho das uniões do domínio', () => {
  it('as quatro uniões cobrem as 172 variações do catálogo (46/11/56/59)', () => {
    for (const [name, schema, cases] of UNIONS) {
      const domainKinds = [...EFFECT_KINDS[name]]
      expect(Object.keys(cases).sort(), name).toEqual(domainKinds.sort())
      expect(schema.options, name).toHaveLength(domainKinds.length)
    }
  })

  for (const [name, schema, cases] of UNIONS) {
    describe(`${name}: aceita um nó válido de cada kind`, () => {
      for (const [kind, params] of Object.entries(cases)) {
        it(kind, () => {
          expect(schema.safeParse({ kind, ...params }).success).toBe(true)
        })
      }
    })
  }
})

describe('forma: estrutura e enums no schema; faixas no domínio (D-103)', () => {
  it('kind desconhecido falha nas quatro posições', () => {
    for (const schema of [
      triggerSchema,
      costSchema,
      activationSchema,
      durationSchema,
    ]) {
      expect(schema.safeParse({ kind: 'onFullMoon' }).success).toBe(false)
    }
  })

  it('valor fora do enum falha com o caminho do parâmetro', () => {
    const result = triggerSchema.safeParse({
      kind: 'whileHandCount',
      count: 1,
      op: 'entre',
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['op'])
  })

  it('parâmetro obrigatório ausente falha com o caminho', () => {
    const result = activationSchema.safeParse({ kind: 'heal' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['amount'])
    }
  })

  it('campo desconhecido falha (objeto estrito)', () => {
    const result = activationSchema.safeParse({
      kind: 'gainGold',
      amount: 1,
      target: 'self',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues[0]
      expect(issue?.code).toBe('unrecognized_keys')
      if (issue?.code === 'unrecognized_keys') {
        expect(issue.keys).toEqual(['target'])
        expect(issue.path).toEqual([])
      }
    }
  })

  it('Quantidade: número ou fórmula com base do catálogo', () => {
    expect(costSchema.safeParse({ kind: 'payGold', amount: 5 }).success).toBe(
      true
    )
    expect(
      costSchema.safeParse({
        kind: 'payGold',
        amount: { base: 'halfGold', multiplier: 1, minimum: 0 },
      }).success
    ).toBe(true)
    expect(
      costSchema.safeParse({
        kind: 'payGold',
        amount: { base: 'halfSilver', multiplier: 1, minimum: 0 },
      }).success
    ).toBe(false)
  })

  it('inteiro ou palavra fixa (loseLife)', () => {
    expect(
      activationSchema.safeParse({ kind: 'loseLife', amount: 3 }).success
    ).toBe(true)
    expect(
      activationSchema.safeParse({ kind: 'loseLife', amount: 'halfHealth' })
        .success
    ).toBe(true)
    expect(
      activationSchema.safeParse({ kind: 'loseLife', amount: 'quarter' })
        .success
    ).toBe(false)
  })

  it('string em campo numérico falha', () => {
    const result = activationSchema.safeParse({ kind: 'heal', amount: 'muita' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['amount'])
    }
  })
})

describe('Effect e ZoneEffect (REQ-98)', () => {
  const tonicEffect = {
    text: '+3 de Ataque durante 2 vezes suas.',
    trigger: null,
    cost: [{ kind: 'consumeSelf' }],
    activation: [
      { kind: 'modifierFlat', changes: [{ modifier: 'attack', amount: 3 }] },
    ],
    duration: { kind: 'forOwnTurns', turns: 2 },
    mark: 'buff',
  }

  it('efeito de atributo, equipamento e item com mark', () => {
    expect(effectSchema.safeParse(tonicEffect).success).toBe(true)
    expect(effectSchema.safeParse({ ...tonicEffect, mark: null }).success).toBe(
      true
    )
  })

  it('efeito de zona e dimensão com polarity no lugar de mark', () => {
    const zoneEffect = {
      text: 'A névoa dificulta a visão.',
      trigger: null,
      cost: [],
      activation: [
        {
          kind: 'modifierFlat',
          changes: [{ modifier: 'accuracy', amount: -1 }],
        },
      ],
      duration: { kind: 'whileInThisZone' },
      polarity: 'negative',
    }

    expect(zoneEffectSchema.safeParse(zoneEffect).success).toBe(true)
  })

  it('text vazio passa no schema (a regra `empty` é do domínio, REQ-99/D-103)', () => {
    expect(effectSchema.safeParse({ ...tonicEffect, text: '' }).success).toBe(
      true
    )
  })

  it('mark/polarity fora do enum falha', () => {
    expect(
      effectSchema.safeParse({ ...tonicEffect, mark: 'neutral' }).success
    ).toBe(false)
    expect(
      zoneEffectSchema.safeParse({
        text: 'x',
        trigger: null,
        cost: [],
        activation: [{ kind: 'heal', amount: 1 }],
        duration: { kind: 'immediate' },
        polarity: 'neutral',
      }).success
    ).toBe(false)
  })

  it('campo trocado (mark em zona, polarity em item) = campo desconhecido', () => {
    const zoneWithMark = {
      text: 'x',
      trigger: null,
      cost: [],
      activation: [{ kind: 'heal', amount: 1 }],
      duration: { kind: 'immediate' },
      mark: null,
    }
    expect(zoneEffectSchema.safeParse(zoneWithMark).success).toBe(false)

    const itemWithPolarity = { ...tonicEffect, polarity: 'positive' }
    delete (itemWithPolarity as Record<string, unknown>).mark
    expect(effectSchema.safeParse(itemWithPolarity).success).toBe(false)
  })

  it('partes ausentes falham (trigger, cost, activation, duration)', () => {
    for (const key of ['trigger', 'cost', 'activation', 'duration'] as const) {
      const partial = { ...tonicEffect } as Record<string, unknown>
      delete partial[key]
      expect(effectSchema.safeParse(partial).success).toBe(false)
    }
  })
})
