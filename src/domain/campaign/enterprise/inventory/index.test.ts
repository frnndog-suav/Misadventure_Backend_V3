import { describe, expect, it } from 'vitest'

import {
  makeEquipmentCard,
  makeItemCard,
} from '../../../../../test/factories/make-card'
import { addToInventory, freeSlots, stacksInInventory } from '.'

const POTION = makeItemCard({ id: 'p', itemCategory: 'consumable' })
const PICKAXE = makeItemCard({ id: 'k', itemCategory: 'tool' })
const SWORD = makeEquipmentCard({ id: 'w' })

describe('stacksInInventory (REQ-70)', () => {
  it('REQ-70: consumable, material, treasure e booster empilham', () => {
    for (const itemCategory of [
      'consumable',
      'material',
      'treasure',
      'booster',
    ] as const) {
      expect(stacksInInventory(makeItemCard({ itemCategory }))).toBe(true)
    }
  })

  it('REQ-70: relic, tool, document, special e equipment ocupam 1 slot por cópia', () => {
    for (const itemCategory of [
      'relic',
      'tool',
      'document',
      'special',
    ] as const) {
      expect(stacksInInventory(makeItemCard({ itemCategory }))).toBe(false)
    }
    expect(stacksInInventory(makeEquipmentCard())).toBe(false)
  })
})

describe('addToInventory (REQ-70, D-75)', () => {
  it('REQ-70: carta que empilha e já tem slot soma a quantidade sem mudar a posição', () => {
    const result = addToInventory(
      [
        { cardId: 'p', quantity: 2 },
        { cardId: 'k', quantity: 1 },
      ],
      POTION,
      3,
      10
    )

    expect(result).toEqual([
      { cardId: 'p', quantity: 5 },
      { cardId: 'k', quantity: 1 },
    ])
  })

  it('REQ-70: carta que empilha e não tem slot abre um slot no fim', () => {
    expect(
      addToInventory([{ cardId: 'k', quantity: 1 }], POTION, 4, 10)
    ).toEqual([
      { cardId: 'k', quantity: 1 },
      { cardId: 'p', quantity: 4 },
    ])
  })

  it('REQ-70: carta que não empilha abre 1 slot por cópia, cada um com quantity 1', () => {
    expect(addToInventory([], PICKAXE, 2, 10)).toEqual([
      { cardId: 'k', quantity: 1 },
      { cardId: 'k', quantity: 1 },
    ])
    expect(
      addToInventory([{ cardId: 'w', quantity: 1 }], SWORD, 1, 10)
    ).toEqual([
      { cardId: 'w', quantity: 1 },
      { cardId: 'w', quantity: 1 },
    ])
  })

  it('REQ-70/REQ-77: não cabe inteira → null (nada é aceito pela metade)', () => {
    const nine = Array.from({ length: 9 }, () => ({ cardId: 'k', quantity: 1 }))

    expect(addToInventory(nine, PICKAXE, 2, 10)).toBeNull()
    expect(addToInventory(nine, PICKAXE, 1, 10)).toHaveLength(10)
  })

  it('REQ-70: carta que empilha cabe mesmo com o inventário cheio, se já tem slot', () => {
    const full = [
      { cardId: 'p', quantity: 1 },
      ...Array.from({ length: 9 }, () => ({ cardId: 'k', quantity: 1 })),
    ]

    expect(addToInventory(full, POTION, 100, 10)?.[0]).toEqual({
      cardId: 'p',
      quantity: 101,
    })
    expect(
      addToInventory(
        full,
        makeItemCard({ id: 'm', itemCategory: 'material' }),
        1,
        10
      )
    ).toBeNull()
  })

  it('REQ-70: não muda a lista recebida', () => {
    const original = [{ cardId: 'p', quantity: 2 }]
    addToInventory(original, POTION, 3, 10)
    expect(original).toEqual([{ cardId: 'p', quantity: 2 }])
  })
})

describe('freeSlots', () => {
  it('capacidade menos os slots ocupados, nunca abaixo de 0', () => {
    expect(freeSlots([{ cardId: 'p', quantity: 9 }], 10)).toBe(9)
    expect(freeSlots([], 0)).toBe(0)
    expect(freeSlots([{ cardId: 'p', quantity: 1 }], 0)).toBe(0)
  })
})
