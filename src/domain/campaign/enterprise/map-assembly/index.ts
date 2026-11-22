import { type Either, left, right } from '@/core/error/either'
import type { SeededRng } from '@/core/rng/seeded-rng'
import type { TZoneCard } from '@/domain/catalog/enterprise/value-objects/card'

import { shuffle } from '../shuffle'

/** Direções da mesa, na ordem N → L → S → O (D-38). `y` cresce para o sul. */
export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const
export type TDirection = (typeof DIRECTIONS)[number]

export type TMapZone = Readonly<{
  zoneId: string
  x: number
  y: number
  arrows: readonly TDirection[]
  questDeck?: readonly string[]
  questBoard?: readonly (string | null)[]
  questDrawPile?: readonly string[]
  questReferenceIds?: readonly string[]
}>

export type TCrossing = Readonly<{ zoneIds: readonly [string, string] }>

export type TPartyMap = Readonly<{
  zones: readonly TMapZone[]
  crossings: readonly TCrossing[]
}>

export type TAssembledMap = Readonly<{
  startingCityZoneId: string
  map: TPartyMap
}>

export type TAssembleMapInput = Readonly<{
  zones: readonly TZoneCard[]
  arrivalZoneTitle: string | null
  rng: SeededRng
  maxAttempts: number
}>

const STEP: Record<TDirection, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
}

const opposite = (direction: TDirection): TDirection =>
  DIRECTIONS[(DIRECTIONS.indexOf(direction) + 2) % 4]

const rotate = (direction: TDirection, quarterTurns: number): TDirection =>
  DIRECTIONS[(DIRECTIONS.indexOf(direction) + quarterTurns) % 4]

const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/**
 * Setas da carta na rotação 0 (D-37): 1 → N; 2 `straight` → N, S;
 * 2 `corner` → N, L; 3 → N, L, S; 4 → todas.
 */
function baseArrows(zone: TZoneCard): TDirection[] {
  if (zone.connectionArrows === 2) {
    return zone.arrowLayout === 'corner'
      ? ['north', 'east']
      : ['north', 'south']
  }
  return DIRECTIONS.slice(0, Math.max(0, Math.min(4, zone.connectionArrows)))
}

/** Rotações distintas (0 a 3 quartos de volta), cada uma com as setas na ordem N → L → S → O. */
function distinctRotations(zone: TZoneCard): TDirection[][] {
  const seen = new Set<string>()
  const rotations: TDirection[][] = []
  for (let turns = 0; turns < 4; turns++) {
    const arrows = baseArrows(zone).map((d) => rotate(d, turns))
    const sorted = DIRECTIONS.filter((d) => arrows.includes(d))
    const key = sorted.join(',')
    if (!seen.has(key)) {
      seen.add(key)
      rotations.push(sorted)
    }
  }
  return rotations
}

const cellKey = (x: number, y: number): string => `${x},${y}`

/** Candidatas à cidade inicial (README 3.2, 3.5; REQ-32), em ordem de `id`. */
function cityCandidates(
  zones: readonly TZoneCard[],
  arrivalZoneTitle: string | null
): TZoneCard[] {
  const urban = zones.filter((zone) => zone.zoneType === 'urban')
  const candidates =
    arrivalZoneTitle === null
      ? urban.filter(
          (zone) => !zone.effects.some((e) => e.polarity === 'negative')
        )
      : urban.filter((zone) => zone.title === arrivalZoneTitle)
  return candidates.sort(byId)
}

function tryAssemble(
  zones: readonly TZoneCard[],
  candidates: readonly TZoneCard[],
  arrivalZoneTitle: string | null,
  rng: SeededRng
): TMapZone[] | null {
  const city =
    arrivalZoneTitle === null
      ? candidates[rng.nextInt(0, candidates.length - 1)]
      : candidates[0]
  const rest = shuffle(
    zones.filter((zone) => zone.id !== city.id).sort(byId),
    rng
  )

  const placed: TMapZone[] = [
    { zoneId: city.id, x: 0, y: 0, arrows: baseArrows(city) },
  ]
  const occupied = new Set([cellKey(0, 0)])

  for (const zone of rest) {
    const freeArrows: { x: number; y: number; direction: TDirection }[] = []
    const ordered = [...placed].sort((a, b) => a.y - b.y || a.x - b.x)
    for (const cell of ordered) {
      for (const direction of DIRECTIONS) {
        if (!cell.arrows.includes(direction)) continue
        const [dx, dy] = STEP[direction]
        if (occupied.has(cellKey(cell.x + dx, cell.y + dy))) continue
        freeArrows.push({ x: cell.x + dx, y: cell.y + dy, direction })
      }
    }
    if (freeArrows.length === 0) return null

    const target = freeArrows[rng.nextInt(0, freeArrows.length - 1)]
    const back = opposite(target.direction)
    const rotations = distinctRotations(zone).filter((arrows) =>
      arrows.includes(back)
    )
    if (rotations.length === 0) return null

    const arrows = rotations[rng.nextInt(0, rotations.length - 1)]
    placed.push({ zoneId: zone.id, x: target.x, y: target.y, arrows })
    occupied.add(cellKey(target.x, target.y))
  }

  return placed
}

/** Pares de células vizinhas cujas setas se apontam (REQ-32), em ordem de `zoneIds`. */
function findCrossings(zones: readonly TMapZone[]): TCrossing[] {
  const byCell = new Map(zones.map((zone) => [cellKey(zone.x, zone.y), zone]))
  const crossings: TCrossing[] = []
  for (const zone of zones) {
    for (const direction of ['east', 'south'] as const) {
      if (!zone.arrows.includes(direction)) continue
      const [dx, dy] = STEP[direction]
      const neighbor = byCell.get(cellKey(zone.x + dx, zone.y + dy))
      if (!neighbor || !neighbor.arrows.includes(opposite(direction))) continue
      crossings.push({
        zoneIds:
          zone.zoneId < neighbor.zoneId
            ? [zone.zoneId, neighbor.zoneId]
            : [neighbor.zoneId, zone.zoneId],
      })
    }
  }
  return crossings.sort(
    (a, b) =>
      byId({ id: a.zoneIds[0] }, { id: b.zoneIds[0] }) ||
      byId({ id: a.zoneIds[1] }, { id: b.zoneIds[1] })
  )
}

/**
 * Montagem do mapa (README 3.5; REQ-32; D-38). Puro: o RNG segue entre as
 * tentativas. As zonas do mapa saem na ordem em que entraram (cidade primeiro).
 * Supõe a composição já conferida (REQ-36); sem cidade candidata ou acima de
 * `maxAttempts` tentativas → `left`.
 */
export function assembleMap({
  zones,
  arrivalZoneTitle,
  rng,
  maxAttempts,
}: TAssembleMapInput): Either<'maxAttemptsExceeded', TAssembledMap> {
  const candidates = cityCandidates(zones, arrivalZoneTitle)
  // Inalcançável depois de `checkDimensionComposition` (REQ-36); guarda.
  if (candidates.length === 0) return left('maxAttemptsExceeded')

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const placed = tryAssemble(zones, candidates, arrivalZoneTitle, rng)
    if (placed) {
      return right({
        startingCityZoneId: placed[0].zoneId,
        map: { zones: placed, crossings: findCrossings(placed) },
      })
    }
  }
  return left('maxAttemptsExceeded')
}
