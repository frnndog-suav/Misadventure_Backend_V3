import { describe, expect, it } from 'vitest'

import type {
  TCost,
  TEffect,
  THandRequirement,
} from '@/domain/catalog/enterprise/value-objects/effect'
import {
  makeAttributeCard,
  makeEquipmentCard,
  makeItemCard,
} from '../../../../../test/factories/make-card'
import { makePlayerState } from '../../../../../test/factories/make-party'

import { activatableEffects, handPayment } from '.'

const cost = (
  requirements: THandRequirement['requirements'],
  override: Partial<THandRequirement> = {}
): TCost => ({
  kind: 'discardFromHand',
  requirements,
  excludeAttributes: [],
  constraint: 'none',
  random: false,
  ...override,
})

const effect = (cost: readonly TCost[]): TEffect => ({
  text: 'Efeito de teste.',
  trigger: null,
  cost,
  activation: [{ kind: 'gainGold', amount: 10 }],
  duration: { kind: 'immediate' },
  mark: null,
})

describe('Instruções para pagar com cartas na mão (D-102)', () => {
  it.each([
    [
      'atributo singular',
      [cost([{ attribute: 'strength', count: 1 }])],
      1,
      'Escolha 1 carta de Força.',
    ],
    [
      'atributo plural',
      [cost([{ attribute: 'dexterity', count: 2 }])],
      2,
      'Escolha 2 cartas de Destreza.',
    ],
    [
      'qualquer singular',
      [cost([{ attribute: 'any', count: 1 }])],
      1,
      'Escolha 1 carta qualquer.',
    ],
    [
      'qualquer plural',
      [cost([{ attribute: 'any', count: 2 }])],
      2,
      'Escolha 2 cartas quaisquer.',
    ],
    [
      'mesmo atributo',
      [cost([{ attribute: 'any', count: 2 }], { constraint: 'same' })],
      2,
      'Escolha 2 cartas quaisquer do mesmo atributo.',
    ],
    [
      'atributos diferentes',
      [cost([{ attribute: 'any', count: 2 }], { constraint: 'distinct' })],
      2,
      'Escolha 2 cartas quaisquer de atributos diferentes.',
    ],
    [
      'exclusões e restrição',
      [
        cost([{ attribute: 'any', count: 2 }], {
          excludeAttributes: ['strength', 'endurance', 'luck'],
          constraint: 'distinct',
        }),
      ],
      2,
      'Escolha 2 cartas quaisquer (exceto Força, Resistência e Sorte) de atributos diferentes.',
    ],
    [
      'vários custos e partes',
      [
        cost([
          { attribute: 'strength', count: 1 },
          { attribute: 'dexterity', count: 2 },
        ]),
        cost([{ attribute: 'any', count: 3 }]),
        cost([{ attribute: 'luck', count: 4 }], { random: true }),
      ],
      6,
      'Escolha 1 carta de Força, 2 cartas de Destreza e 3 cartas quaisquer.',
    ],
  ] as const)('REQ-101: %s', (_case, costs, count, text) => {
    expect(handPayment(effect(costs))).toEqual({ count, text })
  })

  it('REQ-101: custos aleatórios ou sem descarte não pedem escolha', () => {
    expect(
      handPayment(
        effect([
          { kind: 'spendVigor', amount: 2 },
          cost([{ attribute: 'any', count: 1 }], { random: true }),
        ])
      )
    ).toBeNull()
  })
})

describe('Efeitos disponíveis', () => {
  const strength = makeAttributeCard()
  const vigor = effect([{ kind: 'spendVigor', amount: 5 }])
  const discard = effect([cost([{ attribute: 'strength', count: 1 }])])
  const potion = makeItemCard({
    id: 'potion',
    effects: [effect([{ kind: 'consumeSelf' }])],
  })
  const helmet = makeEquipmentCard({
    id: 'helmet',
    slot: 'head',
    effects: [vigor],
  })
  const amulet = makeEquipmentCard({
    id: 'amulet',
    slot: 'accessory',
    effects: [vigor, discard, effect([])],
  })
  const cards = [strength, helmet, amulet, potion]

  it('REQ-101: inventário antes dos slots, sem repetir pilha e com instrução mesmo antes da escolha', () => {
    const player = makePlayerState({
      inventory: [{ cardId: potion.id, quantity: 2 }],
      equipment: {
        ...makePlayerState().equipment,
        head: helmet.id,
        accessory: amulet.id,
      },
      hand: [strength.id],
    })

    expect(activatableEffects(player, cards)).toEqual([
      {
        cardId: potion.id,
        effectIndex: 0,
        source: 'inventory',
        handPayment: null,
      },
      {
        cardId: helmet.id,
        effectIndex: 0,
        source: 'equipment',
        handPayment: null,
      },
      {
        cardId: amulet.id,
        effectIndex: 0,
        source: 'equipment',
        handPayment: null,
      },
      {
        cardId: amulet.id,
        effectIndex: 1,
        source: 'equipment',
        handPayment: { count: 1, text: 'Escolha 1 carta de Força.' },
      },
    ])
  })

  it('REQ-101: oculta efeito passivo, equipamento fora de uso e custos impagáveis', () => {
    const player = makePlayerState({
      inventory: [{ cardId: helmet.id, quantity: 1 }],
      equipment: { ...makePlayerState().equipment, accessory: amulet.id },
      hand: [],
      vigor: 4,
    })

    expect(activatableEffects(player, cards)).toEqual([])
  })
})
