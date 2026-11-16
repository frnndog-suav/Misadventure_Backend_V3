import { beforeEach, describe, expect, it } from 'vitest'

import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import {
  makeAttributeCard,
  makeItemCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { DeleteCardUseCase } from '.'

let store: InMemoryContentStore
let sut: DeleteCardUseCase

describe('DeleteCardUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      { status: 'draft', card: makeItemCard() },
    ]
    sut = new DeleteCardUseCase(store)
  })

  it('REQ-45: exclui a carta (rascunho ou publicada) do editor e do catálogo', async () => {
    const published = await sut.execute({ cardId: 'fixture.strength-basic' })
    const draft = await sut.execute({ cardId: 'fixture.healing-potion' })

    expect(published.isRight()).toBe(true)
    expect(draft.isRight()).toBe(true)
    expect(store.cards).toEqual([])
    expect(await store.findCard('fixture.strength-basic')).toBeNull()
  })

  it('REQ-45: inexistente → CARD_NOT_FOUND, nada muda', async () => {
    const result = await sut.execute({ cardId: 'fixture.nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CardNotFoundError)
    expect(store.cards).toHaveLength(2)
  })
})
