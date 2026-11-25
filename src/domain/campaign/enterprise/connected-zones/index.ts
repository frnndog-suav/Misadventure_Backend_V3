import type { TPartyMap } from '../map-assembly'

/**
 * Zonas com travessia com `zoneId` (README 3.5, encaixe 1; REQ-50): vale nos
 * dois sentidos, sem repetição, em ordem de id (código de caractere). Vizinha
 * na mesa sem travessia não entra; a própria zona nunca é destino.
 */
export function connectedZones(map: TPartyMap, zoneId: string): string[] {
  const connected = new Set<string>()
  for (const [first, second] of map.crossings.map((c) => c.zoneIds)) {
    if (first === zoneId && second !== zoneId) connected.add(second)
    if (second === zoneId && first !== zoneId) connected.add(first)
  }
  return [...connected].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Um destino do movimento e os caminhos possíveis até ele (CONTRATO FEAT-18 `moveRoutes`). */
export interface TMoveRoute {
  zoneId: string
  /** Há travessia com a zona atual (movimento simples possível). */
  direct: boolean
  /** Zonas do meio (travessia com a atual e com o destino), em ordem de id; `[]` sem montaria. */
  via: string[]
}

/**
 * Destinos do movimento de `zoneId`, em ordem de id (README 12.2, 26; REQ-161):
 * sem montaria, as zonas a 1 travessia; com montaria, também as a 2 travessias
 * (nunca a própria zona). `via` lista as zonas do meio possíveis.
 */
export function moveRoutes(
  map: TPartyMap,
  zoneId: string,
  withMount: boolean
): TMoveRoute[] {
  const first = connectedZones(map, zoneId)
  if (!withMount) {
    return first.map((target) => ({ zoneId: target, direct: true, via: [] }))
  }
  const targets = new Set(first)
  for (const middle of first) {
    for (const target of connectedZones(map, middle)) {
      if (target !== zoneId) targets.add(target)
    }
  }
  return [...targets]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((target) => ({
      zoneId: target,
      direct: first.includes(target),
      via: first.filter((middle) =>
        connectedZones(map, middle).includes(target)
      ),
    }))
}
