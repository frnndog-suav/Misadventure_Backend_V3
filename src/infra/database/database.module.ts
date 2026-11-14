import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { EnvService } from '../env/env.service'

export const PG_POOL = Symbol('PG_POOL')
export const DRIZZLE = Symbol('DRIZZLE')
export type Database = NodePgDatabase

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
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }
}
