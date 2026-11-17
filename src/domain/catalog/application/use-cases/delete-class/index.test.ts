import { beforeEach, describe, expect, it } from 'vitest'

import { ClassNotFoundError } from '@/domain/catalog/application/use-cases/_errors/class-not-found-error'
import { ContentInUseError } from '@/domain/catalog/application/use-cases/_errors/content-in-use-error'
import { makeClassDefinition } from '../../../../../../test/factories/make-card'
import { makeParty } from '../../../../../../test/factories/make-party'
import { InMemoryContentStore } from '../../../../../../test/fakes/in-memory-content-store'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { DeleteClassUseCase } from '.'

let store: InMemoryContentStore
let parties: InMemoryPartiesRepository
let sut: DeleteClassUseCase

describe('DeleteClassUseCase', () => {
  beforeEach(() => {
    store = new InMemoryContentStore()
    parties = new InMemoryPartiesRepository()
    store.classes = [
      { status: 'draft', classDefinition: makeClassDefinition() },
      {
        status: 'published',
        classDefinition: makeClassDefinition({
          playerClass: 'mage',
          name: 'Mago',
        }),
      },
    ]
    sut = new DeleteClassUseCase(store, parties)
  })

  it('REQ-38: exclui a classe (rascunho ou publicada) do editor e do catálogo', async () => {
    expect((await sut.execute({ playerClass: 'warrior' })).isRight()).toBe(true)
    expect((await sut.execute({ playerClass: 'mage' })).isRight()).toBe(true)

    expect(store.classes).toEqual([])
    expect(await store.findClass('mage')).toBeNull()
  })

  it('REQ-38: inexistente → CLASS_NOT_FOUND', async () => {
    const result = await sut.execute({ playerClass: 'rogue' })

    expect(result.isLeft() && result.value).toBeInstanceOf(ClassNotFoundError)
  })

  it('REQ-39: classe de algum jogador de um save → CONTENT_IN_USE, nada muda', async () => {
    await parties.create(makeParty())

    const result = await sut.execute({ playerClass: 'warrior' })

    expect(result.isLeft() && result.value).toBeInstanceOf(ContentInUseError)
    expect(store.classes).toHaveLength(2)
  })

  it('REQ-39: outra classe, que nenhum save usa, pode ser excluída; apagado o grupo, a classe é liberada', async () => {
    const party = makeParty()
    await parties.create(party)

    expect((await sut.execute({ playerClass: 'mage' })).isRight()).toBe(true)

    await parties.delete(party)
    expect((await sut.execute({ playerClass: 'warrior' })).isRight()).toBe(true)
  })
})
