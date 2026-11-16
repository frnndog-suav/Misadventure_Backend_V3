import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import {
  makeAttributeCard,
  makeCombatEventCard,
  makeEnemy,
  makeZoneCard,
  toCardInput,
} from '../../../../../../test/factories/make-card'
import { FakeCardInputParser } from '../../../../../../test/fakes/fake-card-input-parser'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { CreateCardUseCase } from '.'

let store: InMemoryContentStore
let parser: FakeCardInputParser
let sut: CreateCardUseCase

const attributeBody = toCardInput(makeAttributeCard(), 'strength-basic')

async function fieldsOf(promise: ReturnType<CreateCardUseCase['execute']>) {
  const result = await promise
  expect(result.isLeft()).toBe(true)
  return result.isLeft() ? result.value : null
}

describe('CreateCardUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
    parser = new FakeCardInputParser()
    sut = new CreateCardUseCase(store, parser)
  })

  it('REQ-44: cria a carta como rascunho com id <coleção>.<slug> e collectionId', async () => {
    const result = await sut.execute({
      collectionId: 'fixture',
      body: attributeBody,
    })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorCard).toEqual({
      status: 'draft',
      card: makeAttributeCard(),
    })
    expect(store.cards).toEqual([
      { status: 'draft', card: makeAttributeCard() },
    ])
    expect(await store.findCard('fixture.strength-basic')).toBeNull()
  })

  it('REQ-44: coleção inexistente → COLLECTION_NOT_FOUND, conferida antes do corpo', async () => {
    parser.issues = [{ path: 'type', reason: 'invalidFormat' }]

    const error = await fieldsOf(
      sut.execute({ collectionId: 'nope', body: attributeBody })
    )

    expect(error).toBeInstanceOf(CollectionNotFoundError)
  })

  it('REQ-43: problemas de formato do parser → CONTENT_INVALID, nada gravado', async () => {
    parser.issues = [
      { path: 'enemies.0.health', reason: 'invalidFormat', message: 'Número.' },
    ]

    const error = await fieldsOf(
      sut.execute({ collectionId: 'fixture', body: {} })
    )

    expect(error).toBeInstanceOf(ContentInvalidError)
    expect(error).toMatchObject({
      details: {
        fields: [
          {
            path: 'enemies.0.health',
            reason: 'invalidFormat',
            message: 'Número.',
          },
        ],
      },
    })
    expect(store.cards).toEqual([])
  })

  it('REQ-43: slug fora de kebab-case → problema no path slug', async () => {
    const error = await fieldsOf(
      sut.execute({
        collectionId: 'fixture',
        body: { ...attributeBody, slug: 'Forca Bruta' },
      })
    )

    expect(error).toBeInstanceOf(ContentInvalidError)
    expect(error).toMatchObject({
      details: { fields: [{ path: 'slug', reason: 'invalidIdFormat' }] },
    })
    expect(store.cards).toEqual([])
  })

  it('REQ-43: regra de REQ-15 sobre a carta enviada → problema no campo (attributes)', async () => {
    const error = await fieldsOf(
      sut.execute({
        collectionId: 'fixture',
        body: {
          ...attributeBody,
          slug: 'forca-sorte',
          attributes: ['strength', 'luck'],
        },
      })
    )

    expect(error).toMatchObject({
      details: {
        fields: [{ path: 'attributes', reason: 'basicAttributeCount' }],
      },
    })
    expect(store.cards).toEqual([])
  })

  it('REQ-43: caminho com pontos e índices (enemies.0.health)', async () => {
    const card = makeCombatEventCard({
      enemies: [makeEnemy({ health: 0 })],
    })

    const error = await fieldsOf(
      sut.execute({ collectionId: 'fixture', body: toCardInput(card) })
    )

    expect(error).toMatchObject({
      details: {
        fields: [{ path: 'enemies.0.health', reason: 'outOfRange' }],
      },
    })
  })

  it('REQ-43: título de zona repetido na coleção (rascunho inclusive) → path title', async () => {
    store.cards = [{ status: 'draft', card: makeZoneCard() }]

    const error = await fieldsOf(
      sut.execute({
        collectionId: 'fixture',
        body: toCardInput(makeZoneCard(), 'other-grove'),
      })
    )

    expect(error).toMatchObject({
      details: { fields: [{ path: 'title', reason: 'duplicateTitle' }] },
    })
  })

  it('REQ-43/D-50: um problema de outra carta já gravada não bloqueia esta', async () => {
    store.cards = [
      { status: 'draft', card: makeZoneCard() },
      {
        status: 'draft',
        card: makeZoneCard({ id: 'fixture.whispering-grove-copia' }),
      },
    ]

    const result = await sut.execute({
      collectionId: 'fixture',
      body: attributeBody,
    })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-43: id já usado por outra carta → CONTENT_ID_TAKEN no path slug, nada muda', async () => {
    store.cards = [{ status: 'published', card: makeAttributeCard() }]

    const error = await fieldsOf(
      sut.execute({ collectionId: 'fixture', body: attributeBody })
    )

    expect(error).toBeInstanceOf(ContentIdTakenError)
    expect(error).toMatchObject({
      code: 'CONTENT_ID_TAKEN',
      details: { fields: [{ path: 'slug', reason: 'idTaken' }] },
    })
    expect(store.cards).toHaveLength(1)
  })

  it('REQ-43: o 400 vem antes do 409', async () => {
    store.cards = [{ status: 'draft', card: makeAttributeCard() }]

    const error = await fieldsOf(
      sut.execute({
        collectionId: 'fixture',
        body: { ...attributeBody, attributes: ['strength', 'luck'] },
      })
    )

    expect(error).toBeInstanceOf(ContentInvalidError)
  })
})
