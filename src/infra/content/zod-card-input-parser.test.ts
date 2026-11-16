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
