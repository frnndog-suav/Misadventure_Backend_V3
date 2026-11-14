import { beforeEach, describe, expect, it } from 'vitest'

import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { InMemoryGameConfigRepository } from '../../../../../../test/repositories/in-memory-game-config-repository'

import { GetGameConfigUseCase } from '../get-game-config'
import { ResetGameConfigUseCase } from '.'

let repository: InMemoryGameConfigRepository
let sut: ResetGameConfigUseCase

describe('ResetGameConfigUseCase', () => {
  beforeEach(() => {
    repository = new InMemoryGameConfigRepository()
    sut = new ResetGameConfigUseCase(repository)
  })

  it('REQ-07: apaga o ajuste salvo e devolve os padrões', async () => {
    repository.item = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      actionPointsPerTurn: 4,
    })

    const result = await sut.execute()

    expect(result.isRight()).toBe(true)
    expect(result.value.config.values).toEqual(GAME_CONFIG_DEFAULTS)
    expect(repository.item).toBeNull()
  })

  it('REQ-07: a leitura seguinte devolve os padrões', async () => {
    repository.item = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      initialGold: 50,
    })

    await sut.execute()
    const result = await new GetGameConfigUseCase(repository).execute()

    expect(result.value.config.values).toEqual(GAME_CONFIG_DEFAULTS)
  })
})
