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
  minDeckSize: number // README 4.4
  lockOneEssential: number // README 8.2
  lockTwoEssentials: number // README 8.2
  mapMaxAttempts: number // README 3.5 (D-38)
  defaultAttack: number // README 8.7 (Padrão)
  defaultDefense: number // README 8.7
  defaultAccuracy: number // README 8.7
  defaultEvasion: number // README 8.7
  defaultCelerity: number // README 8.7
  defaultPiercing: number // README 8.7
  defaultReflection: number // README 8.7
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
