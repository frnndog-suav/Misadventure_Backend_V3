import { describe, expect, it } from 'vitest'

import {
  makeAttributeCard,
  makeCombatEventCard,
  makeEnemy,
  toCardInput,
} from '../../../test/factories/make-card'

import { ZodCardInputParser } from './zod-card-input-parser'

const parser = new ZodCardInputParser()

describe('ZodCardInputParser (D-46)', () => {
  const legacyAbility = { name: 'Investida', text: 'Avança sobre o alvo.' }
  const ability = {
    ...legacyAbility,
    id: 'charge',
    form: 'targeted',
    element: null,
    cost: [],
    power: 2,
    effects: [],
    cooldown: 0,
    timing: 'combat',
    classRestriction: [],
    usesPerTurn: 1,
    target: 'opponent',
    duration: null,
    channel: null,
  }

  it('REQ-117: preserva habilidade e desfechos legados para edição', () => {
    const input = toCardInput(
      makeCombatEventCard({
        enemies: [makeEnemy({ abilities: [legacyAbility] })],
      })
    )
    const result = parser.parse(input)
    expect(result.isRight()).toBe(true)
    expect(result.value).toEqual(input)
  })

  it('REQ-117/D-109: lê combate executável preservando cópias e regras do bloco', () => {
    const card = makeCombatEventCard()
    const input = {
      ...toCardInput(card),
      escapeThreshold: 0,
      enemies: [
        {
          ...makeEnemy({ count: 2 }),
          abilities: [ability],
          combatRules: {
            abilityUsesPerTurn: 1,
            abilityPriority: ['highestPower'],
            preferredAbilityIds: [ability.id],
          },
        },
      ],
      goodOutcome: { ...card.goodOutcome, steps: [] },
      badOutcome: { ...card.badOutcome, steps: [] },
    }
    const result = parser.parse(input)
    expect(result.isRight()).toBe(true)
    expect(result.value).toEqual(input)
  })

  it('REQ-117/D-109: aponta o campo obrigatório ausente na habilidade com id', () => {
    const input = {
      ...toCardInput(makeCombatEventCard()),
      enemies: [
        {
          ...makeEnemy(),
          abilities: [{ ...ability, cost: undefined }],
        },
      ],
    }
    const result = parser.parse(input)
    expect(result.isLeft()).toBe(true)
    expect(result.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'enemies.0.abilities.0.cost',
          reason: 'invalidFormat',
        }),
      ])
    )
  })

  it('REQ-43: corpo no formato → CardInput', () => {
    const input = toCardInput(makeAttributeCard())

    expect(parser.parse(input).value).toEqual(input)
  })

  it('REQ-43: corpo que não é objeto → path ""', () => {
    for (const raw of [null, 'x', [1]]) {
      expect(parser.parse(raw).value).toEqual([
        { path: '', reason: 'notAnObject' },
      ])
    }
  })

  it('REQ-43: problemas de formato com caminho em pontos e texto do Zod', () => {
    const input = toCardInput(
      makeCombatEventCard({
        enemies: [makeEnemy({ health: 'muita' as unknown as number })],
      })
    )

    const result = parser.parse(input)

    expect(result.isLeft()).toBe(true)
    expect(result.value).toEqual([
      {
        path: 'enemies.0.health',
        reason: 'invalidFormat',
        message: expect.any(String),
      },
    ])
  })

  it('REQ-43: tipo desconhecido → path type', () => {
    const result = parser.parse({ type: 'monster', slug: 'x' })

    expect(result.value).toEqual([
      { path: 'type', reason: 'invalidFormat', message: expect.any(String) },
    ])
  })

  it('REQ-43: campo desconhecido (inclusive id e status) → problema no próprio campo', () => {
    const input = {
      ...toCardInput(makeAttributeCard()),
      id: 'fixture.x',
      status: 'draft',
    }

    expect(parser.parse(input).value).toEqual([
      { path: 'id', reason: 'unknownField' },
      { path: 'status', reason: 'unknownField' },
    ])
  })
})
