import { describe, expect, it } from 'vitest'

import type {
  TBlacksmithEnchantment,
  TCard,
} from '@/domain/catalog/enterprise/value-objects/card'
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
const SHARD = makeItemCard({
  id: 'fixture.ember-shard',
  itemCategory: 'material',
})
/** Slots: 0 = elemento sem requisito, 1 = efeito a partir de +4. */
const RUNE = makeEquipmentCard({
  id: 'fixture.rune-blade',
  refinement: { maxLevel: 5, materials: [{ cardId: ORE.id, quantity: 1 }] },
  enchantment: {
    slots: [
      { kind: 'element', minRefinement: 0 },
      { kind: 'effect', minRefinement: 4 },
    ],
  },
})
/** Dois slots de elemento sem requisito. */
const TWIN = makeEquipmentCard({
  id: 'fixture.twin-blade',
  enchantment: {
    slots: [
      { kind: 'element', minRefinement: 0 },
      { kind: 'element', minRefinement: 0 },
    ],
  },
})
const EMBER: TBlacksmithEnchantment = {
  id: 'ember-edge',
  name: 'Fio de Brasa',
  kind: 'element',
  element: 'fire',
  bonusPercent: 10,
  materials: [{ cardId: SHARD.id, quantity: 1 }],
}
const FROST: TBlacksmithEnchantment = {
  id: 'frost-edge',
  name: 'Fio Gélido',
  kind: 'element',
  element: 'frost',
  bonusPercent: 5,
  materials: [],
}
const WARD: TBlacksmithEnchantment = {
  id: 'ward',
  name: 'Guarda',
  kind: 'effect',
  effects: [],
  abilities: [],
  materials: [],
}
const ENCHANTMENTS = [EMBER, FROST, WARD]
const CARDS = new Map<string, TCard>(
  [ORE, SWORD, LEGACY, PLAIN, BLUEPRINT, SHARD, RUNE, TWIN].map((card) => [
    card.id,
    card,
  ])
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
    enchantments: ENCHANTMENTS,
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

  it('REQ-159 (D-152 a): inventário cheio → a criada vai ao inventário extra, com destination e índice nesse espaço; sem espaço → inventoryFull', () => {
    const full = {
      gold: 20,
      inventory: [{ cardId: BLUEPRINT.id, quantity: 1 }, ore(3)],
    }
    const small = { ...config, inventoryCapacity: 2, mountInventorySlots: 1 }
    const go = (mountInventory: TPlayerState['inventory']) =>
      applyBlacksmithOperations({
        player: makePlayerState({
          ...full,
          mount: {
            cardId: 'fixture.plow-horse',
            inventory: mountInventory,
            tcgFolder: [],
          },
        }),
        config: small,
        cards: CARDS,
        operations: [{ operation: 'craft', inventorySlotIndex: 0 }],
        zoneId: 'fixture.gray-harbor',
        enchantments: ENCHANTMENTS,
        actionPointsSpent: 2,
        rng: rolls(),
      })
    const outcome = go([])
    if (outcome.isLeft()) throw new Error('recusado')
    expect(outcome.value.player.mount?.inventory).toEqual([sword()])
    expect(outcome.value.result.results[0]).toMatchObject({
      destination: 'mountInventory',
      inventorySlotIndex: 0,
    })
    expect(go([{ cardId: 'x', quantity: 1 }]).value).toMatchObject({
      reason: 'inventoryFull',
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
        destination: 'inventory',
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
      enchantments: ENCHANTMENTS,
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
    // REQ-153: Artífice ativo → Oficina com desconto, teto +6 e sem encantar.
    expect(view?.workshop?.equipment).toEqual([
      {
        target: inv(0),
        cardId: SWORD.id,
        state: at(8),
        repair: null,
        refineSteps: [],
        enchantOptions: [],
      },
      {
        target: inv(3),
        cardId: SWORD.id,
        state: at(3, { broken: true }),
        repair: { gold: 6 },
        refineSteps: [],
        enchantOptions: [],
      },
    ])
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

describe('Encantar (REQ-151)', () => {
  const rune = (state?: TEquipmentState) => ({
    cardId: RUNE.id,
    quantity: 1,
    ...(state && { equipmentState: state }),
  })
  const shard = (quantity: number) => ({ cardId: SHARD.id, quantity })
  const applied = (
    enchantment: TBlacksmithEnchantment,
    slotIndex: number | null
  ) => ({ enchantment, zoneId: 'fixture.gray-harbor', slotIndex })
  const enchant = (
    enchantmentId: string,
    options: { replaceIndex?: number; extra?: boolean } = {}
  ): TBlacksmithOperation => ({
    operation: 'enchant',
    target: inv(0),
    enchantmentId,
    ...options,
  })
  const ARCANE = {
    playerClasses: ARTIFICER,
    specializations: [
      {
        playerClass: 'artificer' as const,
        specializationId: 'arcaneSmith',
        deckLockMet: true,
      },
    ],
  }
  const ok = (outcome: ReturnType<typeof run>) => {
    if (outcome.isLeft()) throw new Error(outcome.value.reason)
    return outcome.value
  }

  it('REQ-151: elemento com D20 10 aplica no slot livre, copia a definição da zona e cobra 50 e os materiais', () => {
    const { player, result } = ok(
      run(
        { gold: 60, inventory: [rune(), shard(2)] },
        [enchant('ember-edge')],
        rolls(10)
      )
    )
    expect(player.gold).toBe(10)
    expect(player.inventory).toEqual([
      rune(at(0, { enchantments: [applied(EMBER, 0)] })),
      shard(1),
    ])
    expect(result.results).toEqual([
      {
        operation: 'enchant',
        target: inv(0),
        cardId: RUNE.id,
        enchantmentId: 'ember-edge',
        gold: -50,
        roll: 10,
        threshold: 10,
        success: true,
        replaced: null,
        skipped: false,
      },
    ])
  })

  it('REQ-151: elemento com D20 9 falha: perde materiais e ouro, o equipamento não muda (sem bônus do Artífice)', () => {
    const { player, result } = ok(
      run(
        { gold: 50, inventory: [rune(), shard(1)], ...ARCANE },
        [enchant('ember-edge')],
        rolls(9)
      )
    )
    expect(player.gold).toBe(0)
    expect(player.inventory).toEqual([rune()])
    expect(result.results[0]).toMatchObject({ roll: 9, success: false })
  })

  it('REQ-151: efeito exige D20 13 e 100 de ouro; 12 falha, 13 aplica no slot de efeito (+4)', () => {
    const failed = ok(
      run({ gold: 100, inventory: [rune(at(4))] }, [enchant('ward')], rolls(12))
    )
    expect(failed.player.inventory).toEqual([rune(at(4))])
    expect(failed.result.results[0]).toMatchObject({
      gold: -100,
      threshold: 13,
      success: false,
    })
    const done = ok(
      run({ gold: 100, inventory: [rune(at(4))] }, [enchant('ward')], rolls(13))
    )
    expect(done.player.gold).toBe(0)
    expect(done.player.inventory).toEqual([
      rune(at(4, { enchantments: [applied(WARD, 1)] })),
    ])
  })

  it('REQ-151: slot do tipo abaixo do refino exigido → enchantSlotUnavailable; equipamento sem enchantment → notEnchantable', () => {
    expect(
      run({ gold: 999, inventory: [rune(at(3))] }, [enchant('ward')]).value
    ).toEqual({
      reason: 'enchantSlotUnavailable',
      operationIndex: 0,
      cardId: RUNE.id,
    })
    expect(
      run({ gold: 999, inventory: [sword()] }, [enchant('frost-edge')]).value
    ).toEqual({ reason: 'notEnchantable', operationIndex: 0, cardId: SWORD.id })
  })

  it('REQ-151: slots do tipo ocupados → replaceIndexRequired; índice fora, de outro tipo ou extra → replaceIndexInvalid', () => {
    const full = rune(
      at(4, {
        enchantments: [
          applied(WARD, 1),
          applied(EMBER, 0),
          applied(FROST, null),
        ],
      })
    )
    const refusal = (op: TBlacksmithOperation) =>
      run({ gold: 999, inventory: [full], ...ARCANE }, [op]).value
    expect(refusal(enchant('frost-edge'))).toEqual({
      reason: 'replaceIndexRequired',
      operationIndex: 0,
      cardId: RUNE.id,
    })
    for (const replaceIndex of [3, 0, 2])
      expect(refusal(enchant('frost-edge', { replaceIndex }))).toEqual({
        reason: 'replaceIndexInvalid',
        operationIndex: 0,
        cardId: RUNE.id,
      })
  })

  it('REQ-151: substituição com replaceIndex: sucesso troca e devolve o substituído; falha não muda nada', () => {
    const before = at(0, { enchantments: [applied(EMBER, 0)] })
    const done = ok(
      run(
        { gold: 50, inventory: [rune(before)] },
        [enchant('frost-edge', { replaceIndex: 0 })],
        rolls(15)
      )
    )
    expect(done.player.inventory).toEqual([
      rune(at(0, { enchantments: [applied(FROST, 0)] })),
    ])
    expect(done.result.results[0]).toMatchObject({ success: true })
    // CONTRATO v0.86: `replaced` é `AppliedEnchantment`, com o `active` de antes da troca.
    expect(
      done.result.results[0].operation === 'enchant' &&
        done.result.results[0].replaced
    ).toEqual({ ...applied(EMBER, 0), active: true })
    const failed = ok(
      run(
        { gold: 50, inventory: [rune(before)] },
        [enchant('frost-edge', { replaceIndex: 0 })],
        rolls(2)
      )
    )
    expect(failed.player.inventory).toEqual([rune(before)])
    expect(failed.result.results[0]).toMatchObject({
      success: false,
      replaced: null,
    })
  })

  it('D-139: replaceIndex com slot livre do tipo substitui mesmo assim', () => {
    const twin = (state: TEquipmentState) => ({
      cardId: TWIN.id,
      quantity: 1,
      equipmentState: state,
    })
    const { player } = ok(
      run(
        {
          gold: 50,
          inventory: [twin(at(0, { enchantments: [applied(EMBER, 1)] }))],
        },
        [enchant('frost-edge', { replaceIndex: 0 })],
        rolls(10)
      )
    )
    expect(player.inventory).toEqual([
      twin(at(0, { enchantments: [applied(FROST, 1)] })),
    ])
  })

  it('REQ-151: Ferreiro Arcano ativo coloca 1 extra (sem requisito de refino, slotIndex null); o 2º extra e o sem especialização → enchantSlotUnavailable', () => {
    const { player } = ok(
      run(
        { gold: 100, inventory: [rune()], ...ARCANE },
        [enchant('ward', { extra: true })],
        rolls(13)
      )
    )
    expect(player.inventory).toEqual([
      rune(at(0, { enchantments: [applied(WARD, null)] })),
    ])
    const withExtra = rune(at(0, { enchantments: [applied(WARD, null)] }))
    expect(
      run({ gold: 999, inventory: [withExtra], ...ARCANE }, [
        enchant('frost-edge', { extra: true }),
      ]).value
    ).toMatchObject({ reason: 'enchantSlotUnavailable' })
    for (const specializations of [
      [],
      [{ ...ARCANE.specializations[0], deckLockMet: false }],
    ])
      expect(
        run(
          {
            gold: 999,
            inventory: [rune()],
            playerClasses: ARTIFICER,
            specializations,
          },
          [enchant('ward', { extra: true })]
        ).value
      ).toMatchObject({ reason: 'enchantSlotUnavailable' })
  })

  it('CONTRATO FEAT-17: ordem das recusas do encantar', () => {
    const refusal = (player: Partial<TPlayerState>, op: TBlacksmithOperation) =>
      (run(player, [op]).value as { reason: string }).reason
    expect(
      refusal({ inventory: [rune(at(0, { broken: true }))] }, enchant('nope'))
    ).toBe('equipmentBroken')
    expect(refusal({ inventory: [sword()] }, enchant('nope'))).toBe(
      'enchantmentNotOffered'
    )
    expect(
      refusal({ gold: 99, inventory: [rune()] }, enchant('ember-edge'))
    ).toBe('materialsMissing')
    expect(
      refusal(
        { gold: 49, inventory: [rune(), shard(1)] },
        enchant('ember-edge')
      )
    ).toBe('notEnoughGold')
  })

  it('D-132: a conferência supõe o refino anterior; se ele falha, o encantamento que dependia dele sai skipped, sem custo', () => {
    const { player, result } = ok(
      run(
        { gold: 999, inventory: [rune(at(3)), ore(1)] },
        [{ operation: 'refine', target: inv(0) }, enchant('ward')],
        rolls(1)
      )
    )
    expect(player.gold).toBe(999 - 40)
    expect(result.results[1]).toEqual({
      operation: 'enchant',
      target: inv(0),
      cardId: RUNE.id,
      enchantmentId: 'ward',
      gold: 0,
      roll: null,
      threshold: 13,
      success: false,
      replaced: null,
      skipped: true,
    })
  })

  it('REQ-151: enchantOptions (livre, substituição, depois de refinar) e [] com o equipamento quebrado', () => {
    const zone = makeZoneCard({
      id: 'fixture.gray-harbor',
      zoneActions: ['visitBlacksmith'],
      blacksmith: { enchantments: [EMBER, WARD] },
    })
    const view = describeBlacksmith({
      config,
      player: makePlayerState({
        inventory: [
          rune(),
          rune(at(4, { enchantments: [applied(EMBER, 0)] })),
          rune(at(0, { broken: true })),
        ],
      }),
      cards: CARDS,
      zone,
    })
    expect(
      view?.blacksmith?.equipment.map(({ enchantOptions }) => enchantOptions)
    ).toEqual([
      [
        {
          enchantmentId: 'ember-edge',
          replaceRequired: false,
          extra: false,
          requiresRefinement: 0,
        },
        {
          enchantmentId: 'ward',
          replaceRequired: false,
          extra: false,
          requiresRefinement: 4,
        },
      ],
      [
        {
          enchantmentId: 'ember-edge',
          replaceRequired: true,
          extra: false,
          requiresRefinement: 0,
        },
        {
          enchantmentId: 'ward',
          replaceRequired: false,
          extra: false,
          requiresRefinement: 0,
        },
      ],
      [],
    ])
  })

  it('REQ-151: enchantOptions com Ferreiro Arcano: o que não cabe em slot (nem refinando) sai como extra', () => {
    const zone = makeZoneCard({
      id: 'fixture.gray-harbor',
      zoneActions: ['visitBlacksmith'],
      blacksmith: { enchantments: [WARD] },
    })
    const blocked = makeEquipmentCard({
      id: 'fixture.rune-blade',
      refinement: null,
      enchantment: { slots: [{ kind: 'effect', minRefinement: 3 }] },
    })
    const view = describeBlacksmith({
      config,
      player: makePlayerState({ ...ARCANE, inventory: [rune()] }),
      cards: new Map<string, TCard>([[blocked.id, blocked]]),
      zone,
    })
    expect(view?.blacksmith?.equipment[0].enchantOptions).toEqual([
      {
        enchantmentId: 'ward',
        replaceRequired: false,
        extra: true,
        requiresRefinement: 0,
      },
    ])
  })
})

describe('Encantar â€” bordas da D-139 (REQ-151)', () => {
  const rune = (state?: TEquipmentState) => ({
    cardId: RUNE.id,
    quantity: 1,
    ...(state && { equipmentState: state }),
  })
  const twin = (state: TEquipmentState) => ({
    cardId: TWIN.id,
    quantity: 1,
    equipmentState: state,
  })
  const applied = (
    enchantment: TBlacksmithEnchantment,
    slotIndex: number | null
  ) => ({ enchantment, zoneId: 'fixture.gray-harbor', slotIndex })
  const ARCANE = {
    playerClasses: ARTIFICER,
    specializations: [
      {
        playerClass: 'artificer' as const,
        specializationId: 'arcaneSmith',
        deckLockMet: true,
      },
    ],
  }
  const reason = (
    player: Partial<TPlayerState>,
    op: Omit<
      Extract<TBlacksmithOperation, { operation: 'enchant' }>,
      'operation' | 'target'
    >
  ) =>
    (
      run(player, [{ operation: 'enchant', target: inv(0), ...op }]).value as {
        reason?: string
      }
    ).reason

  it('CONTRATO FEAT-17: notEnchantable, enchantSlotUnavailable e replaceIndexRequired vÃªm antes de materiais e ouro', () => {
    const poor = { gold: 0 }
    expect(
      reason(
        { ...poor, ...ARCANE, inventory: [sword()] },
        {
          enchantmentId: 'ember-edge',
          extra: true,
        }
      )
    ).toBe('notEnchantable')
    expect(
      reason({ ...poor, inventory: [rune()] }, { enchantmentId: 'ward' })
    ).toBe('enchantSlotUnavailable')
    expect(
      reason(
        {
          ...poor,
          inventory: [rune(at(0, { enchantments: [applied(FROST, 0)] }))],
        },
        { enchantmentId: 'ember-edge' }
      )
    ).toBe('replaceIndexRequired')
  })

  it('D-139: com extra: true o replaceIndex Ã© ignorado', () => {
    const outcome = run(
      { gold: 100, inventory: [rune()], ...ARCANE },
      [
        {
          operation: 'enchant',
          target: inv(0),
          enchantmentId: 'ward',
          extra: true,
          replaceIndex: 99,
        },
      ],
      rolls(13)
    )
    if (outcome.isLeft()) throw new Error(outcome.value.reason)
    expect(outcome.value.player.inventory).toEqual([
      rune(at(0, { enchantments: [applied(WARD, null)] })),
    ])
  })

  it('D-139: substituir tira o antigo e pÃµe o novo no fim da lista, no mesmo slotIndex', () => {
    const outcome = run(
      {
        gold: 50,
        inventory: [
          twin(at(0, { enchantments: [applied(EMBER, 0), applied(EMBER, 1)] })),
        ],
      },
      [
        {
          operation: 'enchant',
          target: inv(0),
          enchantmentId: 'frost-edge',
          replaceIndex: 0,
        },
      ],
      rolls(10)
    )
    if (outcome.isLeft()) throw new Error(outcome.value.reason)
    expect(outcome.value.player.inventory).toEqual([
      twin(at(0, { enchantments: [applied(EMBER, 1), applied(FROST, 0)] })),
    ])
  })
})

describe('Oficina do Artífice — lote e projeção (REQ-153; D-133, D-140)', () => {
  const workshop = (
    player: Partial<TPlayerState>,
    operations: TBlacksmithOperation[],
    rng = rolls()
  ) =>
    applyBlacksmithOperations({
      player: makePlayerState({ playerClasses: ARTIFICER, ...player }),
      config,
      cards: CARDS,
      operations,
      source: 'workshop',
      zoneId: 'fixture.old-mine',
      enchantments: ENCHANTMENTS,
      actionPointsSpent: 1,
      rng,
    })

  it('REQ-153: conserto com 50% de desconto arredondado para cima (+4 → 7; +3 → 6) e marca de reparo', () => {
    const result = workshop(
      {
        gold: 13,
        inventory: [
          sword(at(4, { broken: true })),
          sword(at(3, { broken: true })),
        ],
      },
      [
        { operation: 'repair', target: inv(0) },
        { operation: 'repair', target: inv(1) },
      ]
    )
    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.result.source).toBe('workshop')
    expect(result.value.result.zoneId).toBe('fixture.old-mine')
    expect(result.value.result.results.map((r) => r.gold)).toEqual([-7, -6])
    expect(result.value.player.gold).toBe(0)
    expect(result.value.player.inventory[0].equipmentState).toEqual(
      at(4, { repairMarks: 1 })
    )
  })

  it('REQ-153: refino até +6 com o +2 no D20; acima → refineLevelTooHigh (depois de refineLevelMax)', () => {
    const rng = rolls(6)
    const result = workshop(
      { gold: 999, inventory: [sword(at(5)), ore(5)] },
      [{ operation: 'refine', target: inv(0) }],
      rng
    )
    expect(result.isRight() && result.value.result.results[0]).toMatchObject({
      targetLevel: 6,
      roll: 6,
      d20Bonus: 2,
      threshold: 8,
      success: true,
    })

    expect(
      workshop({ gold: 999, inventory: [sword(at(5)), ore(5)] }, [
        { operation: 'refine', target: inv(0) },
        { operation: 'refine', target: inv(0) },
      ]).value
    ).toEqual({
      reason: 'refineLevelTooHigh',
      operationIndex: 1,
      cardId: SWORD.id,
    })
    expect(
      workshop({ gold: 999, inventory: [sword(at(10)), ore(5)] }, [
        { operation: 'refine', target: inv(0) },
      ]).value
    ).toEqual({ reason: 'refineLevelMax', operationIndex: 0, cardId: SWORD.id })
  })

  it('REQ-153, D-140: enchant na Oficina → enchantNotAvailable, mesmo com alvo inexistente', () => {
    expect(
      workshop({ inventory: [] }, [
        { operation: 'enchant', target: inv(5), enchantmentId: EMBER.id },
      ]).value
    ).toEqual({ reason: 'enchantNotAvailable', operationIndex: 0 })
  })

  it('REQ-153: zona sem ferreiro com Artífice ativo → só workshop (zoneId null, sem encantamentos), refineSteps até +6 com desconto', () => {
    const view = describeBlacksmith({
      config,
      player: makePlayerState({
        playerClasses: ARTIFICER,
        inventory: [sword(at(4)), sword(at(4, { broken: true }))],
      }),
      cards: CARDS,
      zone: makeZoneCard(),
    })
    expect(view?.zoneId).toBeNull()
    expect(view?.blacksmith).toBeNull()
    expect(view?.enchantments).toEqual([])
    expect(view?.workshop?.equipment).toEqual([
      {
        target: inv(0),
        cardId: SWORD.id,
        state: at(4),
        repair: null,
        refineSteps: [5, 6].map((level) => ({
          targetLevel: level,
          materials: SWORD.refinement!.materials,
          gold: 10 * level,
          threshold: 8,
          d20Bonus: 2,
          breaksOnFailure: false,
        })),
        enchantOptions: [],
      },
      {
        target: inv(1),
        cardId: SWORD.id,
        state: at(4, { broken: true }),
        repair: { gold: 7 },
        refineSteps: [],
        enchantOptions: [],
      },
    ])
  })
})
