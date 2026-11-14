import { type Either, left, right } from '@/core/error/either'
import { ValueObject } from '@/core/value-object'

import {
  GAME_CONFIG_DEFAULTS,
  GAME_CONFIG_LIMITS,
  type TGameConfigKey,
  type TGameConfigValues,
} from './defaults'

/** Motivos de CONTRATO FEAT-03 (`LabConfigInvalidDetails`). */
export type TGameConfigIssue =
  | { field: null; reason: 'invalidBody' }
  | {
      field: string
      reason: 'unknownKey' | 'notInteger' | 'outOfRange' | 'minAboveMax'
    }

/** Valores ajustáveis do Apêndice A em vigor (D-11). */
export class GameConfig extends ValueObject<TGameConfigValues> {
  get values(): TGameConfigValues {
    return { ...this.props }
  }

  static create(values: TGameConfigValues): GameConfig {
    return new GameConfig(values)
  }

  static withDefaults(): GameConfig {
    return new GameConfig(GAME_CONFIG_DEFAULTS)
  }

  /**
   * Ajuste parcial sobre os valores atuais (REQ-05, REQ-06). Tudo ou nada:
   * qualquer problema devolve a lista inteira, na ordem das chaves do pedido,
   * com `minAboveMax` (das duas chaves) por último.
   */
  applyPatch(input: unknown): Either<TGameConfigIssue[], GameConfig> {
    if (!isPlainObject(input)) {
      return left([{ field: null, reason: 'invalidBody' }])
    }

    const issues: TGameConfigIssue[] = []
    const next: TGameConfigValues = { ...this.props }

    for (const [field, value] of Object.entries(input)) {
      if (!isGameConfigKey(field)) {
        issues.push({ field, reason: 'unknownKey' })
        continue
      }
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        issues.push({ field, reason: 'notInteger' })
        continue
      }
      const { min, max } = GAME_CONFIG_LIMITS[field]
      if (value < min || value > max) {
        issues.push({ field, reason: 'outOfRange' })
        continue
      }
      next[field] = value
    }

    if (next.minPlayers > next.maxPlayers) {
      issues.push(
        { field: 'minPlayers', reason: 'minAboveMax' },
        { field: 'maxPlayers', reason: 'minAboveMax' }
      )
    }

    if (issues.length > 0) {
      return left(issues)
    }

    return right(new GameConfig(next))
  }
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function isGameConfigKey(field: string): field is TGameConfigKey {
  return Object.hasOwn(GAME_CONFIG_DEFAULTS, field)
}
