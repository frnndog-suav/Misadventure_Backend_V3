import { beforeEach, describe, expect, it } from 'vitest'

import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import { CreateCardUseCase } from '@/domain/catalog/application/use-cases/create-card'
import { DeleteCardUseCase } from '@/domain/catalog/application/use-cases/delete-card'
import { DeleteCollectionUseCase } from '@/domain/catalog/application/use-cases/delete-collection'
import { ImportCollectionUseCase } from '@/domain/catalog/application/use-cases/import-collection'
import { PublishCardUseCase } from '@/domain/catalog/application/use-cases/publish-card'
import { ReplaceCardUseCase } from '@/domain/catalog/application/use-cases/replace-card'
import type { TDimensionCard } from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeDimensionCard,
  makeItemCard,
  makeZoneCard,
  toCardInput,
} from '../../../../../../test/factories/make-card'
import { FakeCardInputParser } from '../../../../../../test/fakes/fake-card-input-parser'
import { FakeClassInputParser } from '../../../../../../test/fakes/fake-class-input-parser'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

/**
 * REQ-82 no editor: cartas citadas em `rewardDecks` são procuradas em todas as
 * coleções; ao publicar precisam estar publicadas; carta citada não pode ser
 * excluída nem renomeada (CONTENT_REFERENCED).
 */

const ore = makeItemCard({
  id: 'other.iron-ore',
  collectionId: 'other',
  name: 'Minério de Ferro',
  itemCategory: 'material',
  scavengeTool: 'pickaxe',
})

function dimension(cardId: string, override: Partial<TDimensionCard> = {}) {
  return makeDimensionCard({
    rewardDecks: [{ zoneType: 'urban', cards: [{ cardId, copies: 1 }] }],
    ...override,
  })
}

let store: InMemoryContentStore
let parties: InMemoryPartiesRepository

function fieldsOf(result: { isLeft(): boolean; value: unknown }) {
  expect(result.value).toBeInstanceOf(ContentInvalidError)
  return (result.value as ContentInvalidError).details.fields
}

