import { describe, expect, it } from 'vitest'

import {
  makeUrbanZoneCard,
  makeZoneCard,
} from '../../../../../test/factories/make-card'

import { checkDimensionComposition } from '.'

const urban = (id: string, arrows = 4) =>
  makeUrbanZoneCard({
    id: `fixture.${id}`,
    title: id,
    connectionArrows: arrows,
  })
const other = (id: string, arrows: number) =>
  makeZoneCard({ id: `fixture.${id}`, title: id, connectionArrows: arrows })

const NO_URBAN = 'A coleção precisa de pelo menos 1 zona Urbana publicada.'

describe('checkDimensionComposition', () => {
  it('REQ-47: sem nenhuma zona Urbana → pede 1 zona Urbana publicada', () => {
    expect(checkDimensionComposition([other('a', 2)])).toEqual([NO_URBAN])
  })

  it('REQ-47: sem zonas, só falta a Urbana (a conta de setas não se aplica)', () => {
    expect(checkDimensionComposition([])).toEqual([NO_URBAN])
  })

  it('REQ-47: setas abaixo de 2 × (zonas − 1) → texto com N e M calculados', () => {
    // 3 zonas pedem 4 setas; a função só soma (REQ-15 cuida das setas por carta).
    const zones = [urban('u', 1), other('a', 1), other('b', 1)]

    expect(checkDimensionComposition(zones)).toEqual([
      'As zonas publicadas têm 3 setas; são precisas pelo menos 4 (2 × (zonas − 1)).',
    ])
  })

  it('REQ-47: setas exatamente no mínimo → sem problema', () => {
    const zones = [urban('u', 2), other('a', 1), other('b', 1)]

    expect(checkDimensionComposition(zones)).toEqual([])
  })

  it('REQ-47: uma zona Urbana sozinha é uma dimensão válida', () => {
    expect(checkDimensionComposition([urban('u')])).toEqual([])
  })

  it('REQ-47: os dois problemas, na ordem Urbana e depois setas', () => {
    const zones = [other('a', 1), other('b', 1), other('c', 1)]

    expect(checkDimensionComposition(zones)).toEqual([
      NO_URBAN,
      'As zonas publicadas têm 3 setas; são precisas pelo menos 4 (2 × (zonas − 1)).',
    ])
  })
})
