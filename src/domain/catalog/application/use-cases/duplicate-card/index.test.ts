import { beforeEach, describe, expect, it } from 'vitest'

import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import {
  makeAttributeCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { DuplicateCardUseCase } from '.'

let store: InMemoryContentStore
let sut: DuplicateCardUseCase

describe('DuplicateCardUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
    store.cards = [{ status: 'published', card: makeAttributeCard() }]
    sut = new DuplicateCardUseCase(store)
  })

  it('REQ-45: cria um rascunho igual com slug <slug>-copia na mesma coleção', async () => {
    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorCard).toEqual({
      status: 'draft',
      card: makeAttributeCard({ id: 'fixture.strength-basic-copia' }),
    })
    expect(store.cards).toHaveLength(2)
    expect(store.cards[0]?.status).toBe('published')
  })

  it('REQ-45: slug ocupado → -copia-2, -copia-3…', async () => {
    await sut.execute({ cardId: 'fixture.strength-basic' })
    const second = await sut.execute({ cardId: 'fixture.strength-basic' })
    const third = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(second.isRight() && second.value.editorCard.card.id).toBe(
      'fixture.strength-basic-copia-2'
    )
    expect(third.isRight() && third.value.editorCard.card.id).toBe(
      'fixture.strength-basic-copia-3'
    )
  })

  it('REQ-45: duplicar não valida de novo; a cópia de zona fica com título repetido', async () => {
    store.cards = [{ status: 'published', card: makeZoneCard() }]

    const result = await sut.execute({ cardId: 'fixture.whispering-grove' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorCard.card).toMatchObject({
      id: 'fixture.whispering-grove-copia',
      title: 'Bosque dos Sussurros',
    })
  })

  it('REQ-45: inexistente → CARD_NOT_FOUND', async () => {
    const result = await sut.execute({ cardId: 'fixture.nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CardNotFoundError)
  })
})
