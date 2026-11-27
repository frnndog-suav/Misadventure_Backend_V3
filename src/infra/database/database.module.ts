import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { EnvService } from '../env/env.service'
import { type Database, DRIZZLE, PG_POOL } from './database.tokens'
import { DrizzleGameConfigRepository } from './drizzle/repositories/drizzle-game-config-repository'
import { DrizzlePartiesRepository } from './drizzle/repositories/drizzle-parties-repository'

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [EnvService],
      // A consulta inicial faz o boot falhar cedo se o banco estiver inacessível.
      useFactory: async (env: EnvService): Promise<Pool> => {
        const pool = new Pool({ connectionString: env.get('DATABASE_URL') })
        await pool.query('select 1')
        return pool
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool),
    },
    { provide: GameConfigRepository, useClass: DrizzleGameConfigRepository },
    DrizzlePartiesRepository,
    { provide: PartiesRepository, useExisting: DrizzlePartiesRepository },
  ],
  exports: [
    DRIZZLE,
    GameConfigRepository,
    PartiesRepository,
    DrizzlePartiesRepository,
  ],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }
}
