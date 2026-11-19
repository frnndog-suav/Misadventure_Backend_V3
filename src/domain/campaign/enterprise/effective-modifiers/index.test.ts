import { describe, expect, it } from 'vitest'

import { makeEquipmentCard } from '../../../../../test/factories/make-card'
import type { TModifier } from '@/domain/catalog/enterprise/value-objects/card'
import type { TEffect } from '@/domain/catalog/enterprise/value-objects/effect'

import type { TPlayerStatus } from '../player-status'
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

describe('effectiveModifiers (REQ-102)', () => {
  const passive: TEffect = {
    text: '+20% de Defesa enquanto estiver em uso.',
    trigger: null,
    cost: [],
    activation: [
      {
        kind: 'modifierPercent',
        changes: [{ modifier: 'defense', percent: 20 }],
      },
    ],
    duration: { kind: 'whileSourceActive' },
    mark: 'buff',
  }

  it('REQ-102: Defesa 5 + armadura 10, Pico 10 e passivo de 20% resultam em 19', () => {
    const armor = makeEquipmentCard({
      modifiers: [{ modifier: 'defense', value: 10 }],
      effects: [passive],
    })
    const input = { modifiers: { ...BASE, defense: 5 }, peak: 10 }
    expect(effectiveModifiers({ ...input, equipment: [armor] }).defense).toBe(
      19
    )
    expect(
      effectiveModifiers({
        ...input,
        equipment: [{ ...armor, peakRequirement: 11 }],
      }).defense
    ).toBe(5)
  })

  it('REQ-102: aplica fixos antes do Pico e soma os percentuais de passivos e status', () => {
    const armor = makeEquipmentCard({ modifiers: [], effects: [passive] })
    const result = effectiveModifiers({
      modifiers: BASE,
      peak: 10,
      equipment: [armor],
      statuses: [
        {
          statusId: 'status-1',
          sourceCardId: 'fixture.tonic',
          effectIndex: 0,
          text: 'Defesa reforçada.',
          mark: 'buff',
          duration: { kind: 'infinite' },
          remaining: null,
          activation: [
            {
              kind: 'modifierFlat',
              changes: [{ modifier: 'defense', amount: 7 }],
            },
            {
              kind: 'modifierPercent',
              changes: [{ modifier: 'defense', percent: 30 }],
            },
          ],
        },
      ],
    })
    expect(result.defense).toBe(16)
    expect(result.attack).toBe(5)
  })

  it('REQ-102 (7.3 item 8): status do equipamento fica suspenso enquanto o Pico é insuficiente', () => {
    const armor = makeEquipmentCard({ modifiers: [], peakRequirement: 10 })
    const status: TPlayerStatus = {
      statusId: 'armor-buff',
      sourceCardId: armor.id,
      effectIndex: 0,
      text: '+5 de Defesa.',
      mark: 'buff',
      activation: [
        { kind: 'modifierFlat', changes: [{ modifier: 'defense', amount: 5 }] },
      ],
      duration: { kind: 'infinite' },
      remaining: null,
    }
    const input = {
      equipment: [armor],
      modifiers: BASE,
      statuses: [
        status,
        { ...status, statusId: 'tonic-buff', sourceCardId: 'fixture.tonic' },
      ],
    }

    expect(effectiveModifiers({ ...input, peak: 9 }).defense).toBe(8)
    expect(effectiveModifiers({ ...input, peak: 10 }).defense).toBe(14)
  })

  it('REQ-102: resultado inteiro de Pico e percentual fica inteiro antes do piso', () => {
    const armor = makeEquipmentCard({
      modifiers: [{ modifier: 'defense', value: 17 }],
      effects: [
        {
          ...passive,
          activation: [
            {
              kind: 'modifierPercent',
              changes: [{ modifier: 'defense', percent: 16 }],
            },
          ],
        },
      ],
    })
    expect(
      effectiveModifiers({ modifiers: BASE, peak: 25, equipment: [armor] })
        .defense
    ).toBe(29)
  })

  it('REQ-102: aplica fator mínimo zero e piso zero ao resultado', () => {
    const armor = makeEquipmentCard({
      modifiers: [],
      effects: [
        {
          ...passive,
          activation: [
            {
              kind: 'modifierPercent',
              changes: [{ modifier: 'defense', percent: -70 }],
            },
            {
              kind: 'modifierPercent',
              changes: [{ modifier: 'defense', percent: -50 }],
            },
            {
              kind: 'modifierFlat',
              changes: [
                { modifier: 'attack', amount: -10 },
                { modifier: 'defense', amount: -10 },
              ],
            },
          ],
        },
      ],
    })
    const result = effectiveModifiers({
      modifiers: BASE,
      peak: 10,
      equipment: [armor],
    })
    expect(result.defense).toBe(0)
    expect(result.attack).toBe(0)
  })

  it('REQ-102: ignora efeitos com custo, gatilho, outra duração ou ativação fora do pipeline', () => {
    const armor = makeEquipmentCard({
      modifiers: [],
      effects: [
        { ...passive, cost: [{ kind: 'consumeSelf' }] },
        {
          ...passive,
          trigger: { kind: 'onEnterZoneTitle', zoneTitle: 'Mina' },
        },
        { ...passive, duration: { kind: 'infinite' } },
        {
          ...passive,
          activation: [
            ...passive.activation,
            { kind: 'zeroModifiers', modifiers: ['defense'] },
          ],
        },
      ],
    })
    expect(
      effectiveModifiers({
        modifiers: { ...BASE, defense: 5 },
        peak: 10,
        equipment: [armor],
      }).defense
    ).toBe(5)
  })
})

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
