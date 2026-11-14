import type { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import {
  GAME_CONFIG_DEFAULTS,
  GAME_CONFIG_LIMITS,
  type TGameConfigKey,
  type TGameConfigLimit,
  type TGameConfigValues,
} from '@/domain/lab/enterprise/value-objects/game-config/defaults'

/** CONTRATO FEAT-03, tipo `LabConfig`. */
export interface TLabConfigHttp {
  values: TGameConfigValues
  defaults: TGameConfigValues
  limits: Record<TGameConfigKey, TGameConfigLimit>
}

export class LabConfigPresenter {
  static toHTTP(config: GameConfig): TLabConfigHttp {
    return {
      values: config.values,
      defaults: { ...GAME_CONFIG_DEFAULTS },
      limits: structuredClone(GAME_CONFIG_LIMITS),
    }
  }
}
