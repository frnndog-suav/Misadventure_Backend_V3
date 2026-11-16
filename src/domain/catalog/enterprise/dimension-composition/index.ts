import type { TZoneCard } from '@/domain/catalog/enterprise/value-objects/card'

/**
 * Composição mínima de uma dimensão (README 3.5, Apêndice B I5; REQ-47): só as
 * zonas publicadas entram. Devolve os problemas em pt-BR, na ordem: falta de
 * zona Urbana; setas abaixo de 2 × (zonas − 1). Lista vazia = composição ok.
 * A FEAT-06 estende (Carta de Dimensão e zona de chegada, REQ-36).
 */
export function checkDimensionComposition(
  zones: readonly TZoneCard[]
): string[] {
  const problems: string[] = []

  if (!zones.some((zone) => zone.zoneType === 'urban')) {
    problems.push('A coleção precisa de pelo menos 1 zona Urbana publicada.')
  }

  const arrows = zones.reduce((sum, zone) => sum + zone.connectionArrows, 0)
  const required = 2 * (zones.length - 1)
  if (arrows < required) {
    problems.push(
      `As zonas publicadas têm ${arrows} setas; são precisas pelo menos ${required} (2 × (zonas − 1)).`
    )
  }

  return problems
}
