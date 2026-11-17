import { beforeEach, describe, expect, it } from 'vitest'

import { ClassNotFoundError } from '@/domain/catalog/application/use-cases/_errors/class-not-found-error'
import { makeClassDefinition } from '../../../../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'

import { GetEditorClassUseCase } from '.'

let store: InMemoryContentStore
let sut: GetEditorClassUseCase

describe('GetEditorClassUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    store.classes = [
      { status: 'draft', classDefinition: makeClassDefinition() },
    ]
    sut = new GetEditorClassUseCase(store)
  })

  it('REQ-38: devolve a classe com o status (rascunho inclusive)', async () => {
    const result = await sut.execute({ playerClass: 'warrior' })

    expect(result.isRight() && result.value.editorClass).toEqual({
      status: 'draft',
      classDefinition: makeClassDefinition(),
    })
  })

  it('REQ-38: inexistente → CLASS_NOT_FOUND', async () => {
    const result = await sut.execute({ playerClass: 'mage' })

    expect(result.isLeft() && result.value).toBeInstanceOf(ClassNotFoundError)
  })
})
