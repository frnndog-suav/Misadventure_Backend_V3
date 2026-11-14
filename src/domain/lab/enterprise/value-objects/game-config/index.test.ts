import { describe, expect, it } from 'vitest'

import { GAME_CONFIG_DEFAULTS, GAME_CONFIG_LIMITS } from './defaults'
import { GameConfig } from '.'

describe('GameConfig', () => {
  it('REQ-04: padrões do Apêndice A (D-11)', () => {
    expect(GAME_CONFIG_DEFAULTS).toEqual({
      minPlayers: 1,
      maxPlayers: 6,
      actionPointsPerTurn: 3,
      initialPeak: 10,
      initialVigor: 10,
      baseHealth: 20,
      initialGold: 10,
      initialHandSize: 7,
    })
    expect(GameConfig.withDefaults().values).toEqual(GAME_CONFIG_DEFAULTS)
  })

  it('REQ-04: limites inclusivos de cada chave (D-12)', () => {
    expect(GAME_CONFIG_LIMITS).toEqual({
      minPlayers: { min: 1, max: 6 },
      maxPlayers: { min: 1, max: 6 },
      actionPointsPerTurn: { min: 1, max: 10 },
      initialPeak: { min: 1, max: 1000 },
      initialVigor: { min: 0, max: 1000 },
      baseHealth: { min: 1, max: 1000 },
      initialGold: { min: 0, max: 100000 },
      initialHandSize: { min: 0, max: 60 },
    })
  })

  it('REQ-05: aplica um ajuste parcial e mantém as demais chaves', () => {
    const result = GameConfig.withDefaults().applyPatch({
      actionPointsPerTurn: 4,
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.values).toEqual({
        ...GAME_CONFIG_DEFAULTS,
        actionPointsPerTurn: 4,
      })
    }
  })

  it('REQ-05: ajuste parcial parte da configuração atual, não dos padrões', () => {
    const current = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      initialGold: 50,
    })

    const result = current.applyPatch({ baseHealth: 30 })

    expect(result.isRight() && result.value.values).toEqual({
      ...GAME_CONFIG_DEFAULTS,
      initialGold: 50,
      baseHealth: 30,
    })
  })

  it('REQ-05: {} é aceito e não muda nada', () => {
    const result = GameConfig.withDefaults().applyPatch({})

    expect(result.isRight() && result.value.values).toEqual(
      GAME_CONFIG_DEFAULTS
    )
  })

  it('REQ-05: aceita os extremos dos limites', () => {
    const result = GameConfig.withDefaults().applyPatch({
      actionPointsPerTurn: 10,
      initialVigor: 0,
      initialGold: 100000,
    })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-05: não altera a configuração original (imutável)', () => {
    const current = GameConfig.withDefaults()

    current.applyPatch({ actionPointsPerTurn: 4 })

    expect(current.values.actionPointsPerTurn).toBe(3)
  })

  it.each([null, [], 'texto', 42, true])(
    'REQ-06: corpo que não é objeto (%j) → invalidBody',
    (input) => {
      const result = GameConfig.withDefaults().applyPatch(input)

      expect(result.isLeft() && result.value).toEqual([
        { field: null, reason: 'invalidBody' },
      ])
    }
  )

  it('REQ-06: fora do limite e chave desconhecida, na ordem do pedido', () => {
    const result = GameConfig.withDefaults().applyPatch({
      actionPointsPerTurn: 0,
      foo: 1,
    })

    expect(result.isLeft() && result.value).toEqual([
      { field: 'actionPointsPerTurn', reason: 'outOfRange' },
      { field: 'foo', reason: 'unknownKey' },
    ])
  })

  it.each([2.5, '4', null, true])(
    'REQ-06: valor não inteiro (%j) → notInteger',
    (value) => {
      const result = GameConfig.withDefaults().applyPatch({
        initialGold: value,
      })

      expect(result.isLeft() && result.value).toEqual([
        { field: 'initialGold', reason: 'notInteger' },
      ])
    }
  )

  it('REQ-06: acima do máximo → outOfRange', () => {
    const result = GameConfig.withDefaults().applyPatch({ maxPlayers: 7 })

    expect(result.isLeft() && result.value).toEqual([
      { field: 'maxPlayers', reason: 'outOfRange' },
    ])
  })

  it('REQ-06: minPlayers > maxPlayers → minAboveMax nas duas chaves', () => {
    const result = GameConfig.withDefaults().applyPatch({
      minPlayers: 5,
      maxPlayers: 3,
    })

    expect(result.isLeft() && result.value).toEqual([
      { field: 'minPlayers', reason: 'minAboveMax' },
      { field: 'maxPlayers', reason: 'minAboveMax' },
    ])
  })

  it('REQ-06: minAboveMax considera a configuração atual', () => {
    const current = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      maxPlayers: 3,
    })

    const result = current.applyPatch({ minPlayers: 4 })

    expect(result.isLeft() && result.value).toEqual([
      { field: 'minPlayers', reason: 'minAboveMax' },
      { field: 'maxPlayers', reason: 'minAboveMax' },
    ])
  })

  it('REQ-06: minAboveMax vem depois dos erros por chave', () => {
    const result = GameConfig.withDefaults().applyPatch({
      minPlayers: 5,
      foo: 1,
      maxPlayers: 3,
    })

    expect(result.isLeft() && result.value).toEqual([
      { field: 'foo', reason: 'unknownKey' },
      { field: 'minPlayers', reason: 'minAboveMax' },
      { field: 'maxPlayers', reason: 'minAboveMax' },
    ])
  })
})
