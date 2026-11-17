import { beforeEach, describe, expect, it } from 'vitest'

import { ClassNotFoundError } from '@/domain/catalog/application/use-cases/_errors/class-not-found-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import {
  makeAttributeCard,
  makeClassDefinition,
} from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { PublishClassUseCase } from '.'

let store: InMemoryContentStore
let sut: PublishClassUseCase

const dexterity = makeAttributeCard({
  id: 'fixture.dexterity-basic',
  name: 'Destreza',
  attributes: ['dexterity'],
})

async function issuesOf(playerClass: string) {
  const result = await sut.execute({ playerClass })
  expect(result.isLeft()).toBe(true)
  if (result.isRight()) return null
  expect(result.value).toBeInstanceOf(ContentInvalidError)
  return (result.value as ContentInvalidError).details.fields
}

describe('PublishClassUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
    store.cards = [
      { status: 'published', card: makeAttributeCard() },
      { status: 'published', card: dexterity },
    ]
    store.classes = [
      { status: 'draft', classDefinition: makeClassDefinition() },
    ]
    sut = new PublishClassUseCase(store)
  })

  it('REQ-38: publica a classe válida; passa a valer no catálogo', async () => {
    const result = await sut.execute({ playerClass: 'warrior' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value.editorClass.status).toBe('published')
    expect(await store.findClass('warrior')).toEqual(makeClassDefinition())
  })

  it('REQ-38: já publicada → sucesso sem mudança', async () => {
    store.classes[0] = {
      status: 'published',
      classDefinition: makeClassDefinition(),
    }

    const result = await sut.execute({ playerClass: 'warrior' })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-38: inexistente → CLASS_NOT_FOUND', async () => {
    const result = await sut.execute({ playerClass: 'mage' })

    expect(result.isLeft() && result.value).toBeInstanceOf(ClassNotFoundError)
  })

  it('REQ-38: total de cópias diferente de minDeckSize e trava não cumprida → CONTENT_INVALID, continua rascunho', async () => {
    store.classes[0] = {
      status: 'draft',
      classDefinition: makeClassDefinition({
        starterDeck: [
          { cardId: 'fixture.strength-basic', copies: 1 },
          { cardId: 'fixture.dexterity-basic', copies: 1 },
        ],
      }),
    }

    expect(await issuesOf('warrior')).toEqual([
      { path: 'starterDeck', reason: 'starterDeckSize' },
      { path: 'starterDeck', reason: 'starterDeckLockNotMet' },
    ])
    expect(store.classes[0].status).toBe('draft')
  })

  it('REQ-38: carta do deck em rascunho → starterDeckCardNotPublished no índice dela', async () => {
    store.cards[1] = { status: 'draft', card: dexterity }

    expect(await issuesOf('warrior')).toEqual([
      { path: 'starterDeck.1.cardId', reason: 'starterDeckCardNotPublished' },
    ])
  })

  it('REQ-38: essenciais iguais aos de outra classe publicada (8.5) → duplicateEssentials', async () => {
    store.classes.push({
      status: 'published',
      classDefinition: makeClassDefinition({
        playerClass: 'mage',
        name: 'Mago',
      }),
    })

    expect(await issuesOf('warrior')).toEqual([
      { path: 'essentialAttributes', reason: 'duplicateEssentials' },
    ])
  })

  it('REQ-38: essenciais iguais aos de outra classe em rascunho não impedem a publicação', async () => {
    store.classes.push({
      status: 'draft',
      classDefinition: makeClassDefinition({
        playerClass: 'mage',
        name: 'Mago',
      }),
    })

    expect((await sut.execute({ playerClass: 'warrior' })).isRight()).toBe(true)
  })
})
