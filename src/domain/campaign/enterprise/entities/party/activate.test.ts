import { describe, expect, it } from 'vitest'

import { activatableEffects } from '@/domain/campaign/enterprise/activatable-effects'
import { availableActions } from '@/domain/campaign/enterprise/available-actions'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
  PartyMember,
  type TPlayerState,
} from '@/domain/campaign/enterprise/entities/party-member'
import type {
  TEffect,
  THandRequirement,
} from '@/domain/catalog/enterprise/value-objects/effect'
import {
  makeAttributeCard,
  makeEquipmentCard,
  makeItemCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

const NOW = fixedClock().now()
const LATER = fixedClock('2026-11-19T16:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')
const STRENGTH = makeAttributeCard({
  id: 'fixture.strength-basic',
  attributes: ['strength'],
})
const ENDURANCE = makeAttributeCard({
  id: 'fixture.endurance-basic',
  attributes: ['endurance'],
})

const effect = (override: Partial<TEffect>): TEffect => ({
  text: 'Efeito de teste.',
  trigger: null,
  cost: [{ kind: 'spendVigor', amount: 5 }],
  activation: [{ kind: 'gainGold', amount: 10 }],
  duration: { kind: 'immediate' },
  mark: null,
  ...override,
})

const chosen: THandRequirement = {
  requirements: [{ attribute: 'strength', count: 1 }],
  excludeAttributes: [],
  constraint: 'none',
  random: false,
}

const AMULET = makeEquipmentCard({
  id: 'fixture.focus-amulet',
  slot: 'accessory',
  effects: [
    effect({}),
    effect({
      cost: [{ kind: 'donateLife', amount: 5 }],
      activation: [{ kind: 'restoreVigor', amount: 5 }],
    }),
    effect({
      cost: [{ kind: 'discardFromHand', ...chosen }],
      activation: [{ kind: 'drawCards', count: 2 }],
    }),
  ],
})

const POTION = makeItemCard({
  id: 'fixture.healing-potion',
  itemCategory: 'consumable',
  effects: [
    effect({
      cost: [{ kind: 'consumeSelf' }],
      activation: [{ kind: 'heal', amount: 5 }],
    }),
  ],
})

const TONIC = makeItemCard({
  id: 'fixture.strength-tonic',
  itemCategory: 'consumable',
  effects: [
    effect({
      text: '+3 de Ataque durante 2 vezes suas.',
      cost: [{ kind: 'consumeSelf' }],
      activation: [
        { kind: 'modifierFlat', changes: [{ modifier: 'attack', amount: 3 }] },
      ],
      duration: { kind: 'forOwnTurns', turns: 2 },
      mark: 'buff',
    }),
  ],
})

const CARDS = [AMULET, POTION, TONIC, STRENGTH, ENDURANCE]
const inventory = (cardId: string, quantity = 1) => ({ cardId, quantity })
const amuletEquipped = { ...makePlayerState().equipment, accessory: AMULET.id }

function setup(player: Partial<TPlayerState> = {}, idle = false) {
  return makeParty({
    status: idle ? 'idle' : 'inSession',
    members: [
      PartyMember.create(
        {
          characterName: 'Lia',
          kind: 'human',
          player: makePlayerState(player),
        },
        MEMBER
      ),
    ],
    turn: { round: 1, memberId: MEMBER, actionPoints: 0 },
    savedAt: NOW,
  })
}

type TestParty = ReturnType<typeof setup>
const playerOf = (party: TestParty) => party.members[0].player
const activate = (
  party: TestParty,
  cardId: string,
  effectIndex = 0,
  payment?: { handCards: string[] },
  cards: readonly (typeof CARDS)[number][] = CARDS
) =>
  party.prepare(
    { operation: 'activate', cardId, effectIndex, payment },
    { cards },
    LATER,
    sequentialIds('status')
  )

describe('Preparar: ativar', () => {
  it('REQ-104: gasta Vigor, ganha ouro até o teto e pode repetir com zero pontos sem consumir RNG', () => {
    const party = setup({ equipment: amuletEquipped, gold: 285 })
    const rngState = party.rngState

    expect(activate(party, AMULET.id).isRight()).toBe(true)
    expect(playerOf(party)).toMatchObject({ vigor: 5, gold: 295 })
    expect(activate(party, AMULET.id).isRight()).toBe(true)

    expect(playerOf(party)).toMatchObject({ vigor: 0, gold: 300 })
    expect(party.turn.actionPoints).toBe(0)
    expect(party.savedAt).toEqual(LATER)
    expect(party.rngState).toEqual(rngState)
    expect(party.pullDomainEvents()[0]).toMatchObject({
      type: 'EffectActivated',
      cardId: AMULET.id,
      effectIndex: 0,
      memberId: MEMBER,
    })
  })

  it('REQ-104: doa vida até zero e restaura Vigor até o Pico', () => {
    const party = setup({ equipment: amuletEquipped, health: 5, vigor: 8 })

    expect(activate(party, AMULET.id, 1).isRight()).toBe(true)

    expect(playerOf(party)).toMatchObject({ health: 0, vigor: 10 })
  })

  it('REQ-104: consome uma unidade, limita a cura e registra o envio ao limbo', () => {
    const party = setup({ inventory: [inventory(POTION.id, 2)], health: 20 })

    expect(activate(party, POTION.id).isRight()).toBe(true)

    expect(playerOf(party)).toMatchObject({
      health: 22,
      inventory: [inventory(POTION.id)],
    })
    const events = party.pullDomainEvents()
    expect(events[0]).toMatchObject({
      type: 'EffectActivated',
      cardId: POTION.id,
    })
    expect(events.at(-1)).toMatchObject({
      type: 'SentToLimbo',
      cardId: POTION.id,
      quantity: 1,
      from: 'inventory',
    })
  })

  it('REQ-104: descarta a carta selecionada e compra do topo do deck', () => {
    const party = setup({
      equipment: amuletEquipped,
      hand: [STRENGTH.id],
      deck: [ENDURANCE.id, STRENGTH.id, ENDURANCE.id],
    })

    expect(
      activate(party, AMULET.id, 2, { handCards: [STRENGTH.id] }).isRight()
    ).toBe(true)

    expect(playerOf(party)).toMatchObject({
      hand: [ENDURANCE.id, STRENGTH.id],
      discard: [STRENGTH.id],
      deck: [ENDURANCE.id],
    })
  })

  it('REQ-103, REQ-104, REQ-107: copia a descrição e regras do status, emite o status após o limbo e preserva no save em memória', async () => {
    const party = setup({ inventory: [inventory(TONIC.id)] })
    const repo = new InMemoryPartiesRepository()
    await repo.create(party)

    expect(activate(party, TONIC.id).isRight()).toBe(true)

    const original = TONIC.effects[0]
    const status = playerOf(party).statuses[0]
    expect(status).toMatchObject({
      sourceCardId: TONIC.id,
      effectIndex: 0,
      text: original.text,
      mark: 'buff',
      activation: original.activation,
      duration: original.duration,
      remaining: 2,
    })
    expect(status.activation).not.toBe(original.activation)
    expect(status.duration).not.toBe(original.duration)
    expect(party.pullDomainEvents().slice(-2)).toMatchObject([
      { type: 'SentToLimbo', cardId: TONIC.id },
      { type: 'StatusApplied', statusId: status.statusId },
    ])
    await repo.save(party)
    expect(
      (await repo.findById(party.id.toString()))?.members[0].player.statuses
    ).toEqual([status])
  })

  it.each([
    ['inativo', () => setup({}, true), 'unknown', 99, 'sessionNotActive'],
    [
      'sem posse',
      () => setup({}),
      'unknown',
      99,
      { reason: 'notOwned', cardId: 'unknown' },
    ],
    [
      'equipamento no inventário',
      () => setup({ inventory: [inventory(AMULET.id)] }),
      AMULET.id,
      99,
      { reason: 'equipmentNotInUse' },
    ],
    [
      'índice inexistente',
      () => setup({ equipment: amuletEquipped }),
      AMULET.id,
      99,
      { reason: 'effectNotFound' },
    ],
    [
      'Vigor insuficiente',
      () => setup({ equipment: amuletEquipped, vigor: 4 }),
      AMULET.id,
      0,
      { reason: 'notEnoughVigor' },
    ],
    [
      'vida insuficiente',
      () => setup({ equipment: amuletEquipped, health: 4 }),
      AMULET.id,
      1,
      { reason: 'notEnoughLife' },
    ],
    [
      'sem escolha',
      () => setup({ equipment: amuletEquipped }),
      AMULET.id,
      2,
      { reason: 'paymentInvalid' },
    ],
  ] as const)(
    'REQ-105: recusa %s sem mudar o grupo',
    (_label, make, cardId, index, error) => {
      const party = make()
      const player = playerOf(party)
      const rngState = party.rngState
      const result = activate(party, cardId, index)

      expect(result.isLeft()).toBe(true)
      expect(result.value).toEqual(error)
      expect(playerOf(party)).toEqual(player)
      expect(party.savedAt).toEqual(NOW)
      expect(party.rngState).toEqual(rngState)
      expect(party.pullDomainEvents()).toEqual([])
    }
  )

  it('REQ-105: informa o id da carta escolhida com atributo inválido', () => {
    const party = setup({ equipment: amuletEquipped, hand: [ENDURANCE.id] })

    expect(
      activate(party, AMULET.id, 2, { handCards: [ENDURANCE.id] }).value
    ).toEqual({
      reason: 'paymentInvalid',
      cardId: ENDURANCE.id,
    })
  })
})

describe('Custos em sequência e condições', () => {
  function resource(testEffect: TEffect) {
    return makeItemCard({
      id: 'fixture.test-resource',
      itemCategory: 'treasure',
      effects: [testEffect],
    })
  }

  it('REQ-104 (13.3): dividir a vida pela metade arredonda a vida restante para cima', () => {
    const card = resource(
      effect({ activation: [{ kind: 'loseLife', amount: 'halfHealth' }] })
    )
    const party = setup({ inventory: [inventory(card.id)], health: 5 })

    expect(activate(party, card.id, 0, undefined, [card]).isRight()).toBe(true)
    expect(playerOf(party).health).toBe(3)
  })

  it('REQ-104: calcula o segundo custo com o saldo do primeiro e aplica perdas com piso zero', () => {
    const card = resource(
      effect({
        cost: [
          { kind: 'payGold', amount: 5 },
          {
            kind: 'payGold',
            amount: { base: 'halfGold', multiplier: 1, minimum: 0 },
          },
          { kind: 'reducePeak', amount: null, percent: 50 },
        ],
        activation: [
          { kind: 'gainPeak', amount: 1 },
          { kind: 'loseGold', amount: 10 },
          { kind: 'loseLife', amount: 30 },
        ],
      })
    )
    const party = setup({
      inventory: [inventory(card.id)],
      gold: 14,
      peak: 10,
      vigor: 10,
    })

    expect(activate(party, card.id, 0, undefined, [card]).isRight()).toBe(true)

    expect(playerOf(party)).toMatchObject({
      gold: 0,
      health: 0,
      peak: 6,
      vigor: 5,
    })
    expect(party.pullDomainEvents().map(({ type }) => type)).toEqual([
      'EffectActivated',
      'EffectCostPaid',
      'EffectCostPaid',
      'EffectCostPaid',
      'EffectActivationApplied',
      'EffectActivationApplied',
      'EffectActivationApplied',
    ])
  })

  it.each([
    ['notEnoughGold', effect({ cost: [{ kind: 'payGold', amount: 11 }] })],
    [
      'notEnoughPeak',
      effect({ cost: [{ kind: 'reducePeak', amount: 11, percent: null }] }),
    ],
    [
      'minimumNotMet',
      effect({
        cost: [
          {
            kind: 'payGold',
            amount: { base: 'halfGold', multiplier: 1, minimum: 6 },
          },
        ],
      }),
    ],
    ['notActivatable', effect({ cost: [] })],
    ['notActivatable', effect({ trigger: { kind: 'onPeakLost' } })],
    [
      'notActivatableYet',
      effect({ activation: [{ kind: 'diceResultModifier', amount: 3 }] }),
    ],
    [
      'notActivatableYet',
      effect({ activation: [{ kind: 'removeDebuffs', target: 'allyInZone' }] }),
    ],
  ] as const)('REQ-105: recusa %s', (reason, testEffect) => {
    const card = resource(testEffect)
    const party = setup({ inventory: [inventory(card.id)] })

    expect(activate(party, card.id, 0, undefined, [card]).value).toEqual({
      reason,
    })
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-105: equipamento em uso com Pico insuficiente é recusado antes do índice', () => {
    const card = makeEquipmentCard({
      id: AMULET.id,
      peakRequirement: 11,
      slot: 'accessory',
    })
    const party = setup({
      equipment: amuletEquipped,
      inventory: [inventory(card.id)],
    })

    expect(activate(party, card.id, 99, undefined, [card]).value).toEqual({
      reason: 'peakRequirementNotMet',
    })
  })

  it('REQ-105: um custo posterior não pago preserva o ouro e o RNG dos custos anteriores', () => {
    const card = resource(
      effect({
        cost: [
          { kind: 'payGold', amount: 5 },
          { kind: 'discardFromHand', ...chosen, random: true },
          { kind: 'payGold', amount: 6 },
        ],
      })
    )
    const party = setup({
      inventory: [inventory(card.id)],
      hand: [STRENGTH.id, STRENGTH.id],
    })
    const before = playerOf(party)
    const rngState = party.rngState

    expect(
      activate(party, card.id, 0, undefined, [card, STRENGTH]).value
    ).toEqual({ reason: 'notEnoughGold' })
    expect(playerOf(party)).toEqual(before)
    expect(party.rngState).toEqual(rngState)
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-104: o descarte aleatório avança o RNG e repete o resultado com a mesma semente', () => {
    const card = resource(
      effect({
        cost: [
          {
            kind: 'discardFromHand',
            ...chosen,
            requirements: [{ attribute: 'any', count: 1 }],
            random: true,
          },
        ],
      })
    )
    const state = {
      inventory: [inventory(card.id)],
      hand: [STRENGTH.id, ENDURANCE.id],
    }
    const first = setup(state)
    const second = setup(state)
    const before = first.rngState

    expect(
      activate(first, card.id, 0, undefined, [
        card,
        STRENGTH,
        ENDURANCE,
      ]).isRight()
    ).toBe(true)
    expect(
      activate(second, card.id, 0, undefined, [
        card,
        STRENGTH,
        ENDURANCE,
      ]).isRight()
    ).toBe(true)
    expect(first.rngState).not.toEqual(before)
    expect(first.rngState).toEqual(second.rngState)
    expect(playerOf(first)).toEqual(playerOf(second))
    expect(playerOf(first).discard).toHaveLength(1)
  })

  it('REQ-101, REQ-104: o descarte aleatório preserva a carta escolhida para um custo posterior', () => {
    const card = resource(
      effect({
        cost: [
          {
            kind: 'discardFromHand',
            ...chosen,
            requirements: [{ attribute: 'any', count: 1 }],
            random: true,
          },
          { kind: 'discardFromHand', ...chosen },
        ],
      })
    )
    const cards = [card, STRENGTH, ENDURANCE]
    const party = setup({
      inventory: [inventory(card.id)],
      hand: [STRENGTH.id, ENDURANCE.id],
    })

    expect(activatableEffects(playerOf(party), cards)).toEqual([
      {
        cardId: card.id,
        effectIndex: 0,
        source: 'inventory',
        handPayment: { count: 1, text: 'Escolha 1 carta de Força.' },
      },
    ])
    expect(
      activate(party, card.id, 0, { handCards: [STRENGTH.id] }, cards).isRight()
    ).toBe(true)
    expect(playerOf(party).discard).toEqual([ENDURANCE.id, STRENGTH.id])
  })
})

describe('Ações disponíveis', () => {
  it('REQ-106: só o membro da vez recebe Preparar, mesmo com zero pontos', () => {
    const party = setup({ inventory: [inventory(POTION.id)] })
    const effects = activatableEffects(playerOf(party), CARDS)
    const equipmentIds = new Set<string>()

    expect(
      availableActions(party, MEMBER, equipmentIds, [], [], effects)
    ).toEqual(['prepare', 'endTurn'])
    expect(
      availableActions(
        party,
        new UniqueEntityID('other'),
        equipmentIds,
        [],
        [],
        effects
      )
    ).toEqual([])
    expect(availableActions(party, MEMBER, equipmentIds)).toEqual(['endTurn'])
  })
})

describe('Remover status', () => {
  it.each([
    ['removeDebuffs', 'buff'],
    ['removeBuffs', 'debuff'],
  ] as const)('REQ-104: %s preserva status da outra marca', (kind, kept) => {
    const card = makeItemCard({
      id: 'fixture.status-cleanser',
      effects: [
        effect({
          cost: [{ kind: 'consumeSelf' }],
          activation: [{ kind, target: 'self' }],
        }),
      ],
    })
    const party = setup({
      inventory: [inventory(card.id)],
      statuses: (['buff', 'debuff'] as const).map((mark) => ({
        statusId: mark,
        sourceCardId: TONIC.id,
        effectIndex: 0,
        text: mark,
        mark,
        activation: TONIC.effects[0].activation,
        duration: { kind: 'infinite' },
        remaining: null,
      })),
    })

    expect(activate(party, card.id, 0, undefined, [card]).isRight()).toBe(true)
    expect(playerOf(party).statuses.map(({ mark }) => mark)).toEqual([kept])
  })
})
