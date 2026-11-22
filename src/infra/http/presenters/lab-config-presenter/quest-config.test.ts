import { expect, it } from 'vitest'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import { ResetGameConfigUseCase } from '@/domain/lab/application/use-cases/reset-game-config'
import { UpdateGameConfigUseCase } from '@/domain/lab/application/use-cases/update-game-config'
import { InMemoryCardCatalog } from '../../../../../test/fakes/in-memory-card-catalog'
import { InMemoryGameConfigRepository } from '../../../../../test/repositories/in-memory-game-config-repository'
import { LabConfigPresenter } from '.'

const settings = {
  zoneQuestPeakGain: { standard: 3, min: 0, max: 1000 },
  genericQuestPeakGain: { standard: 5, min: 0, max: 1000 },
  questBoardSize: { standard: 3, min: 1, max: 50 },
  maxOpenQuests: { standard: 3, min: 1, max: 50 },
  trialMinPeak: { standard: 30, min: 0, max: 1000 },
  mentorBaseGoldCost: { standard: 150, min: 0, max: 1000000 },
  trialRandomEventTarget: { standard: 3, min: 0, max: 1000 },
  trialCombatTarget: { standard: 3, min: 0, max: 1000 },
  mentorRandomEventTarget: { standard: 5, min: 0, max: 1000 },
  mentorCombatTarget: { standard: 5, min: 0, max: 1000 },
  lockSpecializationAdditional: { standard: 6, min: 0, max: 200 },
  lockSpecializationReinforcement: { standard: 4, min: 0, max: 200 },
}

it('REQ-135 — consulta, altera em lote e restaura os ajustes de missão', async () => {
  const repository = new InMemoryGameConfigRepository()
  const get = new GetGameConfigUseCase(repository)
  const update = new UpdateGameConfigUseCase(
    repository,
    new InMemoryCardCatalog()
  )
  const reset = new ResetGameConfigUseCase(repository)
  const read = async () =>
    LabConfigPresenter.toHTTP((await get.execute()).value.config)
  const entries = Object.entries(settings)
  const defaults = Object.fromEntries(
    entries.map(([key, { standard }]) => [key, standard])
  )
  const limits = Object.fromEntries(
    entries.map(([key, { min, max }]) => [key, { min, max }])
  )

  const initial = await read()
  expect(initial).toMatchObject({ values: defaults, defaults, limits })

  for (const boundary of ['min', 'max'] as const) {
    const patch = Object.fromEntries(
      entries.map(([key, setting]) => [key, setting[boundary]])
    )
    expect((await update.execute({ patch })).isRight()).toBe(true)
    expect(await read()).toMatchObject({ values: patch, defaults, limits })
  }

  const saved = await read()
  const rejected = await update.execute({
    patch: {
      questBoardSize: 0,
      maxOpenQuests: 4,
      trialMinPeak: 30.5,
      mentorBaseGoldCost: 1000001,
    },
  })
  expect(rejected.value).toMatchObject({
    code: 'LAB_CONFIG_INVALID',
    details: {
      fields: [
        { field: 'questBoardSize', reason: 'outOfRange' },
        { field: 'trialMinPeak', reason: 'notInteger' },
        { field: 'mentorBaseGoldCost', reason: 'outOfRange' },
      ],
    },
  })
  expect(await read()).toEqual(saved)

  expect((await reset.execute()).isRight()).toBe(true)
  expect(await read()).toEqual(initial)
})
