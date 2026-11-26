import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { SeedGenerator } from '@/core/ports/seed-generator'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { DrizzlePartyMapper } from '@/infra/database/drizzle/mappers/drizzle-party-mapper'
import { createApp } from '../../../../../test/lab-app'
import { resetCampaign, WARRIOR_BODY } from '../../../../../test/parties-e2e'

describe('FEAT-20: criação com ajudantes (T-88)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  beforeEach(async () => {
    await resetCampaign(app)
  })

  afterAll(async () => {
    await app?.close()
  })

  it.each([
    ['omitido', {}],
    ['zero', { aiHelperCount: 0 }],
  ])('REQ-178: aceita o campo %s no padrão', async (_label, fields) => {
    const created = await request(app.getHttpServer())
      .post('/parties')
      .send({ ...WARRIOR_BODY, ...fields })
      .expect(201)

    expect(created.body.members).toHaveLength(1)
    expect(created.body.members[0]).toMatchObject({
      kind: 'human',
      isHost: true,
    })
  })

  it.each([
    [null, 'notInteger'],
    ['2', 'notInteger'],
    [1.5, 'notInteger'],
    [-1, 'outOfRange'],
    [6, 'aboveMaxPlayers'],
  ])('REQ-178: recusa %s com %s', async (count, reason) => {
    const server = app.getHttpServer()
    const response = await request(server)
      .post('/parties')
      .send({ ...WARRIOR_BODY, aiHelperCount: count })
      .expect(400)

    expect(response.body.error).toMatchObject({
      code: 'PARTY_INVALID',
      details: { fields: [{ field: 'aiHelperCount', reason }] },
    })
    expect((await request(server).get('/parties').expect(200)).body).toEqual([])
  })

  it('REQ-178: usa os limites vigentes na criação após a consulta', async () => {
    const server = app.getHttpServer()
    await request(server)
      .get('/parties/creation-options')
      .expect(200, { minPlayers: 1, maxPlayers: 6 })
    await request(server)
      .patch('/lab/config')
      .send({ minPlayers: 2, maxPlayers: 4 })
      .expect(200)

    for (const fields of [{}, { aiHelperCount: 0 }]) {
      const response = await request(server)
        .post('/parties')
        .send({ ...WARRIOR_BODY, ...fields })
        .expect(400)

      expect(response.body.error).toMatchObject({
        code: 'PARTY_INVALID',
        details: {
          fields: [{ field: 'aiHelperCount', reason: 'belowMinPlayers' }],
        },
      })
    }

    await request(server)
      .get('/parties/creation-options')
      .expect(200, { minPlayers: 2, maxPlayers: 4 })
    const response = await request(server)
      .post('/parties')
      .send({ ...WARRIOR_BODY, aiHelperCount: 3 })
      .expect(201)
    expect(response.body.members).toHaveLength(4)
  })

  it('REQ-178/REQ-179/REQ-180: grava cinco ajudantes e projeta estado e resumo', async () => {
    const server = app.getHttpServer()
    const response = await request(server)
      .post('/parties')
      .send({ ...WARRIOR_BODY, aiHelperCount: 5 })
      .expect(201)
    const party = response.body
    const ids = party.members.map(({ id }: { id: string }) => id)
    const startingCity = party.dimension.startingCityZoneId

    expect(party.status).toBe('idle')
    expect(party.members).toHaveLength(6)
    expect(new Set(ids).size).toBe(6)
    expect(
      party.members.filter(({ isHost }: { isHost: boolean }) => isHost)
    ).toEqual([
      expect.objectContaining({ characterName: 'Lia', kind: 'human' }),
    ])
    expect([...party.turnOrder].sort()).toEqual([...ids].sort())
    expect(party.turn).toMatchObject({ round: 1, memberId: party.turnOrder[0] })
    expect(party).not.toHaveProperty('rngState')

    const helpers = party.members.filter(
      ({ kind }: { kind: string }) => kind === 'aiHelper'
    )
    expect(helpers).toHaveLength(5)
    for (const member of helpers) {
      expect(member).toMatchObject({
        characterName: expect.any(String),
        kind: 'aiHelper',
        isHost: false,
        player: {
          zoneId: startingCity,
          respawnZoneId: startingCity,
          hand: [],
          handCopies: [],
          availableActions: [],
          moveTargets: [],
          moveRoutes: [],
        },
      })
      expect(member.player.playerClasses).toHaveLength(1)
      expect(member.player.build.length).toBeGreaterThan(0)
      expect(member.player).not.toHaveProperty('deck')
    }

    await request(server)
      .get('/parties/' + party.id)
      .expect(200, party)
    const summary = await request(server).get('/parties').expect(200)
    expect(summary.body).toEqual([
      expect.objectContaining({
        id: party.id,
        characterNames: party.members.map(
          ({ characterName }: { characterName: string }) => characterName
        ),
      }),
    ])
  })

  it('REQ-179: a mesma semente preserva classes, decks e ordem relativa', async () => {
    const server = app.getHttpServer()
    const repository = app.get(PartiesRepository)
    const seed = vi.spyOn(app.get(SeedGenerator), 'next').mockReturnValue(42)

    async function create() {
      const response = await request(server)
        .post('/parties')
        .send({ ...WARRIOR_BODY, aiHelperCount: 3 })
        .expect(201)
      const party = await repository.findById(response.body.id)
      if (!party) throw new Error('Save ausente')

      const ids = party.members.map(({ id }) => id.toString())
      expect(ids).toHaveLength(4)
      for (const { player } of party.members) {
        expect(player.hand).toHaveLength(7)
        expect(player.deck.length).toBeGreaterThan(0)
      }
      return {
        order: party.turnOrder.map((id) => ids.indexOf(id.toString())),
        players: party.members.map(({ player }) => ({
          classes: player.playerClasses,
          hand: player.hand,
          deck: player.deck,
        })),
        rng: party.rngState,
      }
    }

    try {
      const first = await create()
      expect(await create()).toEqual(first)
    } finally {
      seed.mockRestore()
    }
  })

  it('REQ-179: lê um save solo v11 preservando progresso e RNG', async () => {
    const server = app.getHttpServer()
    const response = await request(server)
      .post('/parties')
      .send(WARRIOR_BODY)
      .expect(201)
    const repository = app.get(PartiesRepository)
    const party = await repository.findById(response.body.id)
    if (!party) throw new Error('Save ausente')
    const row = DrizzlePartyMapper.toDrizzle(party)
    const state = {
      ...row.state,
      schemaVersion: 11,
      members: row.state.members.map((member) => ({
        ...member,
        kind: 'human',
        player: { ...member.player, gold: 37 },
      })),
    }

    const restored = DrizzlePartyMapper.toDomain({ ...row, state })

    expect(restored.members).toHaveLength(1)
    expect(restored.members[0].kind).toBe('human')
    expect(restored.members[0].player.gold).toBe(37)
    expect(restored.hostMemberId).toEqual(party.hostMemberId)
    expect(restored.turn).toEqual(party.turn)
    expect(restored.rngState).toEqual(party.rngState)
  })

  it('REQ-180: bloqueia intenção HTTP na vez de um ajudante', async () => {
    const server = app.getHttpServer()
    const response = await request(server)
      .post('/parties')
      .send({ ...WARRIOR_BODY, aiHelperCount: 1 })
      .expect(201)
    const repository = app.get(PartiesRepository)
    const party = await repository.findById(response.body.id)
    if (!party) throw new Error('Save ausente')
    const helper = party.members.find(({ kind }) => String(kind) === 'aiHelper')
    expect(helper).toBeDefined()
    if (!helper) throw new Error('Ajudante ausente')

    // Estado ativo com IA na vez, sem depender do avanço automático da T-90.
    const row = DrizzlePartyMapper.toDrizzle(party)
    row.status = 'inSession'
    row.state.turn.memberId = helper.id.toString()
    const pending = DrizzlePartyMapper.toDomain(row)
    await repository.save(pending)
    const before = await request(server)
      .get('/parties/' + row.id)
      .expect(200)
    expect(before.body.turn.memberId).toBe(helper.id.toString())
    expect(before.body.members[1].player.availableActions).toEqual([])

    await request(server)
      .post('/parties/' + row.id + '/actions')
      .set('Idempotency-Key', '105a315f-de51-44d0-aca0-93a270925182')
      .send({ type: 'endTurn' })
      .expect(409)

    await request(server)
      .get('/parties/' + row.id)
      .expect(200, before.body)
    const stored = await repository.findById(row.id)
    expect(stored?.rngState).toEqual(pending.rngState)
  })
})
