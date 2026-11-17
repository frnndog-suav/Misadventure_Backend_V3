import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import {
  makeAttributeCard,
  makeDimensionCard,
  makeUrbanZoneCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { ValidateDimensionUseCase } from '.'

/** Carta de Dimensão publicada sem zona de chegada: isola as regras de zonas (REQ-47). */
const DIMENSION = {
  status: 'published' as const,
  card: makeDimensionCard({ arrivalZoneTitle: null }),
}

let store: InMemoryContentStore
let sut: ValidateDimensionUseCase

describe('ValidateDimensionUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
    sut = new ValidateDimensionUseCase(store)
  })

  it('REQ-47: a coleção com uma zona não Urbana é inválida', async () => {
    store.cards = [
      DIMENSION,
      { status: 'published', card: makeZoneCard() },
      { status: 'published', card: makeAttributeCard() },
    ]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value).toEqual({
      valid: false,
      problems: ['A coleção precisa de pelo menos 1 zona Urbana publicada.'],
    })
  })

  it('REQ-47: confere só as zonas publicadas (a Urbana em rascunho não conta)', async () => {
    store.cards = [DIMENSION, { status: 'draft', card: makeUrbanZoneCard() }]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.valid).toBe(false)
  })

  it('REQ-47: conta só as zonas publicadas (rascunhos não entram na soma nem no total)', async () => {
    // Se os 3 rascunhos contassem, 4 zonas pediriam 6 setas e só haveria 4.
    store.cards = [
      DIMENSION,
      { status: 'published', card: makeUrbanZoneCard({ connectionArrows: 4 }) },
      ...['a', 'b', 'c'].map((id) => ({
        status: 'draft' as const,
        card: makeZoneCard({
          id: `fixture.${id}`,
          title: id,
          connectionArrows: 0,
        }),
      })),
    ]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value).toEqual({ valid: true, problems: [] })
  })

  it('REQ-47: setas insuficientes → texto com N e M', async () => {
    store.cards = [
      DIMENSION,
      {
        status: 'published',
        card: makeUrbanZoneCard({ connectionArrows: 1 }),
      },
      {
        status: 'published',
        card: makeZoneCard({
          id: 'fixture.a',
          title: 'A',
          connectionArrows: 1,
        }),
      },
      {
        status: 'published',
        card: makeZoneCard({
          id: 'fixture.b',
          title: 'B',
          connectionArrows: 1,
        }),
      },
    ]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value).toEqual({
      valid: false,
      problems: [
        'As zonas publicadas têm 3 setas; são precisas pelo menos 4 (2 × (zonas − 1)).',
      ],
    })
  })

  it('REQ-36: Carta de Dimensão só em rascunho não conta → o problema da Carta', async () => {
    store.cards = [
      { status: 'draft', card: makeDimensionCard() },
      { status: 'published', card: makeUrbanZoneCard() },
    ]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value).toEqual({
      valid: false,
      problems: ['A coleção precisa de 1 Carta de Dimensão publicada.'],
    })
  })

  it('REQ-36: a zona de chegada da Carta publicada é conferida', async () => {
    store.cards = [
      {
        status: 'published',
        card: makeDimensionCard({ arrivalZoneTitle: 'X' }),
      },
      { status: 'published', card: makeUrbanZoneCard() },
    ]

    const result = await sut.execute({ collectionId: 'fixture' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.problems).toEqual([
      'A zona de chegada "X" da Carta de Dimensão não é uma zona Urbana publicada da coleção.',
    ])
  })

  it('REQ-47: coleção inexistente → COLLECTION_NOT_FOUND', async () => {
    const result = await sut.execute({ collectionId: 'nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CollectionNotFoundError)
  })
})
