import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { UpdateCollectionUseCase } from '.'

let store: InMemoryContentStore
let sut: UpdateCollectionUseCase

describe('UpdateCollectionUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [
      { id: 'bosque', name: 'Bosque', description: 'Velha.' },
    ]
    sut = new UpdateCollectionUseCase(store)
  })

  it('REQ-42: muda só o name e mantém o id e a description', async () => {
    const result = await sut.execute({
      collectionId: 'bosque',
      body: { name: ' Bosque Antigo ' },
    })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.collection).toMatchObject({
      id: 'bosque',
      name: 'Bosque Antigo',
      description: 'Velha.',
    })
    expect(store.collections).toEqual([
      { id: 'bosque', name: 'Bosque Antigo', description: 'Velha.' },
    ])
  })

  it('REQ-42: muda a description', async () => {
    await sut.execute({ collectionId: 'bosque', body: { description: '' } })

    expect(store.collections[0]?.description).toBe('')
  })

  it('REQ-42: id no corpo → CONTENT_INVALID, nada muda', async () => {
    const result = await sut.execute({
      collectionId: 'bosque',
      body: { id: 'outro' },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentInvalidError)
    expect(result.value).toMatchObject({
      details: { fields: [{ path: 'id', reason: 'idImmutable' }] },
    })
    expect(store.collections[0]?.name).toBe('Bosque')
  })

  it('REQ-42: coleção inexistente → COLLECTION_NOT_FOUND (conferida antes do corpo)', async () => {
    const result = await sut.execute({
      collectionId: 'nope',
      body: { id: 'x' },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CollectionNotFoundError)
  })
})
