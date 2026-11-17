import { describe, expect, it } from 'vitest'

import { ZodClassInputParser } from './zod-class-input-parser'

const MAGE = {
  playerClass: 'mage',
  name: 'Mago',
  essentialAttributes: ['intelligence', 'spirit'],
  baseModifiers: {
    attack: 4,
    defense: 2,
    accuracy: 50,
    evasion: 20,
    celerity: 10,
    piercing: 0,
    reflection: 0,
  },
  starterDeck: [{ cardId: 'fixture.strength-basic', copies: 60 }],
}

describe('ZodClassInputParser', () => {
  const parser = new ZodClassInputParser()

  it('REQ-38: aceita um ClassInput no formato', () => {
    const result = parser.parse(MAGE)
    expect(result.isRight()).toBe(true)
    expect(result.value).toEqual(MAGE)
  })

  it('REQ-38: corpo não objeto → path ""', () => {
    expect(parser.parse([]).value).toEqual([
      { path: '', reason: 'notAnObject' },
    ])
  })

  it('REQ-38: campo desconhecido e formato errado, com pontos e índices', () => {
    const result = parser.parse({
      ...MAGE,
      collectionId: 'x',
      playerClass: 'paladino',
      starterDeck: [{ cardId: 'a', copies: '2' }],
    })
    expect(result.isLeft()).toBe(true)
    const paths = (result.value as { path: string; reason: string }[]).map(
      ({ path, reason }) => `${path}:${reason}`
    )
    expect(paths).toEqual(
      expect.arrayContaining([
        'collectionId:unknownField',
        'playerClass:invalidFormat',
        'starterDeck.0.copies:invalidFormat',
      ])
    )
  })
})
