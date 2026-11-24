import { describe, expect, it } from 'vitest'

import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeEquipmentCard,
  makeItemCard,
  makeZoneCard,
} from '../../../../../test/factories/make-card'
import { makePlayerState } from '../../../../../test/factories/make-party'

import type { TPlayerState } from '../entities/party-member'
import {
  DEFAULT_EQUIPMENT_STATE,
  type TEquipmentState,
} from '../equipment-state'
import type { TBlacksmithOperation } from '../party-action'
import { applyBlacksmithOperations, describeBlacksmith } from '.'

const ORE = makeItemCard({ id: 'fixture.iron-ore', itemCategory: 'material' })
const SWORD = makeEquipmentCard({
  id: 'fixture.short-sword',
  modifiers: [{ modifier: 'attack', value: 2 }],
  refinement: {
    maxLevel: 10,
    materials: [{ cardId: ORE.id, quantity: 1 }],
  },
})
const LEGACY = makeEquipmentCard({
  id: 'fixture.legacy-blade',
  refinement: { maxLevel: 10, materials: [] },
})
const PLAIN = makeEquipmentCard({ id: 'fixture.oak-shield', slot: 'shield' })
const BLUEPRINT = makeItemCard({
  id: 'fixture.sword-blueprint',
  itemCategory: 'document',
  recipe: {
    equipmentId: SWORD.id,
    materials: [{ cardId: ORE.id, quantity: 2 }],
    gold: 15,
    consumed: false,
  },
})
const CARDS = new Map<string, TCard>(
  [ORE, SWORD, LEGACY, PLAIN, BLUEPRINT].map((card) => [card.id, card])
)
const config = { ...GAME_CONFIG_DEFAULTS }

const at = (refinement: number, extra: Partial<TEquipmentState> = {}) => ({
  ...DEFAULT_EQUIPMENT_STATE,
  refinement,
  ...extra,
})
const sword = (state?: TEquipmentState) => ({
  cardId: SWORD.id,
  quantity: 1,
  ...(state && { equipmentState: state }),
})
const ore = (quantity: number) => ({ cardId: ORE.id, quantity })
const inv = (inventorySlotIndex: number) => ({
  location: 'inventory' as const,
  inventorySlotIndex,
})
const ARTIFICER = [{ playerClass: 'artificer' as const, deckLockMet: true }]

function rolls(...values: number[]) {
  const queue = [...values]
  const used: number[] = []
  return {
    used,
    nextInt: (min: number, max: number) => {
      expect([min, max]).toEqual([1, 20])
      const value = queue.shift()
      if (value === undefined) throw new Error('rolagem a mais')
      used.push(value)
      return value
    },
  }
}

function run(
  player: Partial<TPlayerState>,
  operations: TBlacksmithOperation[],
  rng = rolls()
) {
  return applyBlacksmithOperations({
    player: makePlayerState(player),
    config,
    cards: CARDS,
    operations,
    zoneId: 'fixture.gray-harbor',
    actionPointsSpent: 2,
    rng,
  })
}

