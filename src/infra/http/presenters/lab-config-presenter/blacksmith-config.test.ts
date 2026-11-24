import { expect, it } from 'vitest'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import { ResetGameConfigUseCase } from '@/domain/lab/application/use-cases/reset-game-config'
import { UpdateGameConfigUseCase } from '@/domain/lab/application/use-cases/update-game-config'
import { InMemoryCardCatalog } from '../../../../../test/fakes/in-memory-card-catalog'
import { InMemoryGameConfigRepository } from '../../../../../test/repositories/in-memory-game-config-repository'
import { LabConfigPresenter } from '.'

// CONTRATO v0.85, FEAT-17 (tabela do laboratório); README Apêndice A.
const settings = {
  repairBaseGold: { standard: 5, min: 0, max: 1000000 },
  repairGoldPerLevel: { standard: 2, min: 0, max: 1000000 },
  repairMarkPercent: { standard: 12, min: 0, max: 100 },
  refineGoldPerLevel: { standard: 10, min: 0, max: 1000000 },
  refineThreshold1to3: { standard: 0, min: 0, max: 21 },
  refineThreshold4to6: { standard: 8, min: 0, max: 21 },
  refineThreshold7to9: { standard: 12, min: 0, max: 21 },
  refineThreshold10: { standard: 16, min: 0, max: 21 },
  refineBreakFromLevel: { standard: 7, min: 1, max: 11 },
  refineBonusPercent: { standard: 5, min: 0, max: 1000 },
  enchantElementGold: { standard: 50, min: 0, max: 1000000 },
  enchantEffectGold: { standard: 100, min: 0, max: 1000000 },
  enchantElementThreshold: { standard: 10, min: 0, max: 21 },
  enchantEffectThreshold: { standard: 13, min: 0, max: 21 },
  saleRefinePercent: { standard: 8, min: 0, max: 1000 },
  saleEnchantPercent: { standard: 20, min: 0, max: 1000 },
  artificerRepairDiscountPercent: { standard: 50, min: 0, max: 100 },
  artificerMaxRefineLevel: { standard: 6, min: 0, max: 10 },
  artificerD20Bonus: { standard: 2, min: 0, max: 20 },
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

it('REQ-146 — expõe as 19 chaves do ferreiro com padrões e limites, altera em lote e restaura', async () => {
  const { update, reset, read } = setup()
  const entries = Object.entries(settings)
  expect(entries).toHaveLength(19)
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

it('REQ-146 — lote com um ajuste válido e outros inválidos é recusado por inteiro', async () => {
  const { update, read } = setup()
  const before = await read()

  const result = await update.execute({
    patch: {
      refineGoldPerLevel: 12,
      refineThreshold10: 22,
      refineBreakFromLevel: 0,
      artificerMaxRefineLevel: 6.5,
      repairMarkPercent: 101,
    },
  })
  expect(result.value).toMatchObject({
    code: 'LAB_CONFIG_INVALID',
    details: {
      fields: [
        { field: 'refineThreshold10', reason: 'outOfRange' },
        { field: 'refineBreakFromLevel', reason: 'outOfRange' },
        { field: 'artificerMaxRefineLevel', reason: 'notInteger' },
        { field: 'repairMarkPercent', reason: 'outOfRange' },
      ],
    },
  })
  expect(await read()).toEqual(before)
})
