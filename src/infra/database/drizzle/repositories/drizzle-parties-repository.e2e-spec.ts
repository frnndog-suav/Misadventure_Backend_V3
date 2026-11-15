import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng } from '@/core/rng/seeded-rng'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { DatabaseModule } from '@/infra/database/database.module'
import { type Database, DRIZZLE } from '@/infra/database/database.tokens'
import { EnvModule } from '@/infra/env/env.module'
import { makeParty } from '../../../../../test/factories/make-party'
import type { TestingModule } from '@nestjs/testing'

const ID_1 = '00000000-0000-4000-8000-000000000001'
const ID_2 = '00000000-0000-4000-8000-000000000002'
const ID_3 = '00000000-0000-4000-8000-000000000003'

describe('DrizzlePartiesRepository (e2e)', () => {
  let moduleRef: TestingModule
  let repository: PartiesRepository
  let db: Database

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [EnvModule, DatabaseModule],
    }).compile()
    await moduleRef.init()
    repository = moduleRef.get(PartiesRepository)
    db = moduleRef.get(DRIZZLE)
  })

  beforeEach(async () => {
    await db.execute(sql`delete from parties`)
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  it('REQ-22: cria, salva e lê de volta igual, com o próximo sorteio idêntico', async () => {
    const rng = SeededRng.fromSeed(123)
    const party = makeParty({ rngState: rng.state() }, new UniqueEntityID(ID_1))
    await repository.create(party)

    for (let i = 0; i < 10; i++) rng.nextInt(1, 6)
    const changed = makeParty(
      {
        status: 'inSession',
        rngState: rng.state(),
        savedAt: new Date('2026-11-15T10:00:00.000Z'),
      },
      new UniqueEntityID(ID_1)
    )
    await repository.save(changed)

    const read = await repository.findById(ID_1)

    expect(read).not.toBeNull()
    expect(read?.name).toBe(changed.name)
    expect(read?.status).toBe('inSession')
    expect(read?.members.map((m) => m.characterName)).toEqual(['Lia'])
    expect(read?.hostMemberId.toString()).toBe('member-1')
    expect(read?.config).toEqual(changed.config)
    expect(read?.rngState).toEqual(changed.rngState)
    expect(read?.createdAt).toEqual(changed.createdAt)
    expect(read?.savedAt).toEqual(changed.savedAt)
    const readRng = SeededRng.fromState(read!.rngState)
    expect(readRng.nextInt(1, 6)).toBe(rng.nextInt(1, 6))
  })

  it('REQ-22: id inexistente devolve null', async () => {
    expect(await repository.findById(ID_2)).toBeNull()
  })

  it('REQ-19: id que não é uuid devolve null (sem erro do banco)', async () => {
    expect(await repository.findById('nao-existe')).toBeNull()
  })

  it('REQ-22: save de grupo inexistente lança e não grava nada', async () => {
    await expect(
      repository.save(makeParty({}, new UniqueEntityID(ID_2)))
    ).rejects.toThrow()
    expect(await repository.findAll()).toEqual([])
  })

  it('REQ-18: findAll devolve todos os saves (a ordem é do caso de uso)', async () => {
    await repository.create(makeParty({ name: 'A' }, new UniqueEntityID(ID_1)))
    await repository.create(makeParty({ name: 'B' }, new UniqueEntityID(ID_2)))

    const all = await repository.findAll()

    expect(all.map((p) => p.name).sort()).toEqual(['A', 'B'])
  })

  it('REQ-24: delete apaga só o save pedido', async () => {
    const keep = makeParty({}, new UniqueEntityID(ID_1))
    const gone = makeParty({}, new UniqueEntityID(ID_3))
    await repository.create(keep)
    await repository.create(gone)

    await repository.delete(gone)

    expect(await repository.findById(ID_3)).toBeNull()
    expect(await repository.findById(ID_1)).not.toBeNull()
  })

  it('D-31: grava uma linha com colunas consultáveis e state jsonb', async () => {
    await repository.create(makeParty({}, new UniqueEntityID(ID_1)))

    const rows = await db.execute(
      sql`select id, name, status, state->>'schemaVersion' as v from parties`
    )

    expect(rows.rows).toEqual([
      { id: ID_1, name: 'Os Teimosos', status: 'idle', v: '1' },
    ])
  })
})
