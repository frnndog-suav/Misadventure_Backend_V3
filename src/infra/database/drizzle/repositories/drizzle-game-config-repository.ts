import { Inject, Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import type { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import { type Database, DRIZZLE } from '../../database.tokens'
import { DrizzleGameConfigMapper } from '../mappers/drizzle-game-config-mapper'
import { gameConfig } from '../schema'

const ROW_ID = 'current'

@Injectable()
export class DrizzleGameConfigRepository implements GameConfigRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async get(): Promise<GameConfig | null> {
    const [row] = await this.db
      .select({ values: gameConfig.values })
      .from(gameConfig)
      .where(eq(gameConfig.id, ROW_ID))
    return row ? DrizzleGameConfigMapper.toDomain(row) : null
  }

  async save(config: GameConfig): Promise<void> {
    const values = DrizzleGameConfigMapper.toDrizzle(config)
    await this.db
      .insert(gameConfig)
      .values({ id: ROW_ID, values })
      .onConflictDoUpdate({
        target: gameConfig.id,
        set: { values, updatedAt: sql`now()` },
      })
  }

  async delete(): Promise<void> {
    await this.db.delete(gameConfig).where(eq(gameConfig.id, ROW_ID))
  }
}
