import { beforeEach, describe, expect, it } from 'vitest'

import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInUseError } from '@/domain/catalog/application/use-cases/_errors/content-in-use-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import { ExportCollectionUseCase } from '@/domain/catalog/application/use-cases/export-collection'
import {
  makeAttributeCard,
  makeClassDefinition,
} from '../../../../../../test/factories/make-card'
import { makeParty } from '../../../../../../test/factories/make-party'
import { FakeCardInputParser } from '../../../../../../test/fakes/fake-card-input-parser'
import { FakeClassInputParser } from '../../../../../../test/fakes/fake-class-input-parser'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { ImportCollectionUseCase } from '.'

let store: InMemoryContentStore
let parties: InMemoryPartiesRepository
let classParser: FakeClassInputParser
let sut: ImportCollectionUseCase

const collection = { id: 'fixture', name: 'Coleção', description: '' }
const dexterity = makeAttributeCard({
  id: 'fixture.dexterity-basic',
  name: 'Destreza',
  attributes: ['dexterity'],
})
const warrior = makeClassDefinition()
const mage = makeClassDefinition({
  playerClass: 'mage',
  name: 'Mago',
  essentialAttributes: ['dexterity'],
  starterDeck: [
    { cardId: 'fixture.strength-basic', copies: 42 },
    { cardId: 'fixture.dexterity-basic', copies: 18 },
  ],
})

function file(
  classes: unknown[] = [{ status: 'published', classDefinition: warrior }],
  cards: unknown[] = [
    { status: 'published', card: makeAttributeCard() },
    { status: 'published', card: dexterity },
  ]
) {
  return { formatVersion: 1, collection, cards, classes }
}

async function failure(body: unknown, replace?: string) {
  const result = await sut.execute({ body, replace })
  expect(result.isLeft()).toBe(true)
  if (result.isRight()) return null
  return {
    error: result.value,
    fields: (result.value as ContentInvalidError).details?.fields,
  }
}

