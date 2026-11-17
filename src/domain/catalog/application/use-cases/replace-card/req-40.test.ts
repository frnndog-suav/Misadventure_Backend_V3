import { beforeEach, describe, expect, it } from 'vitest'

import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentLockedError } from '@/domain/catalog/application/use-cases/_errors/content-locked-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import {
  makeAttributeCard,
  makeClassDefinition,
  toCardInput,
} from '../../../../../../test/factories/make-card'
import { FakeCardInputParser } from '../../../../../../test/fakes/fake-card-input-parser'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { ReplaceCardUseCase } from '.'

let store: InMemoryContentStore
let sut: ReplaceCardUseCase

describe('ReplaceCardUseCase: carta usada por classe (REQ-40)', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
    store.cards = [
      { status: 'draft', card: makeAttributeCard() },
      {
        status: 'published',
        card: makeAttributeCard({ id: 'fixture.luck', name: 'Sorte' }),
      },
    ]
    store.classes = [
      {
        status: 'draft',
        classDefinition: makeClassDefinition({
          starterDeck: [
            { cardId: 'fixture.strength-basic', copies: 30 },
            { cardId: 'fixture.luck', copies: 30 },
          ],
        }),
      },
    ]
    sut = new ReplaceCardUseCase(store, new FakeCardInputParser())
  })

  it('REQ-40: renomear (slug novo) carta do starterDeck de classe → CONTENT_REFERENCED, nada muda', async () => {
    const result = await sut.execute({
      cardId: 'fixture.strength-basic',
      body: toCardInput(makeAttributeCard(), 'forca'),
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentReferencedError)
    expect(store.cards.map((e) => e.card.id)).toContain(
      'fixture.strength-basic'
    )
  })

  it('REQ-40: editar sem mudar o slug é permitido', async () => {
    const result = await sut.execute({
      cardId: 'fixture.strength-basic',
      body: toCardInput(makeAttributeCard({ name: 'Força Bruta' })),
    })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-40: a ordem é CONTENT_LOCKED, depois CONTENT_REFERENCED, depois id usado', async () => {
    const locked = await sut.execute({
      cardId: 'fixture.luck',
      body: toCardInput(makeAttributeCard({ id: 'fixture.luck' }), 'sorte'),
    })
    expect(locked.isLeft() && locked.value).toBeInstanceOf(ContentLockedError)

    store.cards.push({
      status: 'draft',
      card: makeAttributeCard({ id: 'fixture.forca', name: 'X' }),
    })
    const referenced = await sut.execute({
      cardId: 'fixture.strength-basic',
      body: toCardInput(makeAttributeCard(), 'forca'),
    })
    expect(referenced.isLeft() && referenced.value).toBeInstanceOf(
      ContentReferencedError
    )

    store.classes = []
    const taken = await sut.execute({
      cardId: 'fixture.strength-basic',
      body: toCardInput(makeAttributeCard(), 'forca'),
    })
    expect(taken.isLeft() && taken.value).toBeInstanceOf(ContentIdTakenError)
  })
})
