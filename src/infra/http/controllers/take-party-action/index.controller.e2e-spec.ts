import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { createApp } from '../../../../../test/lab-app'
import {
  PARTY_NOT_FOUND,
  postParty,
  resetCampaign,
} from '../../../../../test/parties-e2e'

type TTurn = { round: number; memberId: string; actionPoints: number }

type TParty = {
  savedAt: string
  turn: TTurn
  dimension: { map: { crossings: { zoneIds: [string, string] }[] } }
  members: {
    id: string
    player: {
      zoneId: string
      moveTargets: string[]
      availableActions: string[]
    }
  }[]
}

const CITY = 'fixture.gray-harbor'

function neighbours(party: TParty, zoneId: string): string[] {
  const found = new Set<string>()
  for (const [a, b] of party.dimension.map.crossings.map((c) => c.zoneIds)) {
    if (a === zoneId && b !== zoneId) found.add(b)
    if (b === zoneId && a !== zoneId) found.add(a)
  }
  return [...found].sort()
}

describe('POST /parties/:partyId/actions (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(false)
  })

  beforeEach(async () => {
    await resetCampaign(app)
  })

  afterAll(async () => {
    await app.close()
  })

  async function startedParty(): Promise<TParty & { id: string }> {
    const created = await postParty(app)
    const started = await request(app.getHttpServer())
      .post(`/parties/${created.id}/session`)
      .expect(200)
    return started.body
  }

  const act = (id: string, body: unknown) =>
    request(app.getHttpServer())
      .post(`/parties/${id}/actions`)
      .send(body as object)

  const get = async (id: string): Promise<TParty> =>
    (await request(app.getHttpServer()).get(`/parties/${id}`)).body

  it('REQ-50: moveTargets = zonas com travessia com a zona atual, em ordem de id', async () => {
    const party = await startedParty()
    const player = party.members[0].player
    expect(player.zoneId).toBe(CITY)
    expect(player.moveTargets.length).toBeGreaterThanOrEqual(1)
    expect(player.moveTargets).toEqual(neighbours(party, CITY))
  })

  it('REQ-51: move aceito, grava, recalcula moveTargets e volta à cidade', async () => {
    const party = await startedParty()
    const target = party.members[0].player.moveTargets[0]

    const moved = await act(party.id, { type: 'move', zoneId: target })
    expect(moved.status).toBe(200)
    const player = moved.body.members[0].player
    expect(player.zoneId).toBe(target)
    expect(player.respawnZoneId).toBe(CITY)
    expect(player.moveTargets).toEqual(neighbours(party, target))
    expect(player.moveTargets).toContain(CITY)
    expect(Date.parse(moved.body.savedAt)).toBeGreaterThanOrEqual(
      Date.parse(party.savedAt)
    )
    expect(await get(party.id)).toEqual(moved.body)

    const back = await act(party.id, { type: 'move', zoneId: CITY })
    expect(back.status).toBe(200)
    expect(back.body.members[0].player.zoneId).toBe(CITY)
  })

  it('REQ-52: zona sem travessia (inclusive a atual) → 409 ACTION_NOT_ALLOWED, nada gravado', async () => {
    const party = await startedParty()
    const response = await act(party.id, { type: 'move', zoneId: CITY })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'ACTION_NOT_ALLOWED',
        message: 'Esta ação não é permitida agora.',
        details: { reason: 'notConnected' },
      },
    })
    expect((await get(party.id)).savedAt).toBe(party.savedAt)
  })

  it('REQ-52: zona fora do mapa → 400 ACTION_INVALID zoneNotInMap', async () => {
    const party = await startedParty()
    const response = await act(party.id, {
      type: 'move',
      zoneId: 'fixture.nowhere',
    })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        code: 'ACTION_INVALID',
        message: 'Ação inválida.',
        details: { fields: [{ field: 'zoneId', reason: 'zoneNotInMap' }] },
      },
    })
  })

  it.each([
    [{ type: 'fly', zoneId: 3 }, [{ field: 'type', reason: 'unknownAction' }]],
    [
      { type: 'move', zoneId: 3, speed: 2 },
      [
        { field: 'zoneId', reason: 'notString' },
        { field: 'speed', reason: 'unknownKey' },
      ],
    ],
    [{}, [{ field: 'type', reason: 'required' }]],
    [[1], [{ field: null, reason: 'invalidBody' }]],
  ])('REQ-53: corpo %j → 400 ACTION_INVALID', async (body, fields) => {
    const party = await startedParty()
    const response = await act(party.id, body)
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('ACTION_INVALID')
    expect(response.body.error.details).toEqual({ fields })
  })

  it('REQ-53: JSON malformado → 400 ACTION_INVALID invalidBody', async () => {
    const party = await startedParty()
    const response = await request(app.getHttpServer())
      .post(`/parties/${party.id}/actions`)
      .set('Content-Type', 'application/json')
      .send('{"type":')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        code: 'ACTION_INVALID',
        message: 'Ação inválida.',
        details: { fields: [{ field: null, reason: 'invalidBody' }] },
      },
    })
  })

  it('REQ-53: grupo sem sessão → 409 PARTY_SESSION_NOT_ACTIVE', async () => {
    const party = await startedParty()
    await request(app.getHttpServer())
      .post(`/parties/${party.id}/session/end`)
      .expect(200)
    const response = await act(party.id, {
      type: 'move',
      zoneId: party.members[0].player.moveTargets[0],
    })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'PARTY_SESSION_NOT_ACTIVE',
        message: 'Não há sessão em andamento neste grupo.',
      },
    })
  })

  it('REQ-53: grupo inexistente → 404 PARTY_NOT_FOUND', async () => {
    const response = await act('00000000-0000-0000-0000-000000000000', {
      type: 'move',
      zoneId: CITY,
    })
    expect(response.status).toBe(404)
    expect(response.body).toEqual(PARTY_NOT_FOUND)
  })

  it('REQ-55/REQ-58: criação traz turn na rodada 1 e availableActions [move, endTurn]', async () => {
    const created = (await postParty(app)) as unknown as TParty
    const memberId = created.members[0].id
    expect(created.turn).toEqual({ round: 1, memberId, actionPoints: 3 })
    expect(created.members[0].player.availableActions).toEqual([
      'move',
      'endTurn',
    ])
  })

  it('REQ-56: três moves gastam 2, 1, 0; o quarto → 409 noActionPoints, nada gravado', async () => {
    const party = await startedParty()
    const a = party.members[0].player.moveTargets[0]

    const points: number[] = []
    let last: TParty = party
    for (const zoneId of [a, CITY, a]) {
      const response = await act(party.id, { type: 'move', zoneId })
      expect(response.status).toBe(200)
      last = response.body
      points.push(last.turn.actionPoints)
    }
    expect(points).toEqual([2, 1, 0])
    expect(last.members[0].player.availableActions).toEqual(['endTurn'])

    const refused = await act(party.id, { type: 'move', zoneId: CITY })
    expect(refused.status).toBe(409)
    expect(refused.body).toEqual({
      error: {
        code: 'ACTION_NOT_ALLOWED',
        message: 'Esta ação não é permitida agora.',
        details: { reason: 'noActionPoints' },
      },
    })
    const after = await get(party.id)
    expect(after.savedAt).toBe(last.savedAt)
    expect(after.members[0].player.zoneId).toBe(a)
  })

  it('REQ-56: zona fora do mapa vem antes de noActionPoints', async () => {
    const party = await startedParty()
    const a = party.members[0].player.moveTargets[0]
    for (const zoneId of [a, CITY, a]) {
      await act(party.id, { type: 'move', zoneId }).expect(200)
    }
    const response = await act(party.id, {
      type: 'move',
      zoneId: 'fixture.nowhere',
    })
    expect(response.status).toBe(400)
    expect(response.body.error.details).toEqual({
      fields: [{ field: 'zoneId', reason: 'zoneNotInMap' }],
    })
  })

  it('REQ-57: endTurn com 0 pontos passa a rodada, pontos cheios, grava; não acumulam', async () => {
    const party = await startedParty()
    const memberId = party.members[0].id
    const a = party.members[0].player.moveTargets[0]
    let last: TParty = party
    for (const zoneId of [a, CITY, a]) {
      last = (await act(party.id, { type: 'move', zoneId })).body
    }

    const ended = await act(party.id, { type: 'endTurn' })
    expect(ended.status).toBe(200)
    expect(ended.body.turn).toEqual({ round: 2, memberId, actionPoints: 3 })
    expect(ended.body.members[0].player.zoneId).toBe(a)
    expect(ended.body.members[0].player.availableActions).toEqual([
      'move',
      'endTurn',
    ])
    expect(Date.parse(ended.body.savedAt)).toBeGreaterThanOrEqual(
      Date.parse(last.savedAt)
    )
    expect(await get(party.id)).toEqual(ended.body)

    const again = await act(party.id, { type: 'endTurn' })
    expect(again.status).toBe(200)
    expect(again.body.turn).toEqual({ round: 3, memberId, actionPoints: 3 })
  })

  it('REQ-57: endTurn com campo a mais → 400 ACTION_INVALID unknownKey', async () => {
    const party = await startedParty()
    const response = await act(party.id, { type: 'endTurn', now: true })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        code: 'ACTION_INVALID',
        message: 'Ação inválida.',
        details: { fields: [{ field: 'now', reason: 'unknownKey' }] },
      },
    })
  })

  it('REQ-57/REQ-59: endTurn sem sessão → 409; continuar a sessão não muda turn', async () => {
    const party = await startedParty()
    await act(party.id, {
      type: 'move',
      zoneId: party.members[0].player.moveTargets[0],
    }).expect(200)
    const ended = await request(app.getHttpServer())
      .post(`/parties/${party.id}/session/end`)
      .expect(200)

    const response = await act(party.id, { type: 'endTurn' })
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('PARTY_SESSION_NOT_ACTIVE')

    const resumed = await request(app.getHttpServer())
      .post(`/parties/${party.id}/session`)
      .expect(200)
    expect(resumed.body.turn).toEqual(ended.body.turn)
    expect(resumed.body.turn.actionPoints).toBe(2)
  })

  it('REQ-54: pontos vêm da config copiada na criação, não do laboratório atual', async () => {
    const config = app.get(GameConfigRepository)
    const old = await startedParty()
    await config.save(
      GameConfig.create({ ...GAME_CONFIG_DEFAULTS, actionPointsPerTurn: 5 })
    )

    const created = (await postParty(app)) as unknown as TParty
    expect(created.turn.actionPoints).toBe(5)

    const ended = await act(old.id, { type: 'endTurn' })
    expect(ended.body.turn.actionPoints).toBe(3)
  })

  it('REQ-59/D-64: save v2 inserido à mão é lido como v3 e regravado como v3', async () => {
    const party = await startedParty()
    const db = app.get<Database>(DRIZZLE)
    const [row] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    const rest = { ...(row.state as Record<string, unknown>) }
    delete rest.turn
    await db
      .update(parties)
      .set({
        state: {
          ...rest,
          schemaVersion: 2,
          config: { ...GAME_CONFIG_DEFAULTS, actionPointsPerTurn: 4 },
        },
      })
      .where(eq(parties.id, party.id))

    const read = await get(party.id)
    expect(read.turn).toEqual({
      round: 1,
      memberId: party.members[0].id,
      actionPoints: 4,
    })

    await act(party.id, { type: 'endTurn' }).expect(200)
    const [saved] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    expect(saved.state).toMatchObject({
      schemaVersion: 3,
      turn: { round: 2, memberId: party.members[0].id, actionPoints: 4 },
    })
  })
})
