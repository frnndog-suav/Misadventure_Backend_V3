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
      minDeckSize: 60,
      lockOneEssential: 18,
      lockTwoEssentials: 10,
      mapMaxAttempts: 1000,
      defaultAttack: 5,
      defaultDefense: 3,
      defaultAccuracy: 50,
      defaultEvasion: 20,
      defaultCelerity: 10,
      defaultPiercing: 0,
      defaultReflection: 0,
      maxCopiesPerCard: 4,
      tcgFolderCapacity: 30,
      recoverHealthPercent: 15,
      recoverVigorPercent: 5,
      recoverHandSize: 7,
    })
    expect(GameConfig.withDefaults().values).toEqual(GAME_CONFIG_DEFAULTS)
  })

  it('REQ-29: chaves novas com os limites de D-41', () => {
    expect(GAME_CONFIG_LIMITS).toMatchObject({
      minDeckSize: { min: 1, max: 200 },
      lockOneEssential: { min: 0, max: 200 },
      lockTwoEssentials: { min: 0, max: 200 },
      mapMaxAttempts: { min: 1, max: 100000 },
      defaultAttack: { min: 0, max: 1000 },
      defaultDefense: { min: 0, max: 1000 },
      defaultAccuracy: { min: 0, max: 1000 },
      defaultEvasion: { min: 0, max: 1000 },
      defaultCelerity: { min: 0, max: 1000 },
      defaultPiercing: { min: 0, max: 1000 },
      defaultReflection: { min: 0, max: 1000 },
    })
  })

  it('REQ-29: as chaves novas aceitam ajuste e respeitam o limite (REQ-05, REQ-06)', () => {
    const ok = GameConfig.withDefaults().applyPatch({ minDeckSize: 40 })
    expect(ok.isRight() && ok.value.values.minDeckSize).toBe(40)

    const bad = GameConfig.withDefaults().applyPatch({ mapMaxAttempts: 0 })
    expect(bad.isLeft() && bad.value).toEqual([
      { field: 'mapMaxAttempts', reason: 'outOfRange' },
    ])
  })

  it('REQ-60: chaves do deck com padrões e limites (D-67)', () => {
    expect(GAME_CONFIG_DEFAULTS).toMatchObject({
      maxCopiesPerCard: 4,
      tcgFolderCapacity: 30,
      recoverHealthPercent: 15,
      recoverVigorPercent: 5,
      recoverHandSize: 7,
    })
    expect(GAME_CONFIG_LIMITS).toMatchObject({
      maxCopiesPerCard: { min: 1, max: 200 },
      tcgFolderCapacity: { min: 0, max: 1000 },
      recoverHealthPercent: { min: 0, max: 100 },
      recoverVigorPercent: { min: 0, max: 100 },
      recoverHandSize: { min: 0, max: 200 },
    })
  })

  it('REQ-60: as chaves do deck aceitam ajuste e respeitam o limite (REQ-05, REQ-06)', () => {
    const ok = GameConfig.withDefaults().applyPatch({ recoverHandSize: 10 })
    expect(ok.isRight() && ok.value.values.recoverHandSize).toBe(10)

    const bad = GameConfig.withDefaults().applyPatch({ maxCopiesPerCard: 0 })
    expect(bad.isLeft() && bad.value).toEqual([
      { field: 'maxCopiesPerCard', reason: 'outOfRange' },
    ])
  })

  it('REQ-04: limites inclusivos de cada chave (D-12)', () => {
    expect(GAME_CONFIG_LIMITS).toMatchObject({
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
