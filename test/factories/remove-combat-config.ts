import { COMBAT_NUMERIC_LIMITS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

/** Remove da fixture as chaves que ainda não existiam nos saves v2–v6. */
export function removeCombatConfig(config: Record<string, unknown>): void {
  for (const key of Object.keys(COMBAT_NUMERIC_LIMITS)) delete config[key]
  delete config.enemyAbilityPriorities
}
