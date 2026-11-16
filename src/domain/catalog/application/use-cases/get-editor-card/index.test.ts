import { beforeEach, describe, expect, it } from 'vitest'

import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import { makeAttributeCard } from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { GetEditorCardUseCase } from '.'

let store: InMemoryContentStore
let sut: GetEditorCardUseCase

describe('GetEditorCardUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.cards = [{ status: 'draft', card: makeAttributeCard() }]
    sut = new GetEditorCardUseCase(store)
  })

  it('REQ-44: devolve a carta com o status, mesmo rascunho', async () => {
    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorCard).toEqual({
      status: 'draft',
      card: makeAttributeCard(),
    })
  })

  it('REQ-44: inexistente → CARD_NOT_FOUND', async () => {
    const result = await sut.execute({ cardId: 'fixture.nope' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CardNotFoundError)
  })
})
