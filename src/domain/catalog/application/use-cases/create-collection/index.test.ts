import { beforeEach, describe, expect, it } from 'vitest'

import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { CreateCollectionUseCase } from '.'

let store: InMemoryContentStore
let sut: CreateCollectionUseCase

const body = {
  id: 'bosque',
  name: ' Bosque Sombrio ',
  description: 'Coleção de teste do editor.',
}

describe('CreateCollectionUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    sut = new CreateCollectionUseCase(store)
  })

  it('REQ-42: cria a coleção e devolve a EditorCollection zerada', async () => {
    const result = await sut.execute({ body })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.collection).toMatchObject({
      id: 'bosque',
      name: 'Bosque Sombrio',
      description: 'Coleção de teste do editor.',
      publishedCount: 0,
      draftCount: 0,
      tags: [],
    })
    expect(result.value.collection.cardCounts).toEqual({
      zone: 0,
      attribute: 0,
      equipment: 0,
      item: 0,
      randomEvent: 0,
      combatEvent: 0,
      zoneQuest: 0,
      dimension: 0,
    })
    expect(Object.values(result.value.collection.rarityCounts)).toEqual(
      Array(5).fill(0)
    )
    expect(store.collections).toEqual([
      {
        id: 'bosque',
        name: 'Bosque Sombrio',
        description: 'Coleção de teste do editor.',
      },
    ])
  })

  it('REQ-42: corpo inválido → CONTENT_INVALID com todos os problemas, nada gravado', async () => {
    const result = await sut.execute({
      body: { id: 'Bosque X', name: ' ', description: '' },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentInvalidError)
    expect(result.value).toMatchObject({
      code: 'CONTENT_INVALID',
      details: {
        fields: [
          { path: 'id', reason: 'invalidIdFormat' },
          { path: 'name', reason: 'required' },
        ],
      },
    })
    expect(store.collections).toEqual([])
  })

  it('REQ-42: id já usado → CONTENT_ID_TAKEN no path id, nada muda', async () => {
    await sut.execute({ body })

    const result = await sut.execute({ body: { ...body, name: 'Outro' } })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentIdTakenError)
    expect(result.value).toMatchObject({
      code: 'CONTENT_ID_TAKEN',
      details: { fields: [{ path: 'id', reason: 'idTaken' }] },
    })
    expect(store.collections).toHaveLength(1)
  })

  it('REQ-42: a validação vem antes da conferência de id usado', async () => {
    await sut.execute({ body })

    const result = await sut.execute({ body: { ...body, name: '' } })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value.code).toBe('CONTENT_INVALID')
  })
})
