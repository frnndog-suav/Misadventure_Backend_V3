import { describe, expect, it } from 'vitest'

import type {
  TDimensionCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeDimensionCard,
  makeUrbanZoneCard,
  makeZoneCard,
} from '../../../../../test/factories/make-card'

import { checkDimensionComposition } from '.'

const urban = (id: string, arrows = 4, title = id) =>
  makeUrbanZoneCard({
    id: `fixture.${id}`,
    title,
    connectionArrows: arrows,
  })
const other = (id: string, arrows: number) =>
  makeZoneCard({ id: `fixture.${id}`, title: id, connectionArrows: arrows })

/** Sem zona de chegada: as regras de REQ-47 ficam isoladas. */
const free = makeDimensionCard({ arrivalZoneTitle: null })
const check = (
  zones: readonly TZoneCard[],
  dimension: TDimensionCard | null = free
) => checkDimensionComposition({ dimension, zones })

const NO_DIMENSION = 'A coleção precisa de 1 Carta de Dimensão publicada.'
const NO_URBAN = 'A coleção precisa de pelo menos 1 zona Urbana publicada.'
const NO_SAFE_URBAN =
  'Sem zona de chegada na Carta de Dimensão, a coleção precisa de pelo menos 1 zona Urbana publicada sem efeito negativo.'
const badArrival = (title: string) =>
  `A zona de chegada "${title}" da Carta de Dimensão não é uma zona Urbana publicada da coleção.`

describe('checkDimensionComposition', () => {
  it('REQ-36: sem Carta de Dimensão → pede 1 Carta de Dimensão publicada', () => {
    expect(check([urban('u')], null)).toEqual([NO_DIMENSION])
  })

  it('REQ-36: sem Carta de Dimensão nem zonas → os dois textos (como o validate-dimension de `bosque`)', () => {
    expect(check([], null)).toEqual([NO_DIMENSION, NO_URBAN])
  })

  it('REQ-36/REQ-47: sem nenhuma zona Urbana → pede 1 zona Urbana publicada', () => {
    expect(check([other('a', 2)])).toEqual([NO_URBAN])
  })

  it('REQ-47: sem zonas, só falta a Urbana (a conta de setas não se aplica)', () => {
    expect(check([])).toEqual([NO_URBAN])
  })

  it('REQ-36: arrivalZoneTitle que é o título de uma Urbana da coleção → sem problema', () => {
    const dimension = makeDimensionCard({ arrivalZoneTitle: 'Porto Cinzento' })

    expect(check([urban('harbor', 4, 'Porto Cinzento')], dimension)).toEqual([])
  })

  it('REQ-36: arrivalZoneTitle que não é título de zona nenhuma → texto com o título', () => {
    const dimension = makeDimensionCard({ arrivalZoneTitle: 'Atlântida' })

    expect(check([urban('u')], dimension)).toEqual([badArrival('Atlântida')])
  })

  it('REQ-36: arrivalZoneTitle de uma zona que não é Urbana → mesmo texto', () => {
    const dimension = makeDimensionCard({ arrivalZoneTitle: 'a' })

    expect(check([urban('u'), other('a', 2)], dimension)).toEqual([
      badArrival('a'),
    ])
  })

  it('REQ-36: sem arrivalZoneTitle e toda Urbana com efeito negativo → pede uma sem efeito negativo', () => {
    const cursed = makeUrbanZoneCard({
      effects: [{ text: 'Perca 1 de vida.', polarity: 'negative' }],
    })

    expect(check([cursed])).toEqual([NO_SAFE_URBAN])
  })

  it('REQ-36: sem arrivalZoneTitle e uma Urbana só com efeito positivo → sem problema', () => {
    const blessed = makeUrbanZoneCard({
      effects: [{ text: 'Ganhe 1 de ouro.', polarity: 'positive' }],
    })

    expect(check([blessed])).toEqual([])
  })

  it('REQ-36/REQ-47: setas abaixo de 2 × (zonas − 1) → texto com N e M calculados', () => {
    // 3 zonas pedem 4 setas; a função só soma (REQ-15 cuida das setas por carta).
    const zones = [urban('u', 1), other('a', 1), other('b', 1)]

    expect(check(zones)).toEqual([
      'As zonas publicadas têm 3 setas; são precisas pelo menos 4 (2 × (zonas − 1)).',
    ])
  })

  it('REQ-47: setas exatamente no mínimo → sem problema', () => {
    const zones = [urban('u', 2), other('a', 1), other('b', 1)]

    expect(check(zones)).toEqual([])
  })

  it('REQ-47: uma zona Urbana sozinha é uma dimensão válida', () => {
    expect(check([urban('u')])).toEqual([])
  })

  it('REQ-36: todos os problemas, na ordem Carta, Urbana, setas', () => {
    const zones = [other('a', 1), other('b', 1), other('c', 1)]

    expect(check(zones, null)).toEqual([
      NO_DIMENSION,
      NO_URBAN,
      'As zonas publicadas têm 3 setas; são precisas pelo menos 4 (2 × (zonas − 1)).',
    ])
  })

  it('REQ-36: zona de chegada inválida vem antes das setas', () => {
    const dimension = makeDimensionCard({ arrivalZoneTitle: 'X' })
    const zones = [urban('u', 1), other('a', 1), other('b', 1)]

    expect(check(zones, dimension)).toEqual([
      badArrival('X'),
      'As zonas publicadas têm 3 setas; são precisas pelo menos 4 (2 × (zonas − 1)).',
    ])
  })
})
