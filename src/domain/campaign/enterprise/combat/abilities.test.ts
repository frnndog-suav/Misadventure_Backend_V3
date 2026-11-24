import { describe, expect, it } from 'vitest'

import { makePlayerState } from '../../../../../test/factories/make-party'

import { applyAbilityEffect } from './abilities'

describe('efeito repairEquipment (D-134)', () => {
  it('D-134: tira o broken de cada equipamento em uso e soma 1 marca de reparo, mantendo o refino', () => {
    const player = makePlayerState({
      brokenEquipment: ['weapon', 'shield'],
      equipmentStates: {
        weapon: { refinement: 4, enchantments: [], repairMarks: 1 },
      },
    })

    const repaired = applyAbilityEffect(
      player,
      {
        activation: [{ kind: 'repairEquipment', target: 'self' }],
        duration: { kind: 'immediate' },
        mark: null,
        text: 'Conserta o equipamento.',
      },
      'fixture.tinker-kit',
      'status-1',
      100,
      0
    )

    expect(repaired.brokenEquipment).toEqual([])
    expect(repaired.equipmentStates).toEqual({
      weapon: { refinement: 4, enchantments: [], repairMarks: 2 },
      shield: { refinement: 0, enchantments: [], repairMarks: 1 },
    })
  })
})