describe('REQ-82: decks de recompensas no editor', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    parties = new InMemoryPartiesRepository()
    store.collections = [
      { id: 'fixture', name: 'Coleção', description: '' },
      { id: 'other', name: 'Outra', description: '' },
    ]
    store.cards = [{ status: 'draft', card: ore }]
  })

  it('REQ-82: criar Carta de Dimensão citando carta de outra coleção é aceito', async () => {
    const sut = new CreateCardUseCase(store, new FakeCardInputParser())
    const result = await sut.execute({
      collectionId: 'fixture',
      body: toCardInput(dimension(ore.id)),
    })
    expect(result.isRight()).toBe(true)
  })

  it('REQ-82: carta citada inexistente → CONTENT_INVALID no path do cardId', async () => {
    const sut = new CreateCardUseCase(store, new FakeCardInputParser())
    const result = await sut.execute({
      collectionId: 'fixture',
      body: toCardInput(dimension('other.nope')),
    })
    expect(fieldsOf(result)).toEqual([
      { path: 'rewardDecks.0.cards.0.cardId', reason: 'unknownCard' },
    ])
  })

  it('REQ-82: publicar com carta citada em rascunho → rewardDeckCardNotPublished; publicada → aceito', async () => {
    store.cards.push({ status: 'draft', card: dimension(ore.id) })
    const sut = new PublishCardUseCase(store)

    const blocked = await sut.execute({ cardId: 'fixture.misty-realm' })
    expect(fieldsOf(blocked)).toEqual([
      {
        path: 'rewardDecks.0.cards.0.cardId',
        reason: 'rewardDeckCardNotPublished',
      },
    ])

    store.cards[0] = { status: 'published', card: ore }
    expect(
      (await sut.execute({ cardId: 'fixture.misty-realm' })).isRight()
    ).toBe(true)
  })

  it('REQ-82: editar Carta de Dimensão publicada citando rascunho → rewardDeckCardNotPublished', async () => {
    store.cards.push({ status: 'published', card: dimension(ore.id) })
    const sut = new ReplaceCardUseCase(store, new FakeCardInputParser())
    const result = await sut.execute({
      cardId: 'fixture.misty-realm',
      body: toCardInput(dimension(ore.id, { name: 'Outro Nome' })),
    })
    expect(fieldsOf(result)).toEqual([
      {
        path: 'rewardDecks.0.cards.0.cardId',
        reason: 'rewardDeckCardNotPublished',
      },
    ])
  })

  it('REQ-82: excluir carta citada (dimensão em rascunho) → CONTENT_REFERENCED de deck de recompensas, nada muda', async () => {
    store.cards.push({ status: 'draft', card: dimension(ore.id) })
    const result = await new DeleteCardUseCase(store, parties).execute({
      cardId: ore.id,
    })
    expect(result.value).toBeInstanceOf(ContentReferencedError)
    expect((result.value as ContentReferencedError).message).toBe(
      'Esta carta está no deck de recompensas de uma Carta de Dimensão.'
    )
    expect(store.cards).toHaveLength(2)
  })

  it('REQ-82: renomear carta citada → CONTENT_REFERENCED', async () => {
    store.cards.push({ status: 'draft', card: dimension(ore.id) })
    const result = await new ReplaceCardUseCase(
      store,
      new FakeCardInputParser()
    ).execute({ cardId: ore.id, body: toCardInput(ore, 'ore') })
    expect(result.value).toBeInstanceOf(ContentReferencedError)
  })

  it('D-91: editar carta citada mudando o tipo para fora do deck → CONTENT_REFERENCED; mantendo um tipo do deck → aceito', async () => {
    store.cards.push({ status: 'draft', card: dimension(ore.id) })
    const sut = new ReplaceCardUseCase(store, new FakeCardInputParser())

    const toZone = await sut.execute({
      cardId: ore.id,
      body: toCardInput(
        makeZoneCard({
          id: ore.id,
          collectionId: 'other',
          title: 'Veio de Ferro',
        })
      ),
    })
    expect(toZone.value).toBeInstanceOf(ContentReferencedError)
    expect(store.cards[0].card.type).toBe('item')

    const sameType = await sut.execute({
      cardId: ore.id,
      body: toCardInput({ ...ore, name: 'Minério Bruto' }),
    })
    expect(sameType.isRight()).toBe(true)
  })

  it('D-91: import com replace mantendo o id de carta citada e mudando o tipo para fora do deck → CONTENT_REFERENCED', async () => {
    store.cards.push({ status: 'draft', card: dimension(ore.id) })
    const result = await new ImportCollectionUseCase(
      store,
      new FakeCardInputParser(),
      new FakeClassInputParser(),
      parties
    ).execute({
      body: {
        formatVersion: 1,
        collection: { id: 'other', name: 'Outra', description: '' },
        cards: [
          {
            status: 'draft',
            card: makeZoneCard({
              id: ore.id,
              collectionId: 'other',
              title: 'Veio de Ferro',
            }),
          },
        ],
      },
      replace: 'true',
    })
    expect(result.value).toBeInstanceOf(ContentReferencedError)
  })

  it('REQ-82: excluir a coleção de uma carta citada por dimensão de outra coleção → CONTENT_REFERENCED', async () => {
    store.cards.push({ status: 'draft', card: dimension(ore.id) })
    const result = await new DeleteCollectionUseCase(store, parties).execute({
      collectionId: 'other',
    })
    expect(result.value).toBeInstanceOf(ContentReferencedError)
  })

  it('REQ-82: import com dimensão citando carta de outra coleção é aceito; substituir removendo carta citada → CONTENT_REFERENCED', async () => {
    const sut = new ImportCollectionUseCase(
      store,
      new FakeCardInputParser(),
      new FakeClassInputParser(),
      parties
    )
    const accepted = await sut.execute({
      body: {
        formatVersion: 1,
        collection: { id: 'fixture', name: 'Coleção', description: '' },
        cards: [{ status: 'draft', card: dimension(ore.id) }],
      },
      replace: 'true',
    })
    expect(accepted.isRight()).toBe(true)

    const removing = await sut.execute({
      body: {
        formatVersion: 1,
        collection: { id: 'other', name: 'Outra', description: '' },
        cards: [],
      },
      replace: 'true',
    })
    expect(removing.value).toBeInstanceOf(ContentReferencedError)
  })
})
