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
