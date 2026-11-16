import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import {
  makeAttributeCard,
  makeItemCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { ListEditorCardsUseCase } from '.'

let store: InMemoryContentStore
let sut: ListEditorCardsUseCase

describe('ListEditorCardsUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [
      { id: 'fixture', name: 'Coleção de Teste', description: '' },
      { id: 'other', name: 'Outra', description: '' },
    ]
    store.cards = [
      { status: 'published', card: makeZoneCard() },
      { status: 'draft', card: makeAttributeCard() },
      {
        status: 'published',
        card: makeAttributeCard({
          id: 'fixture.agility',
          name: 'Agilidade',
          attributes: ['dexterity'],
        }),
      },
      { status: 'draft', card: makeItemCard() },
      {
        status: 'published',
        card: makeItemCard({ id: 'other.x', collectionId: 'other' }),
      },
    ]
    sut = new ListEditorCardsUseCase(store)
  })

  async function list(request: Record<string, unknown> = {}) {
    const result = await sut.execute({ collectionId: 'fixture', ...request })
    expect(result.isRight()).toBe(true)
    return result.isRight() ? result.value.cards : []
  }

  it('REQ-46: devolve id, type, name (ou title) e status por id, de todos os status', async () => {
    expect(await list()).toEqual([
      {
        id: 'fixture.agility',
        type: 'attribute',
        name: 'Agilidade',
        status: 'published',
      },
      {
        id: 'fixture.healing-potion',
        type: 'item',
        name: 'Poção de Cura',
        status: 'draft',
      },
      {
        id: 'fixture.strength-basic',
        type: 'attribute',
        name: 'Força',
        status: 'draft',
      },
      {
        id: 'fixture.whispering-grove',
        type: 'zone',
        name: 'Bosque dos Sussurros',
        status: 'published',
      },
    ])
  })

  it('REQ-46: filtra por type', async () => {
    const cards = await list({ type: 'attribute' })

    expect(cards.map((card) => card.id)).toEqual([
      'fixture.agility',
      'fixture.strength-basic',
    ])
  })

  it('REQ-46: filtra por status', async () => {
    const cards = await list({ status: 'draft' })

    expect(cards.map((card) => card.id)).toEqual([
      'fixture.healing-potion',
      'fixture.strength-basic',
    ])
  })

  it('REQ-46: q contém, sem diferenciar maiúsculas nem acentos', async () => {
    expect((await list({ q: 'forca' })).map((card) => card.id)).toEqual([
      'fixture.strength-basic',
    ])
    expect((await list({ q: 'POÇÃO' })).map((card) => card.id)).toEqual([
      'fixture.healing-potion',
    ])
    expect((await list({ q: 'sussurros' })).map((card) => card.id)).toEqual([
      'fixture.whispering-grove',
    ])
  })

  it('REQ-46: q vazio = sem filtro', async () => {
    expect(await list({ q: '' })).toHaveLength(4)
  })

  it('REQ-46: os filtros se combinam com "e"', async () => {
    const cards = await list({ type: 'attribute', status: 'draft', q: 'for' })

    expect(cards.map((card) => card.id)).toEqual(['fixture.strength-basic'])
  })

  it.each([
    ['type', 'monster'],
    ['type', ''],
    ['type', ['item', 'zone']],
    ['status', 'archived'],
    ['status', ''],
    ['status', ['draft', 'published']],
    ['q', ['a', 'b']],
  ])(
    'REQ-46: filtro %s=%j inválido → CONTENT_INVALID no parâmetro',
    async (name, value) => {
      const result = await sut.execute({
        collectionId: 'fixture',
        [name as string]: value,
      })

      expect(result.isLeft()).toBe(true)
      if (result.isRight()) return
      expect(result.value).toBeInstanceOf(ContentInvalidError)
      expect(result.value).toMatchObject({
        details: { fields: [{ path: name }] },
      })
    }
  )

  it('REQ-46: razões dos filtros inválidos', async () => {
    const reasons = async (request: Record<string, unknown>) => {
      const result = await sut.execute({ collectionId: 'fixture', ...request })
      return result.isLeft() ? result.value.details : null
    }

    expect(await reasons({ type: 'monster' })).toEqual({
      fields: [{ path: 'type', reason: 'unknownCardType' }],
    })
    expect(await reasons({ status: 'x' })).toEqual({
      fields: [{ path: 'status', reason: 'unknownStatus' }],
    })
    expect(await reasons({ q: ['a', 'b'] })).toEqual({
      fields: [{ path: 'q', reason: 'repeatedParam' }],
    })
  })

  it('REQ-46: o filtro é conferido antes da existência da coleção', async () => {
    const result = await sut.execute({ collectionId: 'nope', type: 'monster' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentInvalidError)
  })

  it('REQ-46: coleção inexistente → COLLECTION_NOT_FOUND', async () => {
    const result = await sut.execute({ collectionId: 'nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CollectionNotFoundError)
  })
})
