import { beforeEach, describe, expect, it } from 'vitest'

import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentLockedError } from '@/domain/catalog/application/use-cases/_errors/content-locked-error'
import {
  makeAttributeCard,
  makeItemCard,
  makeZoneCard,
  toCardInput,
} from '../../../../../../test/factories/make-card'
import { FakeCardInputParser } from '../../../../../../test/fakes/fake-card-input-parser'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { ReplaceCardUseCase } from '.'

let store: InMemoryContentStore
let parser: FakeCardInputParser
let sut: ReplaceCardUseCase

const ID = 'fixture.strength-basic'

describe('ReplaceCardUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
    store.cards = [{ status: 'draft', card: makeAttributeCard() }]
    parser = new FakeCardInputParser()
    sut = new ReplaceCardUseCase(store, parser)
  })

  it('REQ-44: substitui a carta inteira mantendo o status (rascunho)', async () => {
    const result = await sut.execute({
      cardId: ID,
      body: toCardInput(makeAttributeCard({ name: 'Força Bruta' })),
    })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorCard).toEqual({
      status: 'draft',
      card: makeAttributeCard({ name: 'Força Bruta' }),
    })
    expect(store.cards).toEqual([
      { status: 'draft', card: makeAttributeCard({ name: 'Força Bruta' }) },
    ])
  })

  it('REQ-44: rascunho com outro slug renomeia (o id antigo deixa de existir)', async () => {
    const result = await sut.execute({
      cardId: ID,
      body: toCardInput(makeAttributeCard(), 'forca-bruta'),
    })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorCard.card.id).toBe('fixture.forca-bruta')
    expect(store.cards.map((entry) => entry.card.id)).toEqual([
      'fixture.forca-bruta',
    ])
    expect((await store.findEditorCard(ID)) === null).toBe(true)
  })

  it('REQ-44: o type pode mudar num rascunho', async () => {
    const result = await sut.execute({
      cardId: ID,
      body: toCardInput(makeItemCard(), 'strength-basic'),
    })

    expect(result.isRight()).toBe(true)
    expect(store.cards[0]?.card.type).toBe('item')
  })

  it('REQ-44: publicada com o mesmo slug → grava direto e continua publicada (catálogo já mostra a nova)', async () => {
    store.cards = [{ status: 'published', card: makeAttributeCard() }]

    const result = await sut.execute({
      cardId: ID,
      body: toCardInput(makeAttributeCard({ name: 'Força Bruta' })),
    })

    expect(result.isRight()).toBe(true)
    expect(store.cards).toEqual([
      { status: 'published', card: makeAttributeCard({ name: 'Força Bruta' }) },
    ])
    expect(await store.findCard(ID)).toMatchObject({ name: 'Força Bruta' })
  })

  it('REQ-44: publicada com outro slug → CONTENT_LOCKED, nada muda', async () => {
    store.cards = [{ status: 'published', card: makeAttributeCard() }]

    const result = await sut.execute({
      cardId: ID,
      body: toCardInput(makeAttributeCard(), 'outra'),
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentLockedError)
    expect(store.cards).toEqual([
      { status: 'published', card: makeAttributeCard() },
    ])
  })

  it('REQ-44: inexistente → CARD_NOT_FOUND, conferida antes do corpo', async () => {
    parser.issues = [{ path: '', reason: 'notAnObject' }]

    const result = await sut.execute({ cardId: 'fixture.nope', body: null })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(CardNotFoundError)
  })

  it('REQ-43: corpo inválido → CONTENT_INVALID, nada muda', async () => {
    const result = await sut.execute({
      cardId: ID,
      body: toCardInput(
        makeAttributeCard({ attributes: ['strength', 'luck'] })
      ),
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentInvalidError)
    expect(result.value).toMatchObject({
      details: {
        fields: [{ path: 'attributes', reason: 'basicAttributeCount' }],
      },
    })
    expect(store.cards).toEqual([
      { status: 'draft', card: makeAttributeCard() },
    ])
  })

  it('REQ-43: slug novo já usado por outra carta → CONTENT_ID_TAKEN, nada muda', async () => {
    store.cards.push({
      status: 'draft',
      card: makeAttributeCard({ id: 'fixture.wisdom', attributes: ['wisdom'] }),
    })

    const result = await sut.execute({
      cardId: ID,
      body: toCardInput(makeAttributeCard(), 'wisdom'),
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentIdTakenError)
    expect(result.value).toMatchObject({
      details: { fields: [{ path: 'slug', reason: 'idTaken' }] },
    })
    expect(store.cards).toHaveLength(2)
  })

  it('REQ-43: o 400 vem antes do CONTENT_LOCKED', async () => {
    store.cards = [{ status: 'published', card: makeAttributeCard() }]

    const result = await sut.execute({
      cardId: ID,
      body: toCardInput(
        makeAttributeCard({ attributes: ['strength', 'luck'] }),
        'outra'
      ),
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentInvalidError)
  })

  it('REQ-45/D-50: a cópia de zona (título repetido) não impede editar a original; a cópia, sim', async () => {
    store.cards = [
      { status: 'published', card: makeZoneCard() },
      {
        status: 'draft',
        card: makeZoneCard({ id: 'fixture.whispering-grove-copia' }),
      },
    ]

    const original = await sut.execute({
      cardId: 'fixture.whispering-grove',
      body: toCardInput(makeZoneCard({ location: 'Floresta' })),
    })
    const copy = await sut.execute({
      cardId: 'fixture.whispering-grove-copia',
      body: toCardInput(makeZoneCard({ id: 'fixture.whispering-grove-copia' })),
    })

    expect(original.isRight()).toBe(true)
    expect(copy.isLeft()).toBe(true)
    if (copy.isRight()) return
    expect(copy.value).toMatchObject({
      details: { fields: [{ path: 'title', reason: 'duplicateTitle' }] },
    })
  })
})
