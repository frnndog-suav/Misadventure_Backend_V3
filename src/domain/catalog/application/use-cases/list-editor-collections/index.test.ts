import { beforeEach, describe, expect, it } from 'vitest'

import {
  makeAttributeCard,
  makeItemCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { ListEditorCollectionsUseCase } from '.'

let store: InMemoryContentStore
let sut: ListEditorCollectionsUseCase

describe('ListEditorCollectionsUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    sut = new ListEditorCollectionsUseCase(store)
  })

  it('REQ-42: lista as coleções por id com as contagens de publicadas e rascunhos', async () => {
    store.collections = [
      { id: 'zeta', name: 'Zeta', description: '' },
      { id: 'fixture', name: 'Coleção de Teste', description: 'Teste.' },
    ]
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      { status: 'published', card: makeItemCard() },
      {
        status: 'draft',
        card: makeAttributeCard({ id: 'fixture.wisdom', name: 'Sabedoria' }),
      },
    ]

    const result = await sut.execute()

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.collections).toEqual([
      {
        id: 'fixture',
        name: 'Coleção de Teste',
        description: 'Teste.',
        publishedCount: 2,
        draftCount: 1,
      },
      {
        id: 'zeta',
        name: 'Zeta',
        description: '',
        publishedCount: 0,
        draftCount: 0,
      },
    ])
  })

  it('REQ-42: sem coleções devolve lista vazia', async () => {
    const result = await sut.execute()

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.collections).toEqual([])
  })
})
