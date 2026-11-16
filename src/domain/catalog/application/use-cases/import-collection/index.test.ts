import { beforeEach, describe, expect, it } from 'vitest'

import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ExportCollectionUseCase } from '@/domain/catalog/application/use-cases/export-collection'
import {
  makeAttributeCard,
  makeItemCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import { FakeCardInputParser } from '../../../../../../test/fakes/fake-card-input-parser'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { ImportCollectionUseCase } from '.'

let store: InMemoryContentStore
let parser: FakeCardInputParser
let sut: ImportCollectionUseCase

const collection = {
  id: 'fixture',
  name: 'Coleção de Teste',
  description: 'Teste.',
}

function file(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    collection,
    cards: [
      { status: 'published', card: makeAttributeCard() },
      { status: 'draft', card: makeItemCard() },
    ],
    ...overrides,
  }
}

async function fieldsOf(body: unknown, replace?: string) {
  const result = await sut.execute({ body, replace })
  expect(result.isLeft()).toBe(true)
  if (result.isRight()) return null
  return { error: result.value, fields: result.value.details?.fields }
}

describe('ImportCollectionUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    parser = new FakeCardInputParser()
    sut = new ImportCollectionUseCase(store, parser)
  })

  it('REQ-48: importa a coleção nova, com o status de cada carta vindo do arquivo', async () => {
    const result = await sut.execute({ body: file() })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value).toEqual({
      collectionId: 'fixture',
      cardCount: 2,
      classCount: 0,
    })
    expect(store.collections).toEqual([collection])
    expect(store.cards).toEqual([
      { status: 'published', card: makeAttributeCard() },
      { status: 'draft', card: makeItemCard() },
    ])
  })

  it('REQ-48: classes ausente = [] e classes: [] é aceito', async () => {
    expect((await sut.execute({ body: file() })).isRight()).toBe(true)
    store.collections = []
    store.cards = []
    expect((await sut.execute({ body: file({ classes: [] }) })).isRight()).toBe(
      true
    )
  })

  it('REQ-48: corpo que não é objeto → problema no path ""', async () => {
    const out = await fieldsOf('texto')

    expect(out?.error).toBeInstanceOf(ContentInvalidError)
    expect(out?.fields).toEqual([{ path: '', reason: 'notAnObject' }])
  })

  it('REQ-48: {} → versão não suportada, coleção e cartas faltando; nada gravado', async () => {
    const out = await fieldsOf({})

    expect(out?.error).toBeInstanceOf(ContentInvalidError)
    expect(out?.fields).toEqual([
      { path: 'formatVersion', reason: 'unsupportedFormatVersion' },
      { path: 'collection', reason: 'notAnObject' },
      { path: 'cards', reason: 'invalidFormat' },
    ])
    expect(store.collections).toEqual([])
  })

  it('REQ-48: formatVersion diferente de 1 → path formatVersion', async () => {
    const out = await fieldsOf(file({ formatVersion: 2 }))

    expect(out?.fields).toEqual([
      { path: 'formatVersion', reason: 'unsupportedFormatVersion' },
    ])
  })

  it('REQ-48: collection pelas regras de REQ-42, com paths collection.*', async () => {
    const out = await fieldsOf(
      file({ collection: { id: 'Bosque X', name: ' ', description: '' } })
    )

    expect(out?.fields).toEqual([
      { path: 'collection.id', reason: 'invalidIdFormat' },
      { path: 'collection.name', reason: 'required' },
    ])
  })

  it('REQ-48: cada carta pelas regras de REQ-43, com paths cards.N.card.*', async () => {
    const out = await fieldsOf(
      file({
        cards: [
          { status: 'published', card: makeAttributeCard() },
          {
            status: 'draft',
            card: makeAttributeCard({
              id: 'fixture.luck',
              attributes: ['strength', 'luck'],
            }),
          },
        ],
      })
    )

    expect(out?.fields).toEqual([
      { path: 'cards.1.card.attributes', reason: 'basicAttributeCount' },
    ])
  })

  it('REQ-48: problema de formato do parser ganha o prefixo cards.N.card.', async () => {
    parser.issues = [{ path: 'enemies.0.health', reason: 'invalidFormat' }]

    const out = await fieldsOf(file({ cards: [file().cards[0]] }))

    expect(out?.fields).toEqual([
      { path: 'cards.0.card.enemies.0.health', reason: 'invalidFormat' },
    ])
  })

  it('REQ-48: card.collectionId diferente de collection.id → cards.N.card.collectionId', async () => {
    const out = await fieldsOf(
      file({
        cards: [
          {
            status: 'draft',
            card: makeAttributeCard({ collectionId: 'other' }),
          },
        ],
      })
    )

    expect(out?.fields).toEqual([
      { path: 'cards.0.card.collectionId', reason: 'collectionMismatch' },
    ])
  })

  it('REQ-48: id da carta fora de <coleção>.<slug> → cards.N.card.id', async () => {
    const out = await fieldsOf(
      file({
        cards: [
          {
            status: 'draft',
            card: makeAttributeCard({ id: 'other.strength' }),
          },
        ],
      })
    )

    expect(out?.fields).toContainEqual({
      path: 'cards.0.card.id',
      reason: 'invalidIdFormat',
    })
  })

  it('REQ-48: ids repetidos no arquivo → problema na segunda ocorrência', async () => {
    const out = await fieldsOf(
      file({
        cards: [
          { status: 'draft', card: makeAttributeCard() },
          { status: 'published', card: makeAttributeCard() },
        ],
      })
    )

    expect(out?.fields).toEqual([
      { path: 'cards.1.card.id', reason: 'duplicateId' },
    ])
  })

  it('REQ-48: título de zona repetido dentro do arquivo → cards.N.card.title', async () => {
    const out = await fieldsOf(
      file({
        cards: [
          { status: 'published', card: makeZoneCard() },
          {
            status: 'draft',
            card: makeZoneCard({ id: 'fixture.whispering-grove-copia' }),
          },
        ],
      })
    )

    expect(out?.fields).toEqual([
      { path: 'cards.1.card.title', reason: 'duplicateTitle' },
    ])
  })

  it('REQ-48: status da carta inválido → cards.N.status', async () => {
    const out = await fieldsOf(
      file({ cards: [{ status: 'archived', card: makeAttributeCard() }] })
    )

    expect(out?.fields).toEqual([
      { path: 'cards.0.status', reason: 'unknownStatus' },
    ])
  })

  it('REQ-48: item de cards ou card que não é objeto → problema no caminho', async () => {
    const out = await fieldsOf(
      file({ cards: ['x', { status: 'draft', card: 3 }] })
    )

    expect(out?.fields).toEqual([
      { path: 'cards.0', reason: 'notAnObject' },
      { path: 'cards.1.card', reason: 'notAnObject' },
    ])
  })

  it('REQ-48/D-53: classes diferente de [] → path classes (até a FEAT-06)', async () => {
    const out = await fieldsOf(file({ classes: [{ playerClass: 'warrior' }] }))

    expect(out?.fields).toEqual([
      { path: 'classes', reason: 'classesNotSupported' },
    ])
  })

  it('REQ-48: replace diferente de true/false → path replace', async () => {
    const out = await fieldsOf(file(), 'yes')

    expect(out?.fields).toEqual([{ path: 'replace', reason: 'invalidReplace' }])
  })

  it('REQ-48: todos os problemas do arquivo vêm juntos, na ordem do arquivo', async () => {
    const out = await fieldsOf(
      file({
        formatVersion: 3,
        collection: { ...collection, name: '' },
        classes: [1],
      }),
      'x'
    )

    expect(out?.fields?.map((field) => field.path)).toEqual([
      'formatVersion',
      'collection.name',
      'classes',
      'replace',
    ])
  })

  it('REQ-48: coleção já existe sem replace → CONTENT_ID_TAKEN em collection.id, nada muda', async () => {
    store.collections = [{ id: 'fixture', name: 'Velha', description: '' }]
    store.cards = [{ status: 'published', card: makeZoneCard() }]

    const out = await fieldsOf(file())

    expect(out?.error).toBeInstanceOf(ContentIdTakenError)
    expect(out?.fields).toEqual([{ path: 'collection.id', reason: 'idTaken' }])
    expect(store.collections[0]?.name).toBe('Velha')
    expect(store.cards).toHaveLength(1)
  })

  it('REQ-48: replace=false tem o mesmo efeito de omitir', async () => {
    store.collections = [{ id: 'fixture', name: 'Velha', description: '' }]

    const out = await fieldsOf(file(), 'false')

    expect(out?.error).toBeInstanceOf(ContentIdTakenError)
  })

  it('REQ-48: replace=true troca a coleção inteira (cartas fora do arquivo somem)', async () => {
    store.collections = [{ id: 'fixture', name: 'Velha', description: '' }]
    store.cards = [{ status: 'published', card: makeZoneCard() }]

    const result = await sut.execute({ body: file(), replace: 'true' })

    expect(result.isRight()).toBe(true)
    expect(store.collections).toEqual([collection])
    expect(store.cards.map((entry) => entry.card.id)).toEqual([
      'fixture.strength-basic',
      'fixture.healing-potion',
    ])
  })

  it('REQ-48: replace=true sem a coleção existir cria a coleção', async () => {
    const result = await sut.execute({ body: file(), replace: 'true' })

    expect(result.isRight()).toBe(true)
    expect(store.collections).toEqual([collection])
  })

  it('REQ-48: id de carta usado por outra coleção → CONTENT_ID_TAKEN em cards.N.card.id', async () => {
    store.collections = [{ id: 'other', name: 'Outra', description: '' }]
    store.cards = [
      {
        status: 'published',
        card: makeAttributeCard({ collectionId: 'other' }),
      },
    ]

    const out = await fieldsOf(file())

    expect(out?.error).toBeInstanceOf(ContentIdTakenError)
    expect(out?.fields).toEqual([
      { path: 'cards.0.card.id', reason: 'idTaken' },
    ])
    expect(store.collections).toHaveLength(1)
  })

  it('REQ-48: exportar e importar com replace reproduz a coleção igual', async () => {
    store.collections = [collection]
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      { status: 'draft', card: makeItemCard() },
    ]
    const exported = await new ExportCollectionUseCase(store).execute({
      collectionId: 'fixture',
    })
    expect(exported.isRight()).toBe(true)
    if (exported.isLeft()) return
    const before = {
      collections: [...store.collections],
      cards: [...store.cards],
    }

    const result = await sut.execute({
      body: exported.value.file,
      replace: 'true',
    })

    expect(result.isRight()).toBe(true)
    const byId = (a: { card: { id: string } }, b: { card: { id: string } }) =>
      a.card.id.localeCompare(b.card.id)
    expect(store.collections).toEqual(before.collections)
    expect([...store.cards].sort(byId)).toEqual([...before.cards].sort(byId))
  })
})
