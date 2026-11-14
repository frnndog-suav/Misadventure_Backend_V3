// Único lugar dos valores ajustáveis do Apêndice A (D-11) e dos seus limites (D-12).
// Cada FEAT seguinte acrescenta aqui as suas chaves.

export interface TGameConfigValues {
  minPlayers: number // README 1.3
  maxPlayers: number // README 1.3
  actionPointsPerTurn: number // README 11.1
  initialPeak: number // README 7.4
  initialVigor: number // README 7.4
  baseHealth: number // README 9.1
  initialGold: number // README 9.1
  initialHandSize: number // README 9.1
}

export type TGameConfigKey = keyof TGameConfigValues

export interface TGameConfigLimit {
  min: number
  max: number
}

export const GAME_CONFIG_DEFAULTS: Readonly<TGameConfigValues> = Object.freeze({
  minPlayers: 1,
  maxPlayers: 6,
  actionPointsPerTurn: 3,
  initialPeak: 10,
  initialVigor: 10,
  baseHealth: 20,
  initialGold: 10,
  initialHandSize: 7,
})

/** Inteiros, inclusivos. Além deles, `minPlayers ≤ maxPlayers`. */
export const GAME_CONFIG_LIMITS: Readonly<
  Record<TGameConfigKey, Readonly<TGameConfigLimit>>
> = Object.freeze({
  minPlayers: { min: 1, max: 6 },
  maxPlayers: { min: 1, max: 6 },
  actionPointsPerTurn: { min: 1, max: 10 },
  initialPeak: { min: 1, max: 1000 },
  initialVigor: { min: 0, max: 1000 },
  baseHealth: { min: 1, max: 1000 },
  initialGold: { min: 0, max: 100000 },
  initialHandSize: { min: 0, max: 60 },
})
