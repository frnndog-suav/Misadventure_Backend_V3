import { describe, expect, it } from 'vitest'

import { makeEquipmentCard } from '../../../../../test/factories/make-card'
import type { TBlacksmithEnchantment } from '@/domain/catalog/enterprise/value-objects/card'

import {
  DEFAULT_EQUIPMENT_STATE,
  applyEquipmentState,
  compactEquipmentState,
  enchantmentActive,
  isDefaultEquipmentState,
  type TAppliedEnchantment,
  type TEquipmentState,
} from '.'

const ELEMENT: TBlacksmithEnchantment = {
  id: 'ember-edge',
  name: 'Fio de Brasa',
  kind: 'element',
  element: 'fire',
  bonusPercent: 10,
  materials: [],
}
const applied = (
  slotIndex: number | null,
  enchantment: TBlacksmithEnchantment = ELEMENT
): TAppliedEnchantment => ({
  enchantment,
  zoneId: 'fixture.gray-harbor',
  slotIndex,
})
const state = (override: Partial<TEquipmentState> = {}): TEquipmentState => ({
  ...DEFAULT_EQUIPMENT_STATE,
  ...override,
})
const sword = makeEquipmentCard({
  modifiers: [{ modifier: 'attack', value: 12 }],
  refinement: { maxLevel: 10, materials: [] },
  enchantment: { slots: [{ kind: 'element', minRefinement: 2 }] },
})

describe('equipment-state (REQ-147)', () => {
  it('REQ-147: o estado padrão é 0, [], 0, false e se reconhece como padrão', () => {
    expect(DEFAULT_EQUIPMENT_STATE).toEqual({
      refinement: 0,
      enchantments: [],
      repairMarks: 0,
      broken: false,
    })
    expect(isDefaultEquipmentState(DEFAULT_EQUIPMENT_STATE)).toBe(true)
    expect(isDefaultEquipmentState(undefined)).toBe(true)
    expect(isDefaultEquipmentState(state({ refinement: 1 }))).toBe(false)
    expect(isDefaultEquipmentState(state({ broken: true }))).toBe(false)
    expect(isDefaultEquipmentState(state({ repairMarks: 1 }))).toBe(false)
    expect(isDefaultEquipmentState(state({ enchantments: [applied(0)] }))).toBe(
      false
    )
  })

  it('REQ-147: compactEquipmentState devolve undefined para o padrão e o próprio estado nos demais', () => {
    expect(compactEquipmentState(DEFAULT_EQUIPMENT_STATE)).toBeUndefined()
    const refined = state({ refinement: 3 })
    expect(compactEquipmentState(refined)).toBe(refined)
  })
})

describe('enchantmentActive (REQ-148)', () => {
  it('REQ-148: ligado se refino ≥ minRefinement do slot; desligado abaixo', () => {
    expect(enchantmentActive(applied(0), sword, state({ refinement: 2 }))).toBe(
      true
    )
    expect(enchantmentActive(applied(0), sword, state({ refinement: 1 }))).toBe(
      false
    )
  })

  it('REQ-148: o extra está sempre ligado, sem requisito de refino', () => {
    expect(enchantmentActive(applied(null), sword, state())).toBe(true)
  })

  it('REQ-148: equipamento quebrado desliga tudo, até o extra', () => {
    expect(
      enchantmentActive(applied(null), sword, state({ broken: true }))
    ).toBe(false)
    expect(
      enchantmentActive(
        applied(0),
        sword,
        state({ refinement: 5, broken: true })
      )
    ).toBe(false)
  })
})

describe('applyEquipmentState (REQ-148)', () => {
  it('REQ-148: o modificador principal ganha refino × 5% do valor base (+12 em +5 → +15)', () => {
    const result = applyEquipmentState(sword, state({ refinement: 5 }), 5)
    expect(result.modifiers[0]).toEqual({ modifier: 'attack', value: 15 })
  })

  it('REQ-148: só o primeiro modificador é refinado e os decimais ficam (7 em +3 → 8,05)', () => {
    const card = makeEquipmentCard({
      modifiers: [
        { modifier: 'defense', value: 7 },
        { modifier: 'attack', value: 4 },
      ],
    })
    const result = applyEquipmentState(card, state({ refinement: 3 }), 5)
    expect(result.modifiers[0].value).toBeCloseTo(8.05, 10)
    expect(result.modifiers[1]).toEqual({ modifier: 'attack', value: 4 })
  })

  it('REQ-148: sem refino nem encantamento ligado devolve a própria carta', () => {
    expect(applyEquipmentState(sword, undefined, 5)).toBe(sword)
    expect(
      applyEquipmentState(sword, state({ enchantments: [applied(0)] }), 5)
    ).toBe(sword)
  })

  it('REQ-148: encantamento de efeito ligado soma seus efeitos; desligado, não', () => {
    const effect = {
      text: '+2 de Defesa',
      trigger: null,
      cost: [],
      activation: [
        {
          kind: 'modifierFlat' as const,
          changes: [{ modifier: 'defense' as const, amount: 2 }],
        },
      ],
      duration: { kind: 'whileSourceActive' as const },
      mark: 'buff' as const,
    }
    const enchantment: TBlacksmithEnchantment = {
      id: 'warding',
      name: 'Proteção',
      kind: 'effect',
      effects: [effect],
      abilities: [],
      materials: [],
    }
    const card = makeEquipmentCard({
      enchantment: { slots: [{ kind: 'effect', minRefinement: 3 }] },
      effects: [],
    })
    const on = applyEquipmentState(
      card,
      state({ refinement: 3, enchantments: [applied(0, enchantment)] }),
      5
    )
    expect(on.effects).toEqual([effect])
    const off = applyEquipmentState(
      card,
      state({ refinement: 2, enchantments: [applied(0, enchantment)] }),
      5
    )
    expect(off.effects).toEqual([])
  })
})