describe('Ir ao Ferreiro — lote (REQ-149, REQ-150, REQ-152; D-132)', () => {
  it('REQ-150: +4 → +5 custa 50 de ouro e 1 minério; limiar 8, rolagem 8 sobe', () => {
    const rng = rolls(8)
    const outcome = run(
      { gold: 60, inventory: [sword(at(4)), ore(3)] },
      [{ operation: 'refine', target: inv(0) }],
      rng
    )

    const { player, result } = outcome.value as Extract<
      typeof outcome.value,
      { player: unknown }
    >
    expect(player.gold).toBe(10)
    expect(player.inventory).toEqual([sword(at(5)), ore(2)])
    expect(result).toEqual({
      source: 'blacksmith',
      zoneId: 'fixture.gray-harbor',
      actionPointsSpent: 2,
      results: [
        {
          operation: 'refine',
          target: inv(0),
          cardId: SWORD.id,
          targetLevel: 5,
          gold: -50,
          roll: 8,
          d20Bonus: 0,
          threshold: 8,
          success: true,
          broke: false,
          skipped: false,
        },
      ],
    })
  })

  it('REQ-150: +0 → +1 tem limiar 0 e não rola', () => {
    const rng = rolls()
    const outcome = run(
      { gold: 10, inventory: [sword(), ore(1)] },
      [{ operation: 'refine', target: inv(0) }],
      rng
    )
    expect(outcome.isRight()).toBe(true)
    if (outcome.isLeft()) return
    expect(rng.used).toEqual([])
    expect(outcome.value.player.inventory).toEqual([sword(at(1))])
    expect(outcome.value.result.results[0]).toMatchObject({
      roll: null,
      threshold: 0,
      success: true,
      gold: -10,
    })
  })

  it('REQ-150: +6 → +7 rola 11 sem Artífice → falha, perde ouro e material e quebra com o refino mantido', () => {
    const outcome = run(
      { gold: 70, inventory: [sword(at(6)), ore(1)] },
      [{ operation: 'refine', target: inv(0) }],
      rolls(11)
    )
    if (outcome.isLeft()) throw new Error('recusado')
    expect(outcome.value.player.gold).toBe(0)
    expect(outcome.value.player.inventory).toEqual([
      sword(at(6, { broken: true })),
    ])
    expect(outcome.value.result.results[0]).toMatchObject({
      targetLevel: 7,
      roll: 11,
      d20Bonus: 0,
      threshold: 12,
      success: false,
      broke: true,
    })
  })

  it('REQ-150, D-133: com Artífice ativo a mesma rolagem 11 vira 13 e sobe para +7', () => {
    const outcome = run(
      {
        gold: 70,
        playerClasses: ARTIFICER,
        inventory: [sword(at(6)), ore(1)],
      },
      [{ operation: 'refine', target: inv(0) }],
      rolls(11)
    )
    if (outcome.isLeft()) throw new Error('recusado')
    expect(outcome.value.player.inventory).toEqual([sword(at(7))])
    expect(outcome.value.result.results[0]).toMatchObject({
      roll: 11,
      d20Bonus: 2,
      success: true,
      broke: false,
    })
  })

  it('REQ-150: falha abaixo de +7 não quebra (+4 → +5 rola 7)', () => {
    const outcome = run(
      { gold: 50, inventory: [sword(at(4)), ore(1)] },
      [{ operation: 'refine', target: inv(0) }],
      rolls(7)
    )
    if (outcome.isLeft()) throw new Error('recusado')
    expect(outcome.value.player.inventory).toEqual([sword(at(4))])
    expect(outcome.value.result.results[0]).toMatchObject({
      success: false,
      broke: false,
      gold: -50,
    })
  })

  it('REQ-152: consertar +4 custa 13, tira broken e soma 1 marca; vale no equipamento em uso', () => {
    const outcome = run(
      {
        gold: 20,
        equipment: { ...makePlayerState().equipment, weapon: SWORD.id },
        equipmentStates: {
          weapon: { refinement: 4, enchantments: [], repairMarks: 1 },
        },
        brokenEquipment: ['weapon'],
      },
      [
        {
          operation: 'repair',
          target: { location: 'equipment', slot: 'weapon' },
        },
      ]
    )
    if (outcome.isLeft()) throw new Error('recusado')
    expect(outcome.value.player.gold).toBe(7)
    expect(outcome.value.player.brokenEquipment).toEqual([])
    expect(outcome.value.player.equipmentStates).toEqual({
      weapon: { refinement: 4, enchantments: [], repairMarks: 2 },
    })
    expect(outcome.value.result.results).toEqual([
      {
        operation: 'repair',
        target: { location: 'equipment', slot: 'weapon' },
        cardId: SWORD.id,
        gold: -13,
        repairMarks: 2,
        skipped: false,
      },
    ])
  })

  it('D-132: dois refinos seguidos, o 1º falha → o 2º sai skipped, sem custo', () => {
    const rng = rolls(3)
    const outcome = run(
      { gold: 200, inventory: [sword(at(3)), ore(5)] },
      [
        { operation: 'refine', target: inv(0) },
        { operation: 'refine', target: inv(0) },
      ],
      rng
    )
    if (outcome.isLeft()) throw new Error('recusado')
    expect(rng.used).toEqual([3])
    expect(outcome.value.player.gold).toBe(160)
    expect(outcome.value.player.inventory).toEqual([sword(at(3)), ore(4)])
    expect(outcome.value.result.results[1]).toEqual({
      operation: 'refine',
      target: inv(0),
      cardId: SWORD.id,
      targetLevel: 5,
      gold: 0,
      roll: null,
      d20Bonus: 0,
      threshold: 8,
      success: false,
      broke: false,
      skipped: true,
    })
  })

  it('D-132: refino que quebrou o equipamento faz o seguinte sair skipped; a operação independente segue', () => {
    const outcome = run(
      { gold: 300, inventory: [sword(at(7)), ore(5), sword(at(1))] },
      [
        { operation: 'refine', target: inv(0) },
        { operation: 'refine', target: inv(0) },
        { operation: 'refine', target: inv(2) },
      ],
      rolls(2)
    )
    if (outcome.isLeft()) throw new Error('recusado')
    expect(outcome.value.result.results.map((r) => r.skipped)).toEqual([
      false,
      true,
      false,
    ])
    expect(outcome.value.player.inventory).toEqual([
      sword(at(7, { broken: true })),
      ore(3),
      sword(at(2)),
    ])
  })

  it('D-132: a conferência supõe sucesso — o 2º refino pede 2 minérios no total', () => {
    const outcome = run({ gold: 200, inventory: [sword(at(3)), ore(1)] }, [
      { operation: 'refine', target: inv(0) },
      { operation: 'refine', target: inv(0) },
    ])
    expect(outcome.value).toEqual({
      reason: 'materialsMissing',
      operationIndex: 1,
      cardId: SWORD.id,
    })
  })

  it('REQ-149: recusa com índice antes de rolar (RNG intocado)', () => {
    const rng = rolls()
    const outcome = run(
      { gold: 5, inventory: [sword(at(4)), ore(2)] },
      [
        { operation: 'refine', target: inv(0) },
        { operation: 'refine', target: inv(0) },
      ],
      rng
    )
    expect(outcome.value).toEqual({
      reason: 'notEnoughGold',
      operationIndex: 0,
      cardId: SWORD.id,
    })
    expect(rng.used).toEqual([])
  })

  it.each([
    [
      'equipmentNotFound (slot vazio)',
      { location: 'equipment', slot: 'weapon' },
      'equipmentNotFound',
    ],
    ['equipmentNotFound (não é equipamento)', inv(1), 'equipmentNotFound'],
    ['equipmentNotFound (índice inexistente)', inv(9), 'equipmentNotFound'],
  ] as const)('REQ-149: alvo %s', (_name, target, reason) => {
    const outcome = run({ gold: 99, inventory: [sword(), ore(1)] }, [
      { operation: 'refine', target },
    ])
    expect(outcome.value).toEqual({ reason, operationIndex: 0 })
  })

  it('REQ-149: ordem das recusas do refino', () => {
    const one = (inventory: TPlayerState['inventory'], gold = 999) =>
      run({ gold, inventory }, [{ operation: 'refine', target: inv(0) }]).value
    expect(one([sword(at(2, { broken: true })), ore(1)])).toMatchObject({
      reason: 'equipmentBroken',
    })
    expect(one([{ cardId: PLAIN.id, quantity: 1 }])).toMatchObject({
      reason: 'notRefinable',
    })
    expect(one([{ cardId: LEGACY.id, quantity: 1 }])).toMatchObject({
      reason: 'refinementMaterialsMissing',
    })
    expect(one([sword(at(10)), ore(1)])).toMatchObject({
      reason: 'refineLevelMax',
    })
    expect(one([sword(at(1))])).toMatchObject({ reason: 'materialsMissing' })
    expect(one([sword(at(1)), ore(1)], 19)).toMatchObject({
      reason: 'notEnoughGold',
    })
  })

  it('REQ-152: consertar equipamento inteiro → notBroken; sem ouro → notEnoughGold', () => {
    expect(
      run({ gold: 99, inventory: [sword(at(4))] }, [
        { operation: 'repair', target: inv(0) },
      ]).value
    ).toEqual({ reason: 'notBroken', operationIndex: 0, cardId: SWORD.id })
    expect(
      run({ gold: 12, inventory: [sword(at(4, { broken: true }))] }, [
        { operation: 'repair', target: inv(0) },
      ]).value
    ).toEqual({ reason: 'notEnoughGold', operationIndex: 0, cardId: SWORD.id })
  })

  it('D-138: encantar ainda é recusado (T-70) com enchantmentNotOffered', () => {
    expect(
      run({ gold: 999, inventory: [sword(at(2))] }, [
        { operation: 'enchant', target: inv(0), enchantmentId: 'ember-edge' },
      ]).value
    ).toEqual({
      reason: 'enchantmentNotOffered',
      operationIndex: 0,
      cardId: SWORD.id,
    })
  })

  it('REQ-152: criar consome materiais e ouro, mantém a receita (consumed false) e entrega no fim com estado padrão', () => {
    const outcome = run(
      {
        gold: 20,
        inventory: [{ cardId: BLUEPRINT.id, quantity: 1 }, ore(3)],
      },
      [{ operation: 'craft', inventorySlotIndex: 0 }]
    )
    if (outcome.isLeft()) throw new Error('recusado')
    expect(outcome.value.player.gold).toBe(5)
    expect(outcome.value.player.inventory).toEqual([
      { cardId: BLUEPRINT.id, quantity: 1 },
      ore(1),
      sword(),
    ])
    expect(outcome.value.result.results).toEqual([
      {
        operation: 'craft',
        recipeCardId: BLUEPRINT.id,
        equipmentId: SWORD.id,
        gold: -15,
        inventorySlotIndex: 2,
        skipped: false,
      },
    ])
  })

  it('REQ-152: receita consumida e minérios zerados liberam slots (inventário cheio cabe); índices do lote valem para antes', () => {
    const consumed = makeItemCard({
      ...BLUEPRINT,
      recipe: { ...BLUEPRINT.recipe!, consumed: true },
    })
    const cards = new Map(CARDS).set(consumed.id, consumed)
    const full = Array.from({ length: config.inventoryCapacity - 3 }, () =>
      sword()
    )
    const outcome = applyBlacksmithOperations({
      player: makePlayerState({
        gold: 100,
        inventory: [
          { cardId: consumed.id, quantity: 1 },
          ore(3),
          sword(at(1)),
          ...full,
        ],
      }),
      config,
      cards,
      operations: [
        { operation: 'craft', inventorySlotIndex: 0 },
        { operation: 'refine', target: inv(2) },
      ],
      zoneId: 'z',
      actionPointsSpent: 1,
      rng: rolls(),
    })
    if (outcome.isLeft()) throw new Error(JSON.stringify(outcome.value))
    const { inventory } = outcome.value.player
    expect(inventory[0]).toEqual(sword(at(2)))
    expect(inventory.at(-1)).toEqual(sword())
    expect(inventory).toHaveLength(config.inventoryCapacity - 1)
  })

  it('REQ-152: ordem das recusas do criar', () => {
    const craft = (inventory: TPlayerState['inventory'], gold = 99) =>
      run({ gold, inventory }, [{ operation: 'craft', inventorySlotIndex: 0 }])
        .value
    expect(craft([])).toEqual({ reason: 'notInInventory', operationIndex: 0 })
    expect(craft([ore(2)])).toMatchObject({ reason: 'recipeMissing' })
    expect(
      craft([{ cardId: BLUEPRINT.id, quantity: 1 }, ore(1)])
    ).toMatchObject({ reason: 'materialsMissing' })
    expect(
      craft([{ cardId: BLUEPRINT.id, quantity: 1 }, ore(2)], 14)
    ).toMatchObject({ reason: 'notEnoughGold' })
    const full = Array.from({ length: config.inventoryCapacity - 2 }, () =>
      sword()
    )
    expect(
      craft([{ cardId: BLUEPRINT.id, quantity: 1 }, ore(3), ...full])
    ).toMatchObject({ reason: 'inventoryFull', cardId: BLUEPRINT.id })
  })

  it('D-132: equipamento criado não é alvo no mesmo lote (índice novo → equipmentNotFound)', () => {
    expect(
      run(
        {
          gold: 99,
          inventory: [{ cardId: BLUEPRINT.id, quantity: 1 }, ore(3)],
        },
        [
          { operation: 'craft', inventorySlotIndex: 0 },
          { operation: 'refine', target: inv(2) },
        ]
      ).value
    ).toEqual({ reason: 'equipmentNotFound', operationIndex: 1 })
  })
})

