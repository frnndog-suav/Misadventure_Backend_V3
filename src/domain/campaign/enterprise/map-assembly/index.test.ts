import { describe, expect, it } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import type { TZoneCard } from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeUrbanZoneCard,
  makeZoneCard,
  makeZoneEffect,
} from '../../../../../test/factories/make-card'

import { assembleMap, type TMapZone, type TPartyMap } from '.'

const harbor = makeUrbanZoneCard()
const grove = makeZoneCard({
  id: 'fixture.whispering-grove',
  title: 'Bosque',
  connectionArrows: 2,
  arrowLayout: 'straight',
})
const bend = makeZoneCard({
  id: 'fixture.stone-bend',
  title: 'Curva',
  connectionArrows: 2,
  arrowLayout: 'corner',
})
const mine = makeZoneCard({
  id: 'fixture.old-mine',
  title: 'Mina',
  connectionArrows: 1,
  arrowLayout: null,
})
const FIXTURE = [harbor, grove, bend, mine]

const STEP = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
} as const
const OPPOSITE = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
} as const

function assemble(
  zones: readonly TZoneCard[] = FIXTURE,
  seed = 42,
  arrivalZoneTitle: string | null = 'Porto Cinzento',
  maxAttempts = 1000
) {
  const rng = SeededRng.fromSeed(seed)
  const result = assembleMap({ zones, arrivalZoneTitle, rng, maxAttempts })
  return { result, rng }
}

function mapOf(result: ReturnType<typeof assemble>['result']): TPartyMap {
  if (result.isLeft()) throw new Error('esperava mapa')
  return result.value.map
}

/** Cada zona (fora a cidade) aponta uma seta de volta para uma vizinha que aponta para ela. */
function connectedByCrossings(map: TPartyMap): boolean {
  const ids = map.zones.map((z) => z.zoneId)
  const reached = new Set([ids[0]])
  let grew = true
  while (grew) {
    grew = false
    for (const { zoneIds } of map.crossings) {
      const [a, b] = zoneIds
      if (reached.has(a) !== reached.has(b)) {
        reached.add(a)
        reached.add(b)
        grew = true
      }
    }
  }
  return ids.every((id) => reached.has(id))
}

const find = (map: TPartyMap, id: string): TMapZone => {
  const zone = map.zones.find((z) => z.zoneId === id)
  if (!zone) throw new Error(`zona ${id} fora do mapa`)
  return zone
}

