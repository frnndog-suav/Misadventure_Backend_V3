import { describe, expect, it } from 'vitest'

import { GetCardUseCase } from '@/domain/catalog/application/use-cases/get-card'
import { ListCollectionCardsUseCase } from '@/domain/catalog/application/use-cases/list-collection-cards'
import { ListCollectionsUseCase } from '@/domain/catalog/application/use-cases/list-collections'

import {
  makeAttributeCard,
  makeItemCard,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

function storeWithDraft() {
  const store = new InMemoryContentStore()
  store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
  store.cards = [
    { status: 'published', card: makeAttributeCard() },
    { status: 'draft', card: makeItemCard() },
  ]
  return store
}

describe('Catálogo só com publicadas', () => {
  it('REQ-41: listas e contagens ignoram rascunhos; rascunho por id → CARD_NOT_FOUND', async () => {
    const store = storeWithDraft()

    const cards = await new ListCollectionCardsUseCase(store).execute({
      collectionId: 'fixture',
    })
    const collections = await new ListCollectionsUseCase(store).execute()
    const draft = await new GetCardUseCase(store).execute({
      cardId: 'fixture.healing-potion',
    })

    expect(cards.isRight() && cards.value.cards.map((c) => c.id)).toEqual([
      'fixture.strength-basic',
    ])
    expect(
      collections.isRight() && collections.value.collections[0]?.cardCounts.item
    ).toBe(0)
    expect(draft.isLeft() && draft.value.code).toBe('CARD_NOT_FOUND')
  })
})