describe('Ir ao Ferreiro — projeção (REQ-149)', () => {
  const zone = makeZoneCard({
    id: 'fixture.gray-harbor',
    zoneActions: ['visitBlacksmith'],
    blacksmith: {
      enchantments: [
        {
          id: 'ember-edge',
          name: 'Fio de Brasa',
          kind: 'element',
          element: 'fire',
          bonusPercent: 10,
          materials: [],
        },
      ],
    },
  })

  it('REQ-149: refineSteps do nível seguinte ao máximo, conserto só se quebrado, receitas com canCraft', () => {
    const view = describeBlacksmith({
      config,
      player: makePlayerState({
        gold: 15,
        playerClasses: ARTIFICER,
        inventory: [
          sword(at(8)),
          ore(2),
          { cardId: BLUEPRINT.id, quantity: 1 },
          sword(at(3, { broken: true })),
        ],
      }),
      cards: CARDS,
      zone,
    })
    expect(view?.zoneId).toBe(zone.id)
    expect(view?.workshop).toBeNull()
    expect(view?.enchantments).toEqual([
      {
        enchantment: zone.blacksmith!.enchantments[0],
        gold: 50,
        threshold: 10,
      },
    ])
    expect(view?.blacksmith?.equipment).toEqual([
      {
        target: inv(0),
        cardId: SWORD.id,
        state: at(8),
        repair: null,
        refineSteps: [9, 10].map((level) => ({
          targetLevel: level,
          materials: SWORD.refinement!.materials,
          gold: 10 * level,
          threshold: level === 10 ? 16 : 12,
          d20Bonus: 2,
          breaksOnFailure: true,
        })),
        enchantOptions: [],
      },
      {
        target: inv(3),
        cardId: SWORD.id,
        state: at(3, { broken: true }),
        repair: { gold: 11 },
        refineSteps: [],
        enchantOptions: [],
      },
    ])
    expect(view?.recipes).toEqual([
      {
        inventorySlotIndex: 2,
        cardId: BLUEPRINT.id,
        equipmentId: SWORD.id,
        materials: BLUEPRINT.recipe!.materials,
        gold: 15,
        consumed: false,
        canCraft: true,
      },
    ])
  })

  it('REQ-149: zona sem ferreiro → null', () => {
    expect(
      describeBlacksmith({
        config,
        player: makePlayerState(),
        cards: CARDS,
        zone: makeZoneCard(),
      })
    ).toBeNull()
  })
})
