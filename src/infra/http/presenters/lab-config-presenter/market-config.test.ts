import { expect, it } from 'vitest'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import { ResetGameConfigUseCase } from '@/domain/lab/application/use-cases/reset-game-config'
import { UpdateGameConfigUseCase } from '@/domain/lab/application/use-cases/update-game-config'
import { InMemoryCardCatalog } from '../../../../../test/fakes/in-memory-card-catalog'
import { InMemoryGameConfigRepository } from '../../../../../test/repositories/in-memory-game-config-repository'
import { LabConfigPresenter } from '.'

// CONTRATO v0.80, FEAT-16 (tabela do laboratório).
const settings = {
  singlesShowcaseSlots: { standard: 4, min: 1, max: 20 },
  singlesDecayMax: { standard: 3, min: 0, max: 20 },
  singlesPoolSize: { standard: 20, min: 1, max: 1000 },
  marketFactorMinPercent: { standard: 80, min: 1, max: 1000 },
  marketFactorMaxPercent: { standard: 120, min: 1, max: 1000 },
  singlesStockCommon: { standard: 6, min: 1, max: 100 },
  singlesStockUncommon: { standard: 4, min: 1, max: 100 },
  singlesStockRare: { standard: 2, min: 1, max: 100 },
  singlesStockEpic: { standard: 1, min: 1, max: 100 },
  singlesStockLegendary: { standard: 1, min: 1, max: 100 },
  singlesPriceCommon: { standard: 5, min: 1, max: 1000000 },
  singlesPriceUncommon: { standard: 15, min: 1, max: 1000000 },
  singlesPriceRare: { standard: 45, min: 1, max: 1000000 },
  singlesPriceEpic: { standard: 130, min: 1, max: 1000000 },
  singlesPriceLegendary: { standard: 370, min: 1, max: 1000000 },
  scarcityStepPercent: { standard: 10, min: 0, max: 1000 },
  treasureValueCommon: { standard: 10, min: 1, max: 1000000 },
  treasureValueUncommon: { standard: 25, min: 1, max: 1000000 },
  treasureValueRare: { standard: 60, min: 1, max: 1000000 },
  treasureValueEpic: { standard: 150, min: 1, max: 1000000 },
  treasureValueLegendary: { standard: 400, min: 1, max: 1000000 },
  boosterPrice: { standard: 30, min: 0, max: 1000000 },
  boosterCardCount: { standard: 8, min: 1, max: 50 },
  boosterSalePrice: { standard: 15, min: 1, max: 1000000 },
  boosterChanceCommon: { standard: 600, min: 0, max: 1000 },
  boosterChanceUncommon: { standard: 250, min: 0, max: 1000 },
  boosterChanceRare: { standard: 110, min: 0, max: 1000 },
  boosterChanceEpic: { standard: 35, min: 0, max: 1000 },
  boosterChanceLegendary: { standard: 5, min: 0, max: 1000 },
  vaultExpansionSlots: { standard: 5, min: 1, max: 1000 },
  vaultExpansionBasePrice: { standard: 50, min: 0, max: 1000000 },
  deckSlotExpansionSlots: { standard: 1, min: 1, max: 100 },
  deckSlotExpansionBasePrice: { standard: 100, min: 0, max: 1000000 },
  tcgFolderExpansionSlots: { standard: 10, min: 1, max: 1000 },
  tcgFolderExpansionBasePrice: { standard: 60, min: 0, max: 1000000 },
  purseExpansionPricePercent: { standard: 50, min: 0, max: 1000 },
  vaultGoldExpansionPricePercent: { standard: 25, min: 0, max: 1000 },
}
const chances = [
  'boosterChanceCommon',
  'boosterChanceUncommon',
  'boosterChanceRare',
  'boosterChanceEpic',
  'boosterChanceLegendary',
]

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

it('REQ-137 — expõe as 37 chaves do mercado com padrões e limites, altera em lote e restaura', async () => {
  const { update, reset, read } = setup()
  const entries = Object.entries(settings)
  expect(entries).toHaveLength(37)
  const defaults = Object.fromEntries(
    entries.map(([key, { standard }]) => [key, standard])
  )
  const limits = Object.fromEntries(
    entries.map(([key, { min, max }]) => [key, { min, max }])
  )

  const initial = await read()
  expect(initial).toMatchObject({ values: defaults, defaults, limits })

  // Mínimos e máximos de cada chave, com as chances somando 1000.
  const lower = {
    ...Object.fromEntries(entries.map(([key, { min }]) => [key, min])),
    boosterChanceCommon: 1000,
  }
  const upper = {
    ...Object.fromEntries(entries.map(([key, { max }]) => [key, max])),
    boosterChanceCommon: 0,
    boosterChanceUncommon: 0,
    boosterChanceRare: 0,
    boosterChanceEpic: 0,
    boosterChanceLegendary: 1000,
  }
  for (const patch of [lower, upper]) {
    expect((await update.execute({ patch })).isRight()).toBe(true)
    expect(await read()).toMatchObject({ values: patch, defaults, limits })
  }

  expect((await reset.execute()).isRight()).toBe(true)
  expect(await read()).toEqual(initial)
})

it('REQ-137 — chances que não somam 1000 → sumMismatch nas cinco, sem mudar nada', async () => {
  const { update, read } = setup()
  const before = await read()

  const result = await update.execute({ patch: { boosterChanceCommon: 700 } })
  expect(result.value).toMatchObject({
    code: 'LAB_CONFIG_INVALID',
    details: {
      fields: chances.map((field) => ({ field, reason: 'sumMismatch' })),
    },
  })
  expect(await read()).toEqual(before)

  const moved = await update.execute({
    patch: { boosterChanceCommon: 590, boosterChanceLegendary: 15 },
  })
  expect(moved.isRight()).toBe(true)
})

it('REQ-137 — fator mínimo acima do máximo → minAboveMax nas duas chaves', async () => {
  const { update, read } = setup()
  const before = await read()

  const result = await update.execute({
    patch: { marketFactorMinPercent: 130 },
  })
  expect(result.value).toMatchObject({
    code: 'LAB_CONFIG_INVALID',
    details: {
      fields: [
        { field: 'marketFactorMinPercent', reason: 'minAboveMax' },
        { field: 'marketFactorMaxPercent', reason: 'minAboveMax' },
      ],
    },
  })
  expect(await read()).toEqual(before)

  const fixed = await update.execute({
    patch: { marketFactorMinPercent: 115, marketFactorMaxPercent: 115 },
  })
  expect(fixed.isRight()).toBe(true)
})

it('REQ-137 — lote com um ajuste válido e outros inválidos é recusado por inteiro', async () => {
  const { update, read } = setup()
  const before = await read()

  const result = await update.execute({
    patch: {
      boosterPrice: 40,
      singlesShowcaseSlots: 0,
      scarcityStepPercent: 10.5,
      boosterCardCount: 51,
    },
  })
  expect(result.value).toMatchObject({
    code: 'LAB_CONFIG_INVALID',
    details: {
      fields: [
        { field: 'singlesShowcaseSlots', reason: 'outOfRange' },
        { field: 'scarcityStepPercent', reason: 'notInteger' },
        { field: 'boosterCardCount', reason: 'outOfRange' },
      ],
    },
  })
  expect(await read()).toEqual(before)
})
