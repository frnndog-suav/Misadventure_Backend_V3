import { describe, expect, it } from 'vitest'

import {
  makeAttributeCard,
  makeEffect,
} from '../../../../../test/factories/make-card'

import { isClassActive, isSpecializationActive } from '.'

const locks = { lockOneEssential: 18, lockTwoEssentials: 10 }

const strength = makeAttributeCard()
const dexterity = makeAttributeCard({
  id: 'fixture.dexterity-basic',
  attributes: ['dexterity'],
})
const strengthEnhanced = makeAttributeCard({
  id: 'fixture.strength-enhanced',
  attributeKind: 'enhanced',
  effects: [makeEffect({ cost: [] })],
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

describe('isSpecializationActive', () => {
  const endurance = makeAttributeCard({
    id: 'fixture.endurance-basic',
    attributes: ['endurance'],
  })
  const wisdom = makeAttributeCard({
    id: 'fixture.wisdom-basic',
    attributes: ['wisdom'],
  })
  const specLocks = {
    ...locks,
    lockSpecializationAdditional: 6,
    lockSpecializationReinforcement: 4,
  }
  // Cavaleiro da fixture: Força e Resistência, reforço em Resistência, adicional Sabedoria.
  const knight = {
    essentialAttributes: ['strength', 'endurance'],
    reinforcedAttributes: ['endurance'],
    additionalAttributes: ['wisdom'],
    ...specLocks,
  } as const

  it('REQ-134: soma o reforço só ao atributo reforçado e exige o mínimo do adicional (README 8.2)', () => {
    expect(
      isSpecializationActive({
        ...knight,
        build: [
          { card: endurance, copies: 14 },
          { card: strength, copies: 40 },
          { card: wisdom, copies: 6 },
        ],
      })
    ).toBe(true)
  })

  it.each([
    { name: 'falta 1 do reforço', end: 13, str: 40, wis: 6 },
    { name: 'falta 1 do adicional', end: 14, str: 40, wis: 5 },
    { name: 'a trava da classe não é cumprida', end: 14, str: 9, wis: 6 },
  ])('REQ-134: inativa quando $name', ({ end, str, wis }) => {
    expect(
      isSpecializationActive({
        ...knight,
        build: [
          { card: endurance, copies: end },
          { card: strength, copies: str },
          { card: wisdom, copies: wis },
        ],
      })
    ).toBe(false)
  })

  it('REQ-134: o reforço vale só para o atributo listado e a carta sinérgica conta para cada atributo', () => {
    expect(
      isSpecializationActive({
        ...knight,
        reinforcedAttributes: ['strength'],
        build: [
          { card: endurance, copies: 10 },
          { card: strength, copies: 13 },
          { card: wisdom, copies: 6 },
        ],
      })
    ).toBe(false)
    expect(
      isSpecializationActive({
        ...knight,
        essentialAttributes: ['strength'],
        reinforcedAttributes: ['strength'],
        additionalAttributes: ['dexterity'],
        build: [
          { card: synergy, copies: 6 },
          { card: strength, copies: 16 },
        ],
      })
    ).toBe(true)
  })

  it('REQ-134: usa os valores configurados e uma classe sem essenciais nunca ativa', () => {
    const build = [
      { card: endurance, copies: 12 },
      { card: strength, copies: 12 },
      { card: wisdom, copies: 2 },
    ]
    expect(
      isSpecializationActive({
        ...knight,
        build,
        lockSpecializationReinforcement: 2,
        lockSpecializationAdditional: 2,
      })
    ).toBe(true)
    expect(
      isSpecializationActive({ ...knight, build, essentialAttributes: [] })
    ).toBe(false)
  })
})
