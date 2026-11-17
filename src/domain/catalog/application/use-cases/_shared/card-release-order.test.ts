import { beforeEach, describe, expect, it } from 'vitest'

import { CreateCardUseCase } from '@/domain/catalog/application/use-cases/create-card'
import { PublishCardUseCase } from '@/domain/catalog/application/use-cases/publish-card'
import { ReplaceCardUseCase } from '@/domain/catalog/application/use-cases/replace-card'
import {
  makeDimensionCard,
  toCardInput,
} from '../../../../../../test/factories/make-card'
import { FakeCardInputParser } from '../../../../../../test/fakes/fake-card-input-parser'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

let store: InMemoryContentStore

const mine = makeDimensionCard({ id: 'fixture.mine', releaseOrder: 1 })
const theirs = makeDimensionCard({
  id: 'other.theirs',
  collectionId: 'other',
  releaseOrder: 1,
})

const issues = [{ path: 'releaseOrder', reason: 'duplicateValue' }]

async function failure(result: Promise<{ isLeft(): boolean; value: unknown }>) {
  const out = await result
  expect(out.isLeft()).toBe(true)
  return (out.value as { details?: { fields: unknown } }).details?.fields
}

describe('REQ-26/REQ-43: releaseOrder único no catálogo todo (outra coleção)', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [
      { id: 'fixture', name: 'A', description: '' },
      { id: 'other', name: 'B', description: '' },
    ]
    store.cards = [{ status: 'published', card: theirs }]
  })

  it('REQ-26: criar Carta de Dimensão com releaseOrder já usado em outra coleção → CONTENT_INVALID em releaseOrder', async () => {
    const sut = new CreateCardUseCase(store, new FakeCardInputParser())

    expect(
      await failure(
        sut.execute({ collectionId: 'fixture', body: toCardInput(mine) })
      )
    ).toEqual(issues)
    expect(store.cards).toHaveLength(1)
  })

  it('REQ-26: com releaseOrder livre, cria', async () => {
    const sut = new CreateCardUseCase(store, new FakeCardInputParser())
    const result = await sut.execute({
      collectionId: 'fixture',
      body: toCardInput({ ...mine, releaseOrder: 2 }),
    })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-26: substituir (PUT) confere o releaseOrder nas outras coleções', async () => {
    store.cards.push({
      status: 'draft',
      card: { ...mine, releaseOrder: 2 },
    })
    const sut = new ReplaceCardUseCase(store, new FakeCardInputParser())

    expect(
      await failure(
        sut.execute({ cardId: 'fixture.mine', body: toCardInput(mine) })
      )
    ).toEqual(issues)
  })

  it('REQ-26: publicar confere o releaseOrder nas outras coleções', async () => {
    store.cards.push({ status: 'draft', card: mine })
    const sut = new PublishCardUseCase(store)

    expect(await failure(sut.execute({ cardId: 'fixture.mine' }))).toEqual(
      issues
    )
    expect(store.cards.find((e) => e.card.id === 'fixture.mine')?.status).toBe(
      'draft'
    )
  })
})
