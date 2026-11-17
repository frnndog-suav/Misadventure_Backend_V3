import { describe, expect, it } from 'vitest'

import type { TPartyMap } from '../map-assembly'
import { connectedZones } from '.'

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
