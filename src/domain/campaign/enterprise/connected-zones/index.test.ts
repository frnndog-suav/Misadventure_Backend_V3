import { describe, expect, it } from 'vitest'

import type { TPartyMap } from '../map-assembly'
import { connectedZones, moveRoutes } from '.'

const zone = (zoneId: string, x: number, y: number) => ({
  zoneId,
  x,
  y,
  arrows: [] as const,
})

// a—b e c—a têm travessia; d fica ao lado de b na mesa, sem travessia (3.5, encaixe 2 e 3).
const MAP: TPartyMap = {
  zones: [zone('a', 0, 0), zone('b', 1, 0), zone('c', 0, 1), zone('d', 2, 0)],
  crossings: [{ zoneIds: ['a', 'b'] }, { zoneIds: ['c', 'a'] }],
}

describe('connectedZones', () => {
  it('REQ-50: a travessia vale nos dois sentidos', () => {
    expect(connectedZones(MAP, 'b')).toEqual(['a'])
    expect(connectedZones(MAP, 'c')).toEqual(['a'])
  })

  it('REQ-50: vem em ordem de id, qualquer que seja a ordem das travessias', () => {
    expect(connectedZones(MAP, 'a')).toEqual(['b', 'c'])
    expect(
      connectedZones(
        {
          zones: MAP.zones,
          crossings: [{ zoneIds: ['z', 'a'] }, { zoneIds: ['m', 'z'] }],
        },
        'z'
      )
    ).toEqual(['a', 'm'])
  })

  it('REQ-50: ordena por código de caractere, não por idioma', () => {
    const map: TPartyMap = {
      zones: MAP.zones,
      crossings: [{ zoneIds: ['x', 'b'] }, { zoneIds: ['x', 'B'] }],
    }

    expect(connectedZones(map, 'x')).toEqual(['B', 'b'])
  })

  it('REQ-50: vizinha na mesa sem travessia não entra', () => {
    expect(connectedZones(MAP, 'd')).toEqual([])
    expect(connectedZones(MAP, 'b')).not.toContain('d')
  })

  it('REQ-50: sem repetição, mesmo com a travessia repetida', () => {
    const map: TPartyMap = {
      zones: MAP.zones,
      crossings: [{ zoneIds: ['a', 'b'] }, { zoneIds: ['b', 'a'] }],
    }

    expect(connectedZones(map, 'a')).toEqual(['b'])
  })

  it('REQ-50: a própria zona não é destino', () => {
    expect(connectedZones(MAP, 'a')).not.toContain('a')
  })

  it('REQ-50: zona fora do mapa → lista vazia', () => {
    expect(connectedZones(MAP, 'nowhere')).toEqual([])
  })
})

// Mapa de dois caminhos: a—b—d e a—c—d, mais e—a; f isolada (T-78; README 26, E21).
const TWO_PATHS: TPartyMap = {
  zones: ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => zone(id, i, 0)),
  crossings: [
    { zoneIds: ['b', 'a'] },
    { zoneIds: ['d', 'b'] },
    { zoneIds: ['a', 'c'] },
    { zoneIds: ['c', 'd'] },
    { zoneIds: ['e', 'a'] },
  ],
}

describe('moveRoutes', () => {
  it('REQ-161: sem montaria, só as zonas a 1 travessia, direct true e via vazio', () => {
    expect(moveRoutes(TWO_PATHS, 'a', false)).toEqual([
      { zoneId: 'b', direct: true, via: [] },
      { zoneId: 'c', direct: true, via: [] },
      { zoneId: 'e', direct: true, via: [] },
    ])
  })

  it('REQ-161: com montaria, entram as zonas a 2 travessias (exceto a atual), em ordem de id', () => {
    expect(moveRoutes(TWO_PATHS, 'a', true).map((r) => r.zoneId)).toEqual([
      'b',
      'c',
      'd',
      'e',
    ])
  })

  it('REQ-161 (D-145): dois caminhos para o mesmo destino aparecem em via, em ordem de id', () => {
    const d = moveRoutes(TWO_PATHS, 'a', true).find((r) => r.zoneId === 'd')
    expect(d).toEqual({ zoneId: 'd', direct: false, via: ['b', 'c'] })
  })

  it('REQ-161: destino a 1 travessia sem meio possível; destino a 2 com dois meios', () => {
    const routes = moveRoutes(TWO_PATHS, 'b', true)
    expect(routes.find((r) => r.zoneId === 'a')).toEqual({
      zoneId: 'a',
      direct: true,
      via: [],
    })
    expect(routes.find((r) => r.zoneId === 'c')).toEqual({
      zoneId: 'c',
      direct: false,
      via: ['a', 'd'],
    })
  })

  it('REQ-161: triângulo — destino direto com meio possível', () => {
    const triangle: TPartyMap = {
      zones: [zone('a', 0, 0), zone('b', 1, 0), zone('c', 0, 1)],
      crossings: [
        { zoneIds: ['a', 'b'] },
        { zoneIds: ['b', 'c'] },
        { zoneIds: ['a', 'c'] },
      ],
    }
    expect(moveRoutes(triangle, 'a', true)).toEqual([
      { zoneId: 'b', direct: true, via: ['c'] },
      { zoneId: 'c', direct: true, via: ['b'] },
    ])
  })

  it('REQ-161: zona isolada não tem destinos', () => {
    expect(moveRoutes(TWO_PATHS, 'f', true)).toEqual([])
  })
})
