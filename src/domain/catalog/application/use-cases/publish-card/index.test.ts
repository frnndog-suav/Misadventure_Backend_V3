import { beforeEach, describe, expect, it } from 'vitest'

import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import {
  makeAttributeCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { PublishCardUseCase } from '.'

let store: InMemoryContentStore
let sut: PublishCardUseCase

describe('PublishCardUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
    sut = new PublishCardUseCase(store)
  })

  it('REQ-45: publica um rascunho válido e o catálogo passa a mostrá-lo', async () => {
    store.cards = [{ status: 'draft', card: makeAttributeCard() }]

    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorCard).toEqual({
      status: 'published',
      card: makeAttributeCard(),
    })
    expect(await store.findCard('fixture.strength-basic')).toEqual(
      makeAttributeCard()
    )
  })

  it('REQ-45: já publicada → sucesso sem mudança', async () => {
    store.cards = [{ status: 'published', card: makeAttributeCard() }]

    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorCard.status).toBe('published')
    expect(store.cards).toEqual([
      { status: 'published', card: makeAttributeCard() },
    ])
  })

  it('REQ-45: revalida ao publicar → CONTENT_INVALID e continua rascunho', async () => {
    store.cards = [
      {
        status: 'draft',
        card: makeAttributeCard({ attributes: ['strength', 'luck'] }),
      },
    ]

    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentInvalidError)
    expect(result.value).toMatchObject({
      details: {
        fields: [{ path: 'attributes', reason: 'wrongAttributeCount' }],
      },
    })
    expect(store.cards[0]?.status).toBe('draft')
  })

  it('REQ-45/D-50: publicar a cópia de zona (título repetido) exige a correção', async () => {
    store.cards = [
      { status: 'published', card: makeZoneCard() },
      {
        status: 'draft',
        card: makeZoneCard({ id: 'fixture.whispering-grove-copia' }),
      },
    ]

    const result = await sut.execute({
      cardId: 'fixture.whispering-grove-copia',
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toMatchObject({
      details: { fields: [{ path: 'title', reason: 'duplicateTitle' }] },
    })
    expect(store.cards[1]?.status).toBe('draft')
  })

  it('REQ-45: inexistente → CARD_NOT_FOUND', async () => {
    const result = await sut.execute({ cardId: 'fixture.nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CardNotFoundError)
  })
})