describe('ImportCollectionUseCase: classes (REQ-38, REQ-48)', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    parties = new InMemoryPartiesRepository()
    classParser = new FakeClassInputParser()
    sut = new ImportCollectionUseCase(
      store,
      new FakeCardInputParser(),
      classParser,
      parties
    )
  })

  it('REQ-48: importa as classes com o status do arquivo e o collectionId da coleção; classCount = nº de classes', async () => {
    const result = await sut.execute({
      body: file([
        { status: 'published', classDefinition: warrior },
        { status: 'draft', classDefinition: mage },
      ]),
    })

    expect(result.isRight() && result.value).toEqual({
      collectionId: 'fixture',
      cardCount: 2,
      classCount: 2,
    })
    expect(store.classes).toEqual([
      { status: 'published', classDefinition: warrior },
      { status: 'draft', classDefinition: mage },
    ])
    expect(await store.findClass('warrior')).toEqual(warrior)
  })

  it('REQ-48: exportar e importar com replace reproduz as classes', async () => {
    store.collections = [collection]
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      { status: 'published', card: dexterity },
    ]
    store.classes = [
      { status: 'published', classDefinition: warrior },
      { status: 'draft', classDefinition: mage },
    ]
    const exported = await new ExportCollectionUseCase(store).execute({
      collectionId: 'fixture',
    })
    if (exported.isLeft()) throw new Error('export')
    const before = [...store.classes].sort((a, b) =>
      a.classDefinition.playerClass < b.classDefinition.playerClass ? -1 : 1
    )

    const result = await sut.execute({
      body: exported.value.file,
      replace: 'true',
    })

    expect(result.isRight()).toBe(true)
    expect(store.classes).toEqual(before)
  })

  it('REQ-48: entrada que não é objeto, status desconhecido e classDefinition que não é objeto → problemas no caminho', async () => {
    const out = await failure(
      file([
        'x',
        { status: 'nope', classDefinition: warrior },
        { status: 'draft', classDefinition: 3 },
      ])
    )

    expect(out?.fields).toEqual([
      { path: 'classes.0', reason: 'notAnObject' },
      { path: 'classes.1.status', reason: 'unknownStatus' },
      { path: 'classes.2.classDefinition', reason: 'notAnObject' },
    ])
  })

  it('REQ-48: classDefinition.collectionId diferente da coleção do arquivo', async () => {
    const out = await failure(
      file([
        {
          status: 'draft',
          classDefinition: { ...warrior, collectionId: 'outra' },
        },
      ])
    )

    expect(out?.fields).toEqual([
      {
        path: 'classes.0.classDefinition.collectionId',
        reason: 'collectionMismatch',
      },
    ])
  })

  it('REQ-48: problemas de formato do parser com o caminho prefixado', async () => {
    classParser.issues = [
      { path: 'starterDeck.0.copies', reason: 'invalidFormat', message: 'x' },
      { path: '', reason: 'notAnObject' },
    ]

    const out = await failure(file())

    expect(out?.fields).toEqual([
      {
        path: 'classes.0.classDefinition.starterDeck.0.copies',
        reason: 'invalidFormat',
        message: 'x',
      },
      { path: 'classes.0.classDefinition', reason: 'notAnObject' },
    ])
  })

  it('REQ-38: regras da classe publicada (trava) e do rascunho (só formato) valem no arquivo', async () => {
    const shortDeck = [
      { cardId: 'fixture.strength-basic', copies: 1 },
      { cardId: 'fixture.dexterity-basic', copies: 1 },
    ]

    const out = await failure(
      file([
        {
          status: 'published',
          classDefinition: { ...warrior, starterDeck: shortDeck },
        },
        {
          status: 'draft',
          classDefinition: { ...mage, starterDeck: shortDeck },
        },
      ])
    )

    expect(out?.fields).toEqual([
      {
        path: 'classes.0.classDefinition.starterDeck',
        reason: 'starterDeckSize',
      },
      {
        path: 'classes.0.classDefinition.starterDeck',
        reason: 'starterDeckLockNotMet',
      },
    ])
    expect(store.classes).toEqual([])
  })

  it('REQ-38: classe publicada com carta do deck em rascunho no arquivo → starterDeckCardNotPublished', async () => {
    const out = await failure(
      file(undefined, [
        { status: 'published', card: makeAttributeCard() },
        { status: 'draft', card: dexterity },
      ])
    )

    expect(out?.fields).toEqual([
      {
        path: 'classes.0.classDefinition.starterDeck.1.cardId',
        reason: 'starterDeckCardNotPublished',
      },
    ])
  })

  it('REQ-38: o deck pode citar carta publicada de outra coleção', async () => {
    store.collections = [{ id: 'other', name: 'O', description: '' }]
    store.cards = [
      {
        status: 'published',
        card: makeAttributeCard({
          id: 'other.dexterity-basic',
          collectionId: 'other',
          attributes: ['dexterity'],
        }),
      },
    ]

    const result = await sut.execute({
      body: file(
        [
          {
            status: 'published',
            classDefinition: {
              ...warrior,
              starterDeck: [
                { cardId: 'fixture.strength-basic', copies: 18 },
                { cardId: 'other.dexterity-basic', copies: 42 },
              ],
            },
          },
        ],
        [{ status: 'published', card: makeAttributeCard() }]
      ),
    })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-38: name repetido com classe de outra coleção → CONTENT_INVALID', async () => {
    store.collections = [{ id: 'other', name: 'O', description: '' }]
    store.classes = [
      {
        status: 'published',
        classDefinition: makeClassDefinition({
          playerClass: 'rogue',
          collectionId: 'other',
          essentialAttributes: ['dexterity'],
        }),
      },
    ]

    const out = await failure(file())

    expect(out?.error).toBeInstanceOf(ContentInvalidError)
    expect(out?.fields).toEqual([
      { path: 'classes.0.classDefinition.name', reason: 'duplicateName' },
    ])
  })

  it('REQ-38: playerClass usado por classe de outra coleção → CONTENT_ID_TAKEN em classes.N.classDefinition.playerClass', async () => {
    store.collections = [{ id: 'other', name: 'O', description: '' }]
    store.classes = [
      {
        status: 'draft',
        classDefinition: makeClassDefinition({
          collectionId: 'other',
          name: 'Outro',
        }),
      },
    ]

    const out = await failure(file())

    expect(out?.error).toBeInstanceOf(ContentIdTakenError)
    expect(out?.fields).toEqual([
      { path: 'classes.0.classDefinition.playerClass', reason: 'idTaken' },
    ])
    expect(store.collections).toHaveLength(1)
  })

  it('REQ-38: playerClass repetido no arquivo → CONTENT_ID_TAKEN na segunda', async () => {
    const out = await failure(
      file([
        { status: 'draft', classDefinition: warrior },
        {
          status: 'draft',
          classDefinition: { ...mage, playerClass: 'warrior' },
        },
      ])
    )

    expect(out?.error).toBeInstanceOf(ContentIdTakenError)
    expect(out?.fields).toEqual([
      { path: 'classes.1.classDefinition.playerClass', reason: 'idTaken' },
    ])
  })

  it('REQ-38: replace=true não conta as classes antigas da própria coleção como repetidas', async () => {
    store.collections = [collection]
    store.classes = [{ status: 'draft', classDefinition: warrior }]

    const result = await sut.execute({ body: file(), replace: 'true' })

    expect(result.isRight()).toBe(true)
    expect(store.classes).toEqual([
      { status: 'published', classDefinition: warrior },
    ])
  })

  it('REQ-39: replace=true sobre coleção com carta usada por um save → CONTENT_IN_USE, nada muda', async () => {
    store.collections = [{ ...collection, name: 'Velha' }]
    store.cards = [{ status: 'published', card: makeAttributeCard() }]
    await parties.create(makeParty())

    const out = await failure(file(), 'true')

    expect(out?.error).toBeInstanceOf(ContentInUseError)
    expect(store.collections[0]?.name).toBe('Velha')
    expect(store.classes).toEqual([])
  })

  it('REQ-39: replace=true sobre coleção com classe usada por um save → CONTENT_IN_USE', async () => {
    store.collections = [collection]
    store.classes = [{ status: 'published', classDefinition: warrior }]
    await parties.create(makeParty())

    const out = await failure(file(), 'true')

    expect(out?.error).toBeInstanceOf(ContentInUseError)
  })

  it('REQ-39: o 400 e o 409 de ids vêm antes do CONTENT_IN_USE', async () => {
    store.collections = [collection]
    store.cards = [{ status: 'published', card: makeAttributeCard() }]
    await parties.create(makeParty())

    const out = await failure({ ...file(), formatVersion: 2 }, 'true')

    expect(out?.error).toBeInstanceOf(ContentInvalidError)
  })

  it('REQ-39: sem replace, importar coleção nova não consulta os saves', async () => {
    await parties.create(makeParty())

    const result = await sut.execute({ body: file() })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-40 (D-60): replace=true que tira do arquivo carta usada por classe de OUTRA coleção → CONTENT_REFERENCED', async () => {
    store.collections = [
      collection,
      { id: 'other', name: 'O', description: '' },
    ]
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      { status: 'published', card: dexterity },
    ]
    store.classes = [
      {
        status: 'draft',
        classDefinition: makeClassDefinition({
          playerClass: 'rogue',
          name: 'Ladino',
          collectionId: 'other',
        }),
      },
    ]

    const out = await failure(
      file([], [{ status: 'published', card: dexterity }]),
      'true'
    )

    expect(out?.error).toBeInstanceOf(ContentReferencedError)
    expect(store.cards).toHaveLength(2)
  })
})
