import { beforeEach, describe, expect, it } from 'vitest'

import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import {
  makeAttributeCard,
  makeCollection,
} from '../../../../../../test/factories/make-card'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'

import { GetCardUseCase } from '.'

let catalog: InMemoryCardCatalog
let sut: GetCardUseCase

describe('GetCardUseCase', () => {
  beforeEach(() => {
    catalog = new InMemoryCardCatalog()
    catalog.collections = [makeCollection()]
    catalog.cards = [makeAttributeCard()]
    sut = new GetCardUseCase(catalog)
  })

  it('REQ-14: devolve a carta pelo id', async () => {
    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.card).toEqual(makeAttributeCard())
  })

  it('REQ-14: carta inexistente → CardNotFoundError', async () => {
    const result = await sut.execute({ cardId: 'fixture.nope' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(CardNotFoundError)
    if (!result.isLeft()) return
    expect(result.value.code).toBe('CARD_NOT_FOUND')
    expect(result.value.message).toBe('Carta não encontrada.')
  })
})
