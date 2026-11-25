import { expect, it } from 'vitest'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import { ResetGameConfigUseCase } from '@/domain/lab/application/use-cases/reset-game-config'
import { UpdateGameConfigUseCase } from '@/domain/lab/application/use-cases/update-game-config'
import { InMemoryCardCatalog } from '../../../../../test/fakes/in-memory-card-catalog'
import { InMemoryGameConfigRepository } from '../../../../../test/repositories/in-memory-game-config-repository'
import { LabConfigPresenter } from '.'

// CONTRATO v0.90, FEAT-18 (tabela do laboratório); README Apêndice A (linha "Montaria").
const settings = {
  mountPriceCommon: { standard: 80, min: 0, max: 1000000 },
  mountPriceUncommon: { standard: 150, min: 0, max: 1000000 },
  mountPriceRare: { standard: 280, min: 0, max: 1000000 },
  mountPriceEpic: { standard: 550, min: 0, max: 1000000 },
  mountPriceLegendary: { standard: 1100, min: 0, max: 1000000 },
  mountInventorySlots: { standard: 4, min: 0, max: 100 },
  mountFolderCapacity: { standard: 10, min: 0, max: 1000 },
}

function setup() {
  const repository = new InMemoryGameConfigRepository()
  const get = new GetGameConfigUseCase(repository)
  const update = new UpdateGameConfigUseCase(
    repository,
    new InMemoryCardCatalog()
  )
  const reset = new ResetGameConfigUseCase(repository)
  const read = async () =>
    LabConfigPresenter.toHTTP((await get.execute()).value.config)
  return { update, reset, read }
}

it('REQ-156 — expõe as 7 chaves da montaria com padrões e limites, altera em lote e restaura', async () => {
  const { update, reset, read } = setup()
  const entries = Object.entries(settings)
  const defaults = Object.fromEntries(
    entries.map(([key, { standard }]) => [key, standard])
  )
  const limits = Object.fromEntries(
    entries.map(([key, { min, max }]) => [key, { min, max }])
  )

  const initial = await read()
  expect(initial).toMatchObject({ values: defaults, defaults, limits })

  for (const bound of ['min', 'max'] as const) {
    const patch = Object.fromEntries(
      entries.map(([key, limit]) => [key, limit[bound]])
    )
    expect((await update.execute({ patch })).isRight()).toBe(true)
    expect(await read()).toMatchObject({ values: patch, defaults, limits })
  }

  expect((await reset.execute()).isRight()).toBe(true)
  expect(await read()).toEqual(initial)
})

it('REQ-156 — lote com um ajuste válido e outros inválidos é recusado por inteiro', async () => {
  const { update, read } = setup()
  const before = await read()

  const result = await update.execute({
    patch: {
      mountPriceRare: 300,
      mountInventorySlots: 101,
      mountFolderCapacity: 2.5,
      mountPriceEpic: -1,
    },
  })
  expect(result.value).toMatchObject({
    code: 'LAB_CONFIG_INVALID',
    details: {
      fields: [
        { field: 'mountInventorySlots', reason: 'outOfRange' },
        { field: 'mountFolderCapacity', reason: 'notInteger' },
        { field: 'mountPriceEpic', reason: 'outOfRange' },
      ],
    },
  })
  expect(await read()).toEqual(before)
})
