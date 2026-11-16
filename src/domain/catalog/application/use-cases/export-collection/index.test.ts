import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import {
  makeAttributeCard,
  makeItemCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { ExportCollectionUseCase } from '.'

let store: InMemoryContentStore
let sut: ExportCollectionUseCase

describe('ExportCollectionUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [
      { id: 'fixture', name: 'Coleção de Teste', description: 'Teste.' },
      { id: 'other', name: 'Outra', description: '' },
    ]
    store.cards = [
      { status: 'draft', card: makeItemCard() },
      { status: 'published', card: makeAttributeCard() },
      {
        status: 'published',
        card: makeItemCard({ id: 'other.x', collectionId: 'other' }),
      },
    ]
    sut = new ExportCollectionUseCase(store)
  })

  it('REQ-48: exporta a coleção com todas as cartas (todos os status) por id e classes vazias', async () => {
    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.file).toEqual({
      formatVersion: 1,
      collection: {
        id: 'fixture',
        name: 'Coleção de Teste',
        description: 'Teste.',
      },
      cards: [
        { status: 'draft', card: makeItemCard() },
        { status: 'published', card: makeAttributeCard() },
      ],
      classes: [],
    })
  })

  it('REQ-48: inexistente → COLLECTION_NOT_FOUND', async () => {
    const result = await sut.execute({ collectionId: 'nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CollectionNotFoundError)
  })
})
