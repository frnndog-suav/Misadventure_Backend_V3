import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { makeAttributeCard } from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { DeleteCollectionUseCase } from '.'

let store: InMemoryContentStore
let sut: DeleteCollectionUseCase

describe('DeleteCollectionUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [
      { id: 'fixture', name: 'A', description: '' },
      { id: 'other', name: 'B', description: '' },
    ]
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      {
        status: 'draft',
        card: makeAttributeCard({ id: 'other.x', collectionId: 'other' }),
      },
    ]
    sut = new DeleteCollectionUseCase(store)
  })

  it('REQ-42: apaga a coleção e todas as suas cartas, no editor e no catálogo', async () => {
    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    expect(store.collections.map((c) => c.id)).toEqual(['other'])
    expect(store.cards.map((entry) => entry.card.id)).toEqual(['other.x'])
    expect(await store.findCollection('fixture')).toBeNull()
    expect(await store.findCard('fixture.strength-basic')).toBeNull()
  })

  it('REQ-42: coleção inexistente → COLLECTION_NOT_FOUND, nada muda', async () => {
    const result = await sut.execute({ collectionId: 'nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CollectionNotFoundError)
    expect(store.collections).toHaveLength(2)
  })
})
