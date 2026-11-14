import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { DatabaseModule } from '@/infra/database/database.module'
import { type Database, DRIZZLE } from '@/infra/database/database.tokens'
import { EnvModule } from '@/infra/env/env.module'
import type { TestingModule } from '@nestjs/testing'

describe('DrizzleGameConfigRepository (e2e)', () => {
  let moduleRef: TestingModule
  let repository: GameConfigRepository
  let db: Database

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [EnvModule, DatabaseModule],
    }).compile()
    await moduleRef.init()
    repository = moduleRef.get(GameConfigRepository)
    db = moduleRef.get(DRIZZLE)
  })

  beforeEach(async () => {
    await repository.delete()
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  it('D-13: sem linha salva, get devolve null', async () => {
    expect(await repository.get()).toBeNull()
  })

  it('D-13: salva, lê e sobrescreve a única linha', async () => {
    await repository.save(
      GameConfig.create({ ...GAME_CONFIG_DEFAULTS, actionPointsPerTurn: 5 })
    )
    await repository.save(
      GameConfig.create({ ...GAME_CONFIG_DEFAULTS, initialGold: 40 })
    )

    const config = await repository.get()

    expect(config?.values).toEqual({ ...GAME_CONFIG_DEFAULTS, initialGold: 40 })
    const rows = await db.execute(sql`select id, "values" from game_config`)
    expect(rows.rows).toEqual([{ id: 'current', values: { initialGold: 40 } }])
  })

  it('REQ-09: mescla a linha salva sobre os padrões ao ler', async () => {
    await db.execute(
      sql`insert into game_config (id, "values") values ('current', ${JSON.stringify({ removedKey: 1, baseHealth: 30, initialHandSize: 999 })}::jsonb)`
    )

    const config = await repository.get()

    expect(config?.values).toEqual({ ...GAME_CONFIG_DEFAULTS, baseHealth: 30 })
  })

  it('D-13: delete apaga a linha', async () => {
    await repository.save(
      GameConfig.create({ ...GAME_CONFIG_DEFAULTS, maxPlayers: 3 })
    )

    await repository.delete()

    expect(await repository.get()).toBeNull()
  })
})
