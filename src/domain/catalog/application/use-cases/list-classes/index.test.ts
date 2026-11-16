import { describe, expect, it } from 'vitest'

import { makeClassDefinition } from '../../../../../../test/factories/make-card'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'

import { ListClassesUseCase } from '.'

describe('ListClassesUseCase', () => {
  it('REQ-27: devolve as classes em ordem de playerClass', async () => {
    const catalog = new InMemoryCardCatalog()
    const warrior = makeClassDefinition()
    const mage = makeClassDefinition({ playerClass: 'mage', name: 'Mago' })
    const bard = makeClassDefinition({ playerClass: 'bard', name: 'Bardo' })
    catalog.classes = [warrior, mage, bard]

    const result = await new ListClassesUseCase(catalog).execute()

    expect(result.isRight() && result.value.classes).toEqual([
      bard,
      mage,
      warrior,
    ])
  })

  it('REQ-27: catálogo sem classes devolve lista vazia', async () => {
    const result = await new ListClassesUseCase(
      new InMemoryCardCatalog()
    ).execute()

    expect(result.isRight() && result.value.classes).toEqual([])
  })
})
