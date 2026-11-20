import { describe, expect, it, vi } from 'vitest'

import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { makePlayerState } from '../../../../../test/factories/make-party'
import { effectiveModifiers } from '../effective-modifiers'
import { advanceCombatTurn, resolveCombatDamage } from '.'

describe('T-46 — turnos de combate', () => {
  it('REQ-118: mantém a ordem no ciclo e recalcula a Celeridade dos vivos no seguinte', () => {
    const participants = [
      { id: 'player', side: 'player', celerity: 10, health: 10 },
      { id: 'first', side: 'enemy', celerity: 8, health: 10 },
      { id: 'second', side: 'enemy', celerity: 20, health: 10 },
      { id: 'defeated', side: 'enemy', celerity: 30, health: 0 },
    ] as const
    const order = ['first', 'defeated', 'player', 'second']
    expect(
      advanceCombatTurn({ cycle: 1, order, actorId: 'first', participants })
    ).toMatchObject({ cycle: 1, order, actorId: 'player' })
    expect(
      advanceCombatTurn({ cycle: 1, order, actorId: 'second', participants })
    ).toMatchObject({
      cycle: 2,
      order: ['second', 'player', 'first'],
      actorId: 'second',
    })
  })
})

const target = {
  id: 'first',
  health: 10,
  defense: 3,
  evasion: 5,
  reflection: 2,
  element: 'fire',
  resistant: false,
  immune: false,
  shield: false,
} as const

const attack = {
  kind: 'attack',
  form: 'basic',
  attack: 9,
  accuracy: 0,
  piercing: 8,
  element: 'water',
  targets: [target],
  config: GAME_CONFIG_DEFAULTS,
} as const

describe('T-46 — dano de combate', () => {
  it('REQ-120: inclui Poder antes do Pico e soma Exaustão ao fator percentual', () => {
    expect(
      effectiveModifiers({
        modifiers: { ...makePlayerState().modifiers, attack: 10 },
        peak: 20,
        equipment: [],
        combat: {
          power: 5,
          exhaustionPenaltyPercent:
            GAME_CONFIG_DEFAULTS.exhaustionPenaltyPercent,
        },
        statuses: [
          {
            statusId: 'buff-attack',
            sourceCardId: 'fixture.tonic',
            effectIndex: 0,
            text: '+30% de Ataque.',
            mark: 'buff',
            duration: { kind: 'infinite' },
            remaining: null,
            activation: [
              {
                kind: 'modifierPercent',
                changes: [{ modifier: 'attack', percent: 30 }],
              },
            ],
          },
        ],
      }).attack
    ).toBe(21)
  })

  it('REQ-120: Precisão zero erra sem rolar', () => {
    const roll = vi.fn(() => 0)
    expect(resolveCombatDamage({ ...attack, roll })).toEqual([
      { targetId: 'first', hit: false, damage: 0, reflectedDamage: 0 },
    ])
    expect(roll).not.toHaveBeenCalled()
  })

  it('REQ-120: Área dispensa acerto e aplica Perfuração, elemento e Reflexão por alvo', () => {
    const roll = vi.fn(() => 0)
    expect(
      resolveCombatDamage({
        ...attack,
        form: 'area',
        targets: [target, { ...target, id: 'second', reflection: 9 }],
        roll,
      })
    ).toEqual([
      { targetId: 'first', hit: true, damage: 3, reflectedDamage: 2 },
      { targetId: 'second', hit: true, damage: 0, reflectedDamage: 5 },
    ])
    expect(roll).not.toHaveBeenCalled()
  })

  it('REQ-120: usa uma rolagem quando o ataque dirigido testa acerto', () => {
    const roll = vi.fn(() => 0)
    expect(resolveCombatDamage({ ...attack, accuracy: 5, roll })).toEqual([
      { targetId: 'first', hit: true, damage: 9, reflectedDamage: 2 },
    ])
    expect(roll).toHaveBeenCalledTimes(1)
  })

  it('REQ-120: dano de efeito em Área aplica elemento e resistência sem reduzir pela forma', () => {
    const roll = vi.fn(() => 0)
    expect(
      resolveCombatDamage({
        kind: 'effect',
        amount: 9,
        element: 'water',
        targets: [
          { ...target, resistant: true },
          { ...target, id: 'second', immune: true },
        ],
        config: GAME_CONFIG_DEFAULTS,
        roll,
      })
    ).toEqual([
      { targetId: 'first', hit: null, damage: 5, reflectedDamage: 0 },
      { targetId: 'second', hit: null, damage: 0, reflectedDamage: 0 },
    ])
    expect(roll).not.toHaveBeenCalled()
  })
})
