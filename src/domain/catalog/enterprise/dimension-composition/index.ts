import { checkQuestReferences } from '@/domain/catalog/enterprise/catalog-integrity'
import type {
  TCard,
  TDimensionCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'

export type TDimensionCompositionInput = Readonly<{
  /** A Carta de Dimensão publicada da coleção (ou `null`). */
  dimension: TDimensionCard | null
  /** Só as zonas publicadas da coleção. */
  zones: readonly TZoneCard[]
  cards?: readonly TCard[]
}>

/**
 * Composição mínima de uma dimensão (README 3.2, 3.5; Apêndice B I5; REQ-36,
 * REQ-47). Devolve os problemas em pt-BR, na ordem: falta de Carta de
 * Dimensão; falta de zona Urbana; zona de chegada que não é Urbana da coleção
 * (ou, sem ela, nenhuma Urbana sem efeito negativo) — só com Carta e alguma
 * Urbana; setas abaixo de 2 × (zonas − 1). Lista vazia = composição ok.
 */
export function checkDimensionComposition({
  dimension,
  zones,
  cards = [],
}: TDimensionCompositionInput): string[] {
  const problems: string[] = []

  if (dimension === null) {
    problems.push('A coleção precisa de 1 Carta de Dimensão publicada.')
  }

  const urban = zones.filter((zone) => zone.zoneType === 'urban')
  if (urban.length === 0) {
    problems.push('A coleção precisa de pelo menos 1 zona Urbana publicada.')
  } else if (dimension !== null) {
    const arrival = dimension.arrivalZoneTitle
    if (arrival !== null && !urban.some((zone) => zone.title === arrival)) {
      problems.push(
        `A zona de chegada "${arrival}" da Carta de Dimensão não é uma zona Urbana publicada da coleção.`
      )
    }
    if (
      arrival === null &&
      urban.every((zone) => zone.effects.some((e) => e.polarity === 'negative'))
    ) {
      problems.push(
        'Sem zona de chegada na Carta de Dimensão, a coleção precisa de pelo menos 1 zona Urbana publicada sem efeito negativo.'
      )
    }
  }

  const arrows = zones.reduce((sum, zone) => sum + zone.connectionArrows, 0)
  const required = 2 * (zones.length - 1)
  if (arrows < required) {
    problems.push(
      `As zonas publicadas têm ${arrows} setas; são precisas pelo menos ${required} (2 × (zonas − 1)).`
    )
  }

  const cardsById = new Map([...cards, ...zones].map((card) => [card.id, card]))
  const questIds = new Set<string>()
  for (const zone of zones) {
    checkQuestReferences(zone, cardsById, (field) => {
      const index = Number(field.split('.')[1])
      problems.push(
        `A zona ${zone.id} referencia uma missão inválida: ${zone.questDeck?.[index]}.`
      )
    })
    for (const id of zone.questDeck ?? []) {
      if (questIds.has(id))
        problems.push(
          `A missão ${id} está repetida nos decks de zona da dimensão.`
        )
      questIds.add(id)
    }
  }
  for (const card of cards) {
    if (card.type !== 'zoneQuest') continue
    checkQuestReferences(card, cardsById, (field) => {
      problems.push(
        `A missão ${card.id} tem uma referência inválida em ${field}.`
      )
    })
    card.stages.forEach(({ location }, index) => {
      if (
        location.type === 'zoneTitle' &&
        zones.filter(({ title }) => title === location.title).length > 1
      ) {
        problems.push(
          `A etapa ${index + 1} da missão ${card.id} exige um título de zona único: ${location.title}.`
        )
      }
    })
  }
  return problems
}
