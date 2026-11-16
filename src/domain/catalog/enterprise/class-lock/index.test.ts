import { describe, expect, it } from 'vitest'

import { makeAttributeCard } from '../../../../../test/factories/make-card'

import { isClassActive } from '.'

const locks = { lockOneEssential: 18, lockTwoEssentials: 10 }

const strength = makeAttributeCard()
const dexterity = makeAttributeCard({
  id: 'fixture.dexterity-basic',
  attributes: ['dexterity'],
})
const strengthEnhanced = makeAttributeCard({
  id: 'fixture.strength-enhanced',
  attributeKind: 'enhanced',
  effects: [{ text: 'Efeito.' }],
})
const synergy = makeAttributeCard({
  id: 'fixture.strength-dexterity',
  attributeKind: 'synergy',
  attributes: ['strength', 'dexterity'],
})

describe('isClassActive', () => {
  it('REQ-30: 1 essencial — ativa com ≥ lockOneEssential cartas do atributo', () => {
    expect(
      isClassActive({
        build: [
          { card: strength, copies: 10 },
          { card: strengthEnhanced, copies: 8 },
        ],
        essentialAttributes: ['strength'],
        ...locks,
      })
    ).toBe(true)
    expect(
      isClassActive({
        build: [
          { card: strength, copies: 17 },
          { card: dexterity, copies: 40 },
        ],
        essentialAttributes: ['strength'],
        ...locks,
      })
    ).toBe(false)
  })

  it('REQ-30: 2 essenciais — ativa só com ≥ lockTwoEssentials de cada um', () => {
    expect(
      isClassActive({
        build: [
          { card: strength, copies: 10 },
          { card: dexterity, copies: 10 },
        ],
        essentialAttributes: ['strength', 'dexterity'],
        ...locks,
      })
    ).toBe(true)
    expect(
      isClassActive({
        build: [
          { card: strength, copies: 30 },
          { card: dexterity, copies: 9 },
        ],
        essentialAttributes: ['strength', 'dexterity'],
        ...locks,
      })
    ).toBe(false)
  })

  it('REQ-30: carta synergy conta para cada atributo que tem', () => {
    expect(
      isClassActive({
        build: [{ card: synergy, copies: 10 }],
        essentialAttributes: ['strength', 'dexterity'],
        ...locks,
      })
    ).toBe(true)
  })

  it('REQ-30: o tamanho da build não entra na trava', () => {
    expect(
      isClassActive({
        build: [{ card: strength, copies: 18 }],
        essentialAttributes: ['strength'],
        ...locks,
      })
    ).toBe(true)
  })

  it('REQ-30: sem essenciais, a classe fica inativa (D-56)', () => {
    expect(
      isClassActive({
        build: [{ card: strength, copies: 60 }],
        essentialAttributes: [],
        ...locks,
      })
    ).toBe(false)
  })

  it('REQ-30: os limites vêm da config recebida', () => {
    expect(
      isClassActive({
        build: [{ card: strength, copies: 5 }],
        essentialAttributes: ['strength'],
        lockOneEssential: 5,
        lockTwoEssentials: 10,
      })
    ).toBe(true)
  })
})
