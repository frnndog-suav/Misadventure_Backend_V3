import { beforeEach, describe, expect, it } from 'vitest'

import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { InMemoryGameConfigRepository } from '../../../../../../test/repositories/in-memory-game-config-repository'

import { LabConfigInvalidError } from '../_errors/lab-config-invalid-error'
import { UpdateGameConfigUseCase } from '.'

let repository: InMemoryGameConfigRepository
let sut: UpdateGameConfigUseCase

describe('UpdateGameConfigUseCase', () => {
  beforeEach(() => {
    repository = new InMemoryGameConfigRepository()
    sut = new UpdateGameConfigUseCase(repository)
  })

  it('REQ-05: ajuste parcial é salvo e devolvido', async () => {
    const result = await sut.execute({ patch: { actionPointsPerTurn: 4 } })

    const expected = { ...GAME_CONFIG_DEFAULTS, actionPointsPerTurn: 4 }
    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.config.values).toEqual(expected)
    }
    expect(repository.item?.values).toEqual(expected)
  })

  it('REQ-05: ajuste parte do que já está salvo', async () => {
    repository.item = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      initialGold: 50,
    })

    await sut.execute({ patch: { baseHealth: 30 } })

    expect(repository.item?.values).toEqual({
      ...GAME_CONFIG_DEFAULTS,
      initialGold: 50,
      baseHealth: 30,
    })
  })

  it('REQ-06: pedido inválido devolve LAB_CONFIG_INVALID com details.fields', async () => {
    const result = await sut.execute({
      patch: { actionPointsPerTurn: 0, foo: 1 },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(LabConfigInvalidError)
      expect(result.value.code).toBe('LAB_CONFIG_INVALID')
      expect(result.value.message).toBe('Configuração do laboratório inválida.')
      expect(result.value.details).toEqual({
        fields: [
          { field: 'actionPointsPerTurn', reason: 'outOfRange' },
          { field: 'foo', reason: 'unknownKey' },
        ],
      })
    }
  })

  it('REQ-06: pedido inválido não salva nada (tudo ou nada)', async () => {
    const saved = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      initialGold: 50,
    })
    repository.item = saved

    await sut.execute({ patch: { baseHealth: 30, initialGold: 2.5 } })

    expect(repository.item).toBe(saved)
  })

  it('REQ-06: sem ajuste salvo, pedido inválido continua sem salvar', async () => {
    await sut.execute({ patch: 'não é objeto' })

    expect(repository.item).toBeNull()
  })
})
