import { beforeEach, describe, expect, it } from 'vitest'

import { CatalogQueryInvalidError } from '@/domain/catalog/application/use-cases/_errors/catalog-query-invalid-error'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import {
  makeAttributeCard,
  makeCollection,
  makeCombatEventCard,
  makeEquipmentCard,
  makeItemCard,
  makeRandomEventCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'

import { ListCollectionCardsUseCase } from '.'

let catalog: InMemoryCardCatalog
let sut: ListCollectionCardsUseCase

describe('ListCollectionCardsUseCase', () => {
  beforeEach(() => {
    catalog = new InMemoryCardCatalog()
    catalog.collections = [
      makeCollection(),
      makeCollection({ id: 'other', name: 'Outra' }),
    ]
    catalog.cards = [
      makeZoneCard(),
      makeRandomEventCard(),
      makeAttributeCard(),
      makeCombatEventCard(),
      makeItemCard(),
      makeEquipmentCard(),
      makeItemCard({ id: 'other.healing-potion', collectionId: 'other' }),
    ]
    sut = new ListCollectionCardsUseCase(catalog)
  })

  it('REQ-13: devolve as cartas da coleção ordenadas por id', async () => {
    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.cards.map((card) => card.id)).toEqual([
      'fixture.blade-of-dusk',
      'fixture.healing-potion',
      'fixture.howling-wolves',
      'fixture.strength-basic',
      'fixture.whispering-grove',
      'fixture.wounded-traveler',
    ])
  })

  it('REQ-13: filtra por tipo', async () => {
    const result = await sut.execute({
      collectionId: 'fixture',
      type: 'attribute',
    })

    if (result.isLeft()) throw new Error('esperava right')
    expect(result.value.cards).toEqual([makeAttributeCard()])
  })

  it('REQ-13: tipo de filtro desconhecido → CatalogQueryInvalidError', async () => {
    for (const type of ['monster', '', ['zone'], 3]) {
      const result = await sut.execute({ collectionId: 'fixture', type })

      expect(result.isLeft()).toBe(true)
      expect(result.value).toBeInstanceOf(CatalogQueryInvalidError)
      if (!result.isLeft()) return
      expect(result.value.code).toBe('CATALOG_QUERY_INVALID')
      expect(result.value.message).toBe('Filtro do catálogo inválido.')
      expect(result.value.details).toEqual({
        field: 'type',
        reason: 'unknownCardType',
      })
    }
  })

  it('REQ-13: coleção inexistente → CollectionNotFoundError', async () => {
    const result = await sut.execute({ collectionId: 'nope' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(CollectionNotFoundError)
    if (!result.isLeft()) return
    expect(result.value.code).toBe('COLLECTION_NOT_FOUND')
    expect(result.value.message).toBe('Coleção não encontrada.')
  })

  it('D-23: tipo inválido é conferido antes da coleção', async () => {
    const result = await sut.execute({ collectionId: 'nope', type: 'monster' })

    expect(result.value).toBeInstanceOf(CatalogQueryInvalidError)
  })
})
