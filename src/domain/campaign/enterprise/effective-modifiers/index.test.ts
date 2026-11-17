import { describe, expect, it } from 'vitest'

import { makeEquipmentCard } from '../../../../../test/factories/make-card'
import type { TModifier } from '@/domain/catalog/enterprise/value-objects/card'
import { effectiveModifiers } from '.'

const BASE: Record<TModifier, number> = {
  attack: 5,
  defense: 3,
  accuracy: 50,
  evasion: 20,
  celerity: 10,
  piercing: 0,
  reflection: 0,
}

describe('effectiveModifiers (REQ-71)', () => {
  it('REQ-71: sem equipamentos, ⌊base × (100 + Pico) ÷ 100⌋ (Ataque 5, Pico 10 → 5)', () => {
    expect(
      effectiveModifiers({ modifiers: BASE, peak: 10, equipment: [] })
    ).toEqual({
      attack: 5,
      defense: 3,
      accuracy: 55,
      evasion: 22,
      celerity: 11,
      piercing: 0,
      reflection: 0,
    })
  })

  it('REQ-71: arma +12 de Ataque, Pico 10 → ⌊17 × 110 ÷ 100⌋ = 18', () => {
    const sword = makeEquipmentCard({
      modifiers: [{ modifier: 'attack', value: 12 }],
    })

    const result = effectiveModifiers({
      modifiers: BASE,
      peak: 10,
      equipment: [sword],
    })

    expect(result.attack).toBe(18)
    expect(result.defense).toBe(3)
  })

  it('REQ-71: soma os valores de todos os equipamentos em uso para o mesmo modificador', () => {
    const sword = makeEquipmentCard({
      modifiers: [{ modifier: 'attack', value: 2 }],
    })
    const ring = makeEquipmentCard({
      id: 'ring',
      slot: 'accessory',
      modifiers: [
        { modifier: 'attack', value: 3 },
        { modifier: 'evasion', value: 5 },
      ],
    })

    const result = effectiveModifiers({
      modifiers: BASE,
      peak: 0,
      equipment: [sword, ring],
    })

    expect(result.attack).toBe(10)
    expect(result.evasion).toBe(25)
  })

  it('REQ-71 (7.3 item 8): equipamento com Pico abaixo do requisito não soma', () => {
    const helm = makeEquipmentCard({
      slot: 'head',
      modifiers: [{ modifier: 'defense', value: 10 }],
      peakRequirement: 50,
    })

    expect(
      effectiveModifiers({ modifiers: BASE, peak: 10, equipment: [helm] })
        .defense
    ).toBe(3)
    expect(
      effectiveModifiers({ modifiers: BASE, peak: 50, equipment: [helm] })
        .defense
    ).toBe(19)
  })

  it('REQ-71: Pico igual ao requisito funciona', () => {
    const helm = makeEquipmentCard({
      slot: 'head',
      modifiers: [{ modifier: 'defense', value: 7 }],
      peakRequirement: 10,
    })

    expect(
      effectiveModifiers({ modifiers: BASE, peak: 10, equipment: [helm] })
        .defense
    ).toBe(11)
  })

  it('REQ-71 (etapa 5): nunca abaixo de 0, mesmo com valor negativo', () => {
    const cursed = makeEquipmentCard({
      modifiers: [{ modifier: 'attack', value: -20 }],
    })

    expect(
      effectiveModifiers({ modifiers: BASE, peak: 10, equipment: [cursed] })
        .attack
    ).toBe(0)
  })

  it('REQ-71: arredonda para baixo só no fim', () => {
    // (3 + 0) × 105 ÷ 100 = 3,15 → 3
    expect(
      effectiveModifiers({ modifiers: BASE, peak: 5, equipment: [] }).defense
    ).toBe(3)
  })
})
