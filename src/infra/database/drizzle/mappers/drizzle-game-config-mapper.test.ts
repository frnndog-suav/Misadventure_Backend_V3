import { describe, expect, it } from 'vitest'
import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { DrizzleGameConfigMapper } from './drizzle-game-config-mapper'

describe('DrizzleGameConfigMapper', () => {
  it('REQ-09: sem chave salva, devolve os padrões', () => {
    const config = DrizzleGameConfigMapper.toDomain({ values: {} })

    expect(config.values).toEqual(GAME_CONFIG_DEFAULTS)
  })

  it('REQ-09: mescla os valores salvos sobre os padrões', () => {
    const config = DrizzleGameConfigMapper.toDomain({
      values: { actionPointsPerTurn: 5, initialGold: 0 },
    })

    expect(config.values).toEqual({
      ...GAME_CONFIG_DEFAULTS,
      actionPointsPerTurn: 5,
      initialGold: 0,
    })
  })

  it('REQ-09: chave salva que não existe mais é ignorada', () => {
    const config = DrizzleGameConfigMapper.toDomain({
      values: { removedKey: 99, baseHealth: 30 },
    })

    expect(config.values).toEqual({ ...GAME_CONFIG_DEFAULTS, baseHealth: 30 })
    expect(Object.keys(config.values)).not.toContain('removedKey')
  })

  it('REQ-09: valor salvo fora dos limites ou não inteiro cai no padrão', () => {
    const config = DrizzleGameConfigMapper.toDomain({
      values: {
        actionPointsPerTurn: 11,
        initialHandSize: -1,
        initialPeak: 2.5,
        initialVigor: '7',
        baseHealth: null,
      },
    })

    expect(config.values).toEqual(GAME_CONFIG_DEFAULTS)
  })

  it('REQ-09: values que não é objeto devolve os padrões', () => {
    expect(DrizzleGameConfigMapper.toDomain({ values: null }).values).toEqual(
      GAME_CONFIG_DEFAULTS
    )
    expect(DrizzleGameConfigMapper.toDomain({ values: [1, 2] }).values).toEqual(
      GAME_CONFIG_DEFAULTS
    )
  })

  it('D-13: grava só as chaves que diferem do padrão', () => {
    const config = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      maxPlayers: 4,
      initialGold: 25,
    })

    expect(DrizzleGameConfigMapper.toDrizzle(config)).toEqual({
      maxPlayers: 4,
      initialGold: 25,
    })
  })
})
