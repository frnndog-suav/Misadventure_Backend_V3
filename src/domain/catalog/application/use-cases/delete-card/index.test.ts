import { beforeEach, describe, expect, it } from 'vitest'

import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import { ContentInUseError } from '@/domain/catalog/application/use-cases/_errors/content-in-use-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import {
  makeAttributeCard,
  makeClassDefinition,
  makeItemCard,
} from '../../../../../../test/factories/make-card'
import { makeParty } from '../../../../../../test/factories/make-party'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { DeleteCardUseCase } from '.'

let store: InMemoryContentStore
let parties: InMemoryPartiesRepository
let sut: DeleteCardUseCase

describe('DeleteCardUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    parties = new InMemoryPartiesRepository()
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      { status: 'draft', card: makeItemCard() },
    ]
    sut = new DeleteCardUseCase(store, parties)
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

  it('REQ-39: carta usada por um save (build, zona do mapa) → CONTENT_IN_USE, nada muda', async () => {
    store.cards.push({
      status: 'published',
      card: makeAttributeCard({ id: 'fixture.gray-harbor' }),
    })
    await parties.create(makeParty())

    for (const cardId of ['fixture.strength-basic', 'fixture.gray-harbor']) {
      const result = await sut.execute({ cardId })
      expect(result.isLeft()).toBe(true)
      if (result.isRight()) return
      expect(result.value).toBeInstanceOf(ContentInUseError)
    }
    expect(store.cards).toHaveLength(3)
  })

  it('REQ-39: apagado o grupo, a carta deixa de estar em uso', async () => {
    const party = makeParty()
    await parties.create(party)
    await parties.delete(party)

    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-40: carta no starterDeck de uma classe (rascunho ou publicada) → CONTENT_REFERENCED, nada muda', async () => {
    store.classes = [
      { status: 'draft', classDefinition: makeClassDefinition() },
    ]

    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentReferencedError)
    expect(store.cards).toHaveLength(2)
  })

  it('REQ-40: com a classe apagada, a carta pode ser excluída', async () => {
    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-39/REQ-40: com os dois, vale CONTENT_IN_USE', async () => {
    store.classes = [
      { status: 'draft', classDefinition: makeClassDefinition() },
    ]
    await parties.create(makeParty())

    const result = await sut.execute({ cardId: 'fixture.strength-basic' })

    expect(result.isLeft() && result.value).toBeInstanceOf(ContentInUseError)
  })
})
