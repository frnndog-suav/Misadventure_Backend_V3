import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { makeClassDefinition } from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { ListEditorClassesUseCase } from '.'

let store: InMemoryContentStore
let sut: ListEditorClassesUseCase

describe('ListEditorClassesUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [
      { id: 'fixture', name: 'A', description: '' },
      { id: 'bosque', name: 'B', description: '' },
    ]
    store.classes = [
      {
        status: 'published',
        classDefinition: makeClassDefinition({ playerClass: 'warrior' }),
      },
      {
        status: 'draft',
        classDefinition: makeClassDefinition({
          playerClass: 'mage',
          name: 'Mago',
        }),
      },
      {
        status: 'draft',
        classDefinition: makeClassDefinition({
          playerClass: 'rogue',
          name: 'Ladino',
          collectionId: 'bosque',
        }),
      },
    ]
    sut = new ListEditorClassesUseCase(store)
  })

  it('REQ-38: lista as classes da coleção (todos os status) por playerClass', async () => {
    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight() && result.value.classes).toEqual([
      { playerClass: 'mage', name: 'Mago', status: 'draft' },
      { playerClass: 'warrior', name: 'Guerreiro', status: 'published' },
    ])
  })

  it('REQ-38: coleção sem classes → lista vazia; inexistente → COLLECTION_NOT_FOUND', async () => {
    store.classes = []

    const empty = await sut.execute({ collectionId: 'fixture' })
    const missing = await sut.execute({ collectionId: 'nope' })

    expect(empty.isRight() && empty.value.classes).toEqual([])
    expect(missing.isLeft() && missing.value).toBeInstanceOf(
      CollectionNotFoundError
    )
  })
})
