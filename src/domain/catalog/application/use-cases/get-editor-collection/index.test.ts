import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import {
  makeAttributeCard,
  makeCombatEventCard,
  makeEquipmentCard,
  makeItemCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { GetEditorCollectionUseCase } from '.'

let store: InMemoryContentStore
let sut: GetEditorCollectionUseCase

describe('GetEditorCollectionUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [
      { id: 'fixture', name: 'Coleção de Teste', description: '' },
      { id: 'other', name: 'Outra', description: '' },
    ]
    sut = new GetEditorCollectionUseCase(store)
  })

  it('REQ-42: conta todas as cartas (rascunhos inclusive) por tipo e por raridade', async () => {
    store.cards = [
      { status: 'published', card: makeZoneCard() },
      { status: 'published', card: makeCombatEventCard() },
      { status: 'published', card: makeAttributeCard() }, // common
      {
        status: 'draft',
        card: makeAttributeCard({
          id: 'fixture.luck',
          rarity: 'rare',
          attributes: ['luck'],
        }),
      },
      { status: 'published', card: makeEquipmentCard() }, // rare
      { status: 'draft', card: makeItemCard() }, // common
      {
        status: 'published',
        card: makeItemCard({ id: 'other.x', collectionId: 'other' }),
      },
    ]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.collection).toMatchObject({
      id: 'fixture',
      publishedCount: 4,
      draftCount: 2,
      cardCounts: {
        zone: 1,
        attribute: 2,
        equipment: 1,
        item: 1,
        randomEvent: 0,
        combatEvent: 1,
      },
      rarityCounts: {
        common: 2,
        uncommon: 0,
        rare: 2,
        epic: 0,
        legendary: 0,
      },
    })
  })

  it('REQ-42: tags de equipamentos e itens, sem repetição e em ordem alfabética', async () => {
    store.cards = [
      {
        status: 'published',
        card: makeEquipmentCard({ tags: ['Espada', 'Arma'] }),
      },
      { status: 'draft', card: makeItemCard({ tags: ['Poção', 'Arma'] }) },
      {
        status: 'published',
        card: makeItemCard({ id: 'fixture.other', tags: ['Água'] }),
      },
    ]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.collection.tags).toEqual([
      'Água',
      'Arma',
      'Espada',
      'Poção',
    ])
  })

  it('REQ-42: coleção inexistente → COLLECTION_NOT_FOUND', async () => {
    const result = await sut.execute({ collectionId: 'nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CollectionNotFoundError)
  })
})
