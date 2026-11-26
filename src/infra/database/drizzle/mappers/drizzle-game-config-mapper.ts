import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import {
  GAME_CONFIG_DEFAULTS,
  GAME_CONFIG_LIMITS,
  type TNumericGameConfigKey,
  type TGameConfigValues,
} from '@/domain/lab/enterprise/value-objects/game-config/defaults'

interface TGameConfigRow {
  values: unknown
}

const STRUCTURED_KEYS = [
  'reserveDeck',
  'enemyAbilityPriorities',
  'aiPlayerPriorities',
] as const

const KEYS = Object.keys(GAME_CONFIG_DEFAULTS).filter(
  (key) => !STRUCTURED_KEYS.some((structuredKey) => structuredKey === key)
) as TNumericGameConfigKey[]

export class DrizzleGameConfigMapper {
  /**
   * REQ-09: o salvo sobre os padrões. Chave que não existe mais é ignorada;
   * chave sem valor salvo, ou com valor fora dos limites atuais, usa o padrão.
   */
  static toDomain(row: TGameConfigRow): GameConfig {
    const saved = isPlainObject(row.values) ? row.values : {}
    const values: TGameConfigValues = { ...GAME_CONFIG_DEFAULTS }

    for (const key of KEYS) {
      const value = saved[key]
      const { min, max } = GAME_CONFIG_LIMITS[key]
      if (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= min &&
        value <= max
      ) {
        values[key] = value
      }
    }

    for (const key of STRUCTURED_KEYS) {
      const result = GameConfig.withDefaults().applyPatch({ [key]: saved[key] })
      if (result.isRight())
        Object.assign(values, { [key]: result.value.values[key] })
    }
    return GameConfig.create(values)
  }

  /** D-13: grava só as chaves que diferem do padrão. */
  static toDrizzle(config: GameConfig): Partial<TGameConfigValues> {
    const current = config.values
    const adjusted: Partial<TGameConfigValues> = {}
    for (const key of KEYS) {
      if (current[key] !== GAME_CONFIG_DEFAULTS[key]) {
        adjusted[key] = current[key]
      }
    }
    for (const key of STRUCTURED_KEYS) {
      if (
        JSON.stringify(current[key]) !==
        JSON.stringify(GAME_CONFIG_DEFAULTS[key])
      ) {
        Object.assign(adjusted, { [key]: current[key] })
      }
    }
    return adjusted
  }
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
