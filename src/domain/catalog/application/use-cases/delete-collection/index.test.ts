import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentInUseError } from '@/domain/catalog/application/use-cases/_errors/content-in-use-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import {
  makeAttributeCard,
  makeClassDefinition,
} from '../../../../../../test/factories/make-card'
import { makeParty } from '../../../../../../test/factories/make-party'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { DeleteCollectionUseCase } from '.'

let store: InMemoryContentStore
let parties: InMemoryPartiesRepository
let sut: DeleteCollectionUseCase

describe('DeleteCollectionUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    parties = new InMemoryPartiesRepository()
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
    sut = new DeleteCollectionUseCase(store, parties)
  })

  it('REQ-42: apaga a coleção e todas as suas cartas, no editor e no catálogo', async () => {
    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    expect(store.collections.map((c) => c.id)).toEqual(['other'])
    expect(store.cards.map((entry) => entry.card.id)).toEqual(['other.x'])
    expect(await store.findCollection('fixture')).toBeNull()
    expect(await store.findCard('fixture.strength-basic')).toBeNull()
  })

  it('REQ-42: apaga também as classes da coleção', async () => {
    store.classes = [
      { status: 'draft', classDefinition: makeClassDefinition() },
    ]

    await sut.execute({ collectionId: 'fixture' })

    expect(store.classes).toEqual([])
  })

  it('REQ-42: coleção inexistente → COLLECTION_NOT_FOUND, nada muda', async () => {
    const result = await sut.execute({ collectionId: 'nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CollectionNotFoundError)
    expect(store.collections).toHaveLength(2)
  })

  it('REQ-39: coleção com carta usada por um save → CONTENT_IN_USE, nada muda', async () => {
    await parties.create(makeParty())

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isLeft() && result.value).toBeInstanceOf(ContentInUseError)
    expect(store.collections).toHaveLength(2)
    expect(store.cards).toHaveLength(2)
  })

  it('REQ-39: coleção com classe usada por um save → CONTENT_IN_USE', async () => {
    store.classes = [
      {
        status: 'published',
        classDefinition: makeClassDefinition({ collectionId: 'other' }),
      },
    ]
    await parties.create(makeParty())

    const result = await sut.execute({ collectionId: 'other' })

    expect(result.isLeft() && result.value).toBeInstanceOf(ContentInUseError)
  })

  it('REQ-40 (D-60): carta da coleção no starterDeck de classe de outra coleção → CONTENT_REFERENCED', async () => {
    store.classes = [
      {
        status: 'draft',
        classDefinition: makeClassDefinition({ collectionId: 'other' }),
      },
    ]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isLeft() && result.value).toBeInstanceOf(
      ContentReferencedError
    )
    expect(store.collections).toHaveLength(2)
  })

  it('REQ-40: classe da própria coleção, apagada junto, não bloqueia', async () => {
    store.classes = [
      { status: 'draft', classDefinition: makeClassDefinition() },
    ]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
  })
})
