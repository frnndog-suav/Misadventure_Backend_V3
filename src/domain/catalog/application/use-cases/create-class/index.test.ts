import { beforeEach, describe, expect, it } from 'vitest'

import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import {
  makeAttributeCard,
  makeClassDefinition,
  makeItemCard,
  toClassInput,
} from '../../../../../../test/factories/make-card'
import { FakeClassInputParser } from '../../../../../../test/fakes/fake-class-input-parser'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { CreateClassUseCase } from '.'

let store: InMemoryContentStore
let parser: FakeClassInputParser
let sut: CreateClassUseCase

const dexterity = makeAttributeCard({
  id: 'fixture.dexterity-basic',
  name: 'Destreza',
  attributes: ['dexterity'],
})
const body = toClassInput(makeClassDefinition())

async function invalidFields(
  promise: ReturnType<CreateClassUseCase['execute']>
) {
  const result = await promise
  expect(result.isLeft()).toBe(true)
  if (result.isRight()) return null
  expect(result.value).toBeInstanceOf(ContentInvalidError)
  return result.value.details
}

describe('CreateClassUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    parser = new FakeClassInputParser()
    store.collections = [
      { id: 'fixture', name: 'Coleção', description: '' },
      { id: 'bosque', name: 'Bosque', description: '' },
    ]
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      { status: 'draft', card: dexterity },
    ]
    sut = new CreateClassUseCase(store, parser)
  })

  it('REQ-38: cria a classe como rascunho na coleção, com collectionId', async () => {
    const result = await sut.execute({ collectionId: 'fixture', body })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorClass).toEqual({
      status: 'draft',
      classDefinition: makeClassDefinition(),
    })
    expect(store.classes).toEqual([result.value.editorClass])
    expect(await store.findClass('warrior')).toBeNull()
  })

  it('REQ-38: o rascunho pode ter deck incompleto e cartas em rascunho', async () => {
    const result = await sut.execute({
      collectionId: 'fixture',
      body: toClassInput(
        makeClassDefinition({
          starterDeck: [{ cardId: 'fixture.dexterity-basic', copies: 1 }],
        })
      ),
    })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-38: o deck pode citar carta de outra coleção', async () => {
    const result = await sut.execute({ collectionId: 'bosque', body })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorClass.classDefinition.collectionId).toBe('bosque')
  })

  it('REQ-38: coleção inexistente → COLLECTION_NOT_FOUND, conferida antes do corpo', async () => {
    parser.issues = [{ path: 'name', reason: 'invalidFormat' }]

    const result = await sut.execute({ collectionId: 'nope', body })

    expect(result.isLeft() && result.value).toBeInstanceOf(
      CollectionNotFoundError
    )
  })

  it('REQ-38: problemas de formato do parser → CONTENT_INVALID, nada gravado', async () => {
    parser.issues = [{ path: 'name', reason: 'invalidFormat', message: 'x' }]

    const details = await invalidFields(
      sut.execute({ collectionId: 'fixture', body })
    )

    expect(details?.fields).toEqual(parser.issues)
    expect(store.classes).toEqual([])
  })

  it('REQ-38: regras de salvar → CONTENT_INVALID com caminhos (essentialAttributes, baseModifiers.attack, starterDeck.0.cardId)', async () => {
    const details = await invalidFields(
      sut.execute({
        collectionId: 'fixture',
        body: toClassInput(
          makeClassDefinition({
            essentialAttributes: ['strength', 'strength'],
            baseModifiers: {
              ...makeClassDefinition().baseModifiers,
              attack: -1,
            },
            starterDeck: [{ cardId: 'fixture.ghost', copies: 1 }],
          })
        ),
      })
    )

    expect(details?.fields).toEqual([
      { path: 'essentialAttributes', reason: 'duplicateValue' },
      { path: 'baseModifiers.attack', reason: 'outOfRange' },
      { path: 'starterDeck.0.cardId', reason: 'unknownCard' },
    ])
    expect(store.classes).toEqual([])
  })

  it('REQ-38: carta do deck que não é de atributo → notAnAttributeCard', async () => {
    store.cards.push({
      status: 'published',
      card: makeItemCard({ id: 'fixture.zone' }),
    })

    const details = await invalidFields(
      sut.execute({
        collectionId: 'fixture',
        body: toClassInput(
          makeClassDefinition({
            starterDeck: [{ cardId: 'fixture.zone', copies: 1 }],
          })
        ),
      })
    )

    expect(details?.fields).toEqual([
      { path: 'starterDeck.0.cardId', reason: 'notAnAttributeCard' },
    ])
  })

  it('REQ-38: name repetido (outro playerClass) → CONTENT_INVALID no path name', async () => {
    store.classes = [
      {
        status: 'published',
        classDefinition: makeClassDefinition({
          playerClass: 'rogue',
          essentialAttributes: ['dexterity'],
        }),
      },
    ]

    const details = await invalidFields(
      sut.execute({ collectionId: 'fixture', body })
    )

    expect(details?.fields).toEqual([{ path: 'name', reason: 'duplicateName' }])
  })

  it('REQ-38: playerClass já usado em outra coleção → CONTENT_ID_TAKEN no path playerClass, nada muda (mesmo com o mesmo nome)', async () => {
    store.classes = [
      { status: 'published', classDefinition: makeClassDefinition() },
    ]

    const result = await sut.execute({ collectionId: 'bosque', body })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentIdTakenError)
    expect((result.value as ContentIdTakenError).details.fields).toEqual([
      { path: 'playerClass', reason: 'idTaken' },
    ])
    expect(store.classes).toHaveLength(1)
  })

  it('REQ-38: o 400 vem antes do 409', async () => {
    store.classes = [
      { status: 'draft', classDefinition: makeClassDefinition() },
    ]

    const result = await sut.execute({
      collectionId: 'fixture',
      body: toClassInput(makeClassDefinition({ essentialAttributes: [] })),
    })

    expect(result.isLeft() && result.value).toBeInstanceOf(ContentInvalidError)
  })
})
