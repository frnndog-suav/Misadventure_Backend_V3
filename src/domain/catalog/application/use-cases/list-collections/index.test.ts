import { beforeEach, describe, expect, it } from 'vitest'

import {
  makeAttributeCard,
  makeDimensionCard,
  makeCollection,
  makeItemCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'

import { ListCollectionsUseCase } from '.'

let catalog: InMemoryCardCatalog
let sut: ListCollectionsUseCase

describe('ListCollectionsUseCase', () => {
  beforeEach(() => {
    catalog = new InMemoryCardCatalog()
    sut = new ListCollectionsUseCase(catalog)
  })

  it('REQ-12: catálogo vazio devolve lista vazia', async () => {
    const result = await sut.execute()

    expect(result.isRight()).toBe(true)
    expect(result.value.collections).toEqual([])
  })

  it('REQ-12, REQ-28: devolve cada coleção com o total de cartas por tipo (com dimension), em ordem de id', async () => {
    catalog.collections = [
      makeCollection({ id: 'zeta', name: 'Zeta' }),
      makeCollection(),
    ]
    catalog.cards = [
      makeZoneCard(),
      makeAttributeCard(),
      makeItemCard(),
      makeItemCard({ id: 'fixture.antidote' }),
      makeDimensionCard(),
    ]

    const result = await sut.execute()

    expect(result.value.collections).toEqual([
      {
        id: 'fixture',
        name: 'Coleção de Teste',
        cardCounts: {
          zone: 1,
          attribute: 1,
          equipment: 0,
          item: 2,
          randomEvent: 0,
          combatEvent: 0,
          zoneQuest: 0,
          dimension: 1,
        },
      },
      {
        id: 'zeta',
        name: 'Zeta',
        cardCounts: {
          zone: 0,
          attribute: 0,
          equipment: 0,
          item: 0,
          randomEvent: 0,
          combatEvent: 0,
          zoneQuest: 0,
          dimension: 0,
        },
      },
    ])
  })
})
