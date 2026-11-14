import { beforeEach, describe, expect, it } from 'vitest'

import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { InMemoryGameConfigRepository } from '../../../../../../test/repositories/in-memory-game-config-repository'

import { GetGameConfigUseCase } from '.'

let repository: InMemoryGameConfigRepository
let sut: GetGameConfigUseCase

describe('GetGameConfigUseCase', () => {
  beforeEach(() => {
    repository = new InMemoryGameConfigRepository()
    sut = new GetGameConfigUseCase(repository)
  })

  it('REQ-09: sem ajuste salvo, devolve os padrões', async () => {
    const result = await sut.execute()

    expect(result.isRight()).toBe(true)
    expect(result.value.config.values).toEqual(GAME_CONFIG_DEFAULTS)
  })

  it('REQ-09: com ajuste salvo, devolve os valores salvos', async () => {
    repository.item = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      actionPointsPerTurn: 4,
    })

    const result = await sut.execute()

    expect(result.value.config.values).toEqual({
      ...GAME_CONFIG_DEFAULTS,
      actionPointsPerTurn: 4,
    })
  })
})
