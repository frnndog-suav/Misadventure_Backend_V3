import { beforeEach, describe, expect, it } from 'vitest'

import { ClassNotFoundError } from '@/domain/catalog/application/use-cases/_errors/class-not-found-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentLockedError } from '@/domain/catalog/application/use-cases/_errors/content-locked-error'
import {
  makeAttributeCard,
  makeClassDefinition,
  toClassInput,
} from '../../../../../../test/factories/make-card'
import { FakeClassInputParser } from '../../../../../../test/fakes/fake-class-input-parser'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { ReplaceClassUseCase } from '.'

let store: InMemoryContentStore
let parser: FakeClassInputParser
let sut: ReplaceClassUseCase

const dexterity = makeAttributeCard({
  id: 'fixture.dexterity-basic',
  name: 'Destreza',
  attributes: ['dexterity'],
})

describe('ReplaceClassUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    parser = new FakeClassInputParser()
    store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      { status: 'published', card: dexterity },
    ]
    store.classes = [
      { status: 'draft', classDefinition: makeClassDefinition() },
    ]
    sut = new ReplaceClassUseCase(store, parser)
  })

  it('REQ-38: substitui a classe inteira mantendo o status e a coleção', async () => {
    const result = await sut.execute({
      playerClass: 'warrior',
      body: toClassInput(makeClassDefinition({ name: 'Guerreiro Bruto' })),
    })

    expect(result.isRight()).toBe(true)
    expect(store.classes).toEqual([
      {
        status: 'draft',
        classDefinition: makeClassDefinition({ name: 'Guerreiro Bruto' }),
      },
    ])
  })

  it('REQ-38: rascunho com outro playerClass é renomeado (o antigo deixa de existir)', async () => {
    const result = await sut.execute({
      playerClass: 'warrior',
      body: toClassInput(makeClassDefinition({ playerClass: 'mage' })),
    })

    expect(result.isRight()).toBe(true)
    expect(store.classes.map((c) => c.classDefinition.playerClass)).toEqual([
      'mage',
    ])
  })

  it('REQ-38: publicada com outro playerClass → CONTENT_LOCKED, nada muda', async () => {
    store.classes[0] = {
      status: 'published',
      classDefinition: makeClassDefinition(),
    }

    const result = await sut.execute({
      playerClass: 'warrior',
      body: toClassInput(makeClassDefinition({ playerClass: 'mage' })),
    })

    expect(result.isLeft() && result.value).toBeInstanceOf(ContentLockedError)
    expect(store.classes[0].classDefinition.playerClass).toBe('warrior')
  })

  it('REQ-38: publicada com o mesmo playerClass → 200, continua publicada e o catálogo vê a versão nova', async () => {
    store.classes[0] = {
      status: 'published',
      classDefinition: makeClassDefinition(),
    }

    const result = await sut.execute({
      playerClass: 'warrior',
      body: toClassInput(makeClassDefinition({ name: 'Guerreiro Bruto' })),
    })

    expect(result.isRight()).toBe(true)
    expect((await store.findClass('warrior'))?.name).toBe('Guerreiro Bruto')
  })

  it('REQ-38 (D-60): PUT em classe publicada aplica as regras de publicação (trava), nada muda', async () => {
    store.classes[0] = {
      status: 'published',
      classDefinition: makeClassDefinition(),
    }

    const result = await sut.execute({
      playerClass: 'warrior',
      body: toClassInput(
        makeClassDefinition({
          starterDeck: [
            { cardId: 'fixture.strength-basic', copies: 17 },
            { cardId: 'fixture.dexterity-basic', copies: 43 },
          ],
        })
      ),
    })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toBeInstanceOf(ContentInvalidError)
    expect((result.value as ContentInvalidError).details.fields).toEqual([
      { path: 'starterDeck', reason: 'starterDeckLockNotMet' },
    ])
    expect(store.classes[0].classDefinition).toEqual(makeClassDefinition())
  })

  it('REQ-38: inexistente → CLASS_NOT_FOUND, conferida antes do corpo', async () => {
    parser.issues = [{ path: 'name', reason: 'invalidFormat' }]

    const result = await sut.execute({ playerClass: 'mage', body: {} })

    expect(result.isLeft() && result.value).toBeInstanceOf(ClassNotFoundError)
  })

  it('REQ-38: formato e regras → CONTENT_INVALID, nada muda', async () => {
    const result = await sut.execute({
      playerClass: 'warrior',
      body: toClassInput(makeClassDefinition({ essentialAttributes: [] })),
    })

    expect(result.isLeft() && result.value).toBeInstanceOf(ContentInvalidError)
    expect(store.classes[0].classDefinition).toEqual(makeClassDefinition())
  })

  it('REQ-38: renomear para um playerClass já usado → CONTENT_ID_TAKEN', async () => {
    store.classes.push({
      status: 'draft',
      classDefinition: makeClassDefinition({
        playerClass: 'mage',
        name: 'Mago',
      }),
    })

    const result = await sut.execute({
      playerClass: 'warrior',
      body: toClassInput(makeClassDefinition({ playerClass: 'mage' })),
    })

    expect(result.isLeft() && result.value).toBeInstanceOf(ContentIdTakenError)
    expect(store.classes).toHaveLength(2)
  })
})