describe('assembleMap', () => {
  it('REQ-32: a cidade de arrivalZoneTitle fica em (0, 0) com as 4 setas', () => {
    const { result } = assemble()

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.startingCityZoneId).toBe('fixture.gray-harbor')
    expect(result.value.map.zones[0]).toEqual({
      zoneId: 'fixture.gray-harbor',
      x: 0,
      y: 0,
      arrows: ['north', 'east', 'south', 'west'],
    })
  })

  it.each([1, 2, 3, 42, 777, 2026])(
    'REQ-32: semente %i → todas as zonas, uma vez, em células diferentes, com a forma das setas preservada',
    (seed) => {
      const map = mapOf(assemble(FIXTURE, seed).result)

      expect(map.zones.map((z) => z.zoneId).sort()).toEqual(
        FIXTURE.map((z) => z.id).sort()
      )
      expect(new Set(map.zones.map((z) => `${z.x},${z.y}`)).size).toBe(4)
      expect(find(map, 'fixture.old-mine').arrows).toHaveLength(1)
      const straight = find(map, 'fixture.whispering-grove').arrows
      expect(straight).toHaveLength(2)
      expect(OPPOSITE[straight[0]]).toBe(straight[1])
      const corner = find(map, 'fixture.stone-bend').arrows
      expect(corner).toHaveLength(2)
      expect(OPPOSITE[corner[0]]).not.toBe(corner[1])
    }
  )

  it.each([1, 2, 3, 42, 777, 2026])(
    'REQ-32: semente %i → travessias só entre vizinhas com setas que se apontam, ligando todas as zonas',
    (seed) => {
      const map = mapOf(assemble(FIXTURE, seed).result)

      expect(map.crossings.length).toBeGreaterThanOrEqual(3)
      for (const { zoneIds } of map.crossings) {
        const [a, b] = zoneIds.map((id) => find(map, id))
        expect(zoneIds[0] < zoneIds[1]).toBe(true)
        const direction = (['north', 'east', 'south', 'west'] as const).find(
          (d) => a.x + STEP[d][0] === b.x && a.y + STEP[d][1] === b.y
        )
        expect(direction).toBeDefined()
        if (!direction) return
        expect(a.arrows).toContain(direction)
        expect(b.arrows).toContain(OPPOSITE[direction])
      }
      expect(connectedByCrossings(map)).toBe(true)
    }
  )

  it('REQ-32: travessia só onde as duas setas se apontam (seta para vizinha sem seta de volta não conta)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const map = mapOf(assemble(FIXTURE, seed).result)
      const cells = new Map(map.zones.map((z) => [`${z.x},${z.y}`, z]))
      let mutual = 0
      for (const zone of map.zones) {
        for (const d of ['east', 'south'] as const) {
          const n = cells.get(`${zone.x + STEP[d][0]},${zone.y + STEP[d][1]}`)
          if (n && zone.arrows.includes(d) && n.arrows.includes(OPPOSITE[d]))
            mutual += 1
        }
      }
      expect(map.crossings).toHaveLength(mutual)
    }
  })

  it('REQ-32: mesmo RNG → mesmo mapa e mesmo estado final', () => {
    const first = assemble(FIXTURE, 99)
    const second = assemble(FIXTURE, 99)

    expect(mapOf(first.result)).toEqual(mapOf(second.result))
    expect(first.rng.state()).toEqual(second.rng.state())
  })

  it('REQ-32: a ordem das zonas na entrada não muda o mapa (embaralha a partir da ordem por id)', () => {
    const forward = mapOf(assemble(FIXTURE, 7).result)
    const backward = mapOf(assemble([...FIXTURE].reverse(), 7).result)

    expect(backward).toEqual(forward)
  })

  it('REQ-32: sementes diferentes produzem mapas diferentes', () => {
    const maps = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        JSON.stringify(mapOf(assemble(FIXTURE, seed).result))
      )
    )

    expect(maps.size).toBeGreaterThan(1)
  })

  it('REQ-32: sem arrivalZoneTitle → cidade sorteada só entre as Urbanas sem efeito negativo', () => {
    const cursed = makeUrbanZoneCard({
      id: 'fixture.a-cursed-city',
      title: 'Cidade Amaldiçoada',
      effects: [makeZoneEffect({ polarity: 'negative' })],
    })
    const blessed = makeUrbanZoneCard({
      id: 'fixture.b-blessed-city',
      title: 'Cidade Abençoada',
      effects: [
        makeZoneEffect({
          text: 'Ganhe 1 de ouro.',
          activation: [{ kind: 'gainGold', amount: 1 }],
          polarity: 'positive',
        }),
      ],
    })
    const zones = [cursed, blessed, harbor, mine]
    const cities = new Set<string>()

    for (let seed = 1; seed <= 40; seed++) {
      const { result } = assemble(zones, seed, null)
      if (result.isLeft()) throw new Error('esperava mapa')
      cities.add(result.value.startingCityZoneId)
    }

    expect([...cities].sort()).toEqual([
      'fixture.b-blessed-city',
      'fixture.gray-harbor',
    ])
  })

  it('REQ-32: sem seta livre → nova tentativa com o RNG seguindo, até montar', () => {
    // Cidade de 1 seta + 2 zonas de 1 seta: depois da 1ª, nunca há seta livre.
    // Com uma zona de 2 setas em linha, só monta se ela vier antes da de 1 seta.
    const city = makeUrbanZoneCard({ connectionArrows: 1, arrowLayout: null })
    const line = makeZoneCard({ id: 'fixture.line', title: 'Linha' })
    const end = makeZoneCard({
      id: 'fixture.end',
      title: 'Fim',
      connectionArrows: 1,
      arrowLayout: null,
    })
    const zones = [city, line, end]
    let retried = false

    for (let seed = 1; seed <= 20; seed++) {
      const once = assemble(zones, seed, 'Porto Cinzento', 1).result
      const many = assemble(zones, seed, 'Porto Cinzento', 1000).result
      expect(many.isRight()).toBe(true)
      if (once.isLeft()) retried = true
    }
    expect(retried).toBe(true)
  })

  it('REQ-36: passou de maxAttempts → maxAttemptsExceeded', () => {
    const city = makeUrbanZoneCard({ connectionArrows: 1, arrowLayout: null })
    const ends = ['a', 'b'].map((id) =>
      makeZoneCard({
        id: `fixture.${id}`,
        title: id,
        connectionArrows: 1,
        arrowLayout: null,
      })
    )

    const { result } = assemble([city, ...ends], 42, 'Porto Cinzento', 5)

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toBe('maxAttemptsExceeded')
  })

  it('REQ-32: uma zona Urbana sozinha é o mapa inteiro, sem travessias', () => {
    const map = mapOf(assemble([harbor]).result)

    expect(map).toEqual({
      zones: [
        {
          zoneId: 'fixture.gray-harbor',
          x: 0,
          y: 0,
          arrows: ['north', 'east', 'south', 'west'],
        },
      ],
      crossings: [],
    })
  })
})
