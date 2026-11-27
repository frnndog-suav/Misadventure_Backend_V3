import {
  BLACKSMITH_LIMITS,
  MOUNT_LIMITS,
  COMBAT_NUMERIC_LIMITS,
  COMPLETION_PEAK_LIMITS,
  KNOCKOUT_NUMERIC_LIMITS,
  MARKET_LIMITS,
  QUEST_LIMITS,
} from '@/domain/lab/enterprise/value-objects/game-config/defaults'

/** Remove da fixture as chaves que ainda não existiam nos saves v2–v6. */
export function removePostV6Config(config: Record<string, unknown>): void {
  for (const key of Object.keys({
    ...COMBAT_NUMERIC_LIMITS,
    ...KNOCKOUT_NUMERIC_LIMITS,
    ...QUEST_LIMITS,
    ...MARKET_LIMITS,
    ...BLACKSMITH_LIMITS,
    ...MOUNT_LIMITS,
    ...COMPLETION_PEAK_LIMITS,
  }))
    delete config[key]
  delete config.enemyAbilityPriorities
  delete config.aiPlayerPriorities
}
