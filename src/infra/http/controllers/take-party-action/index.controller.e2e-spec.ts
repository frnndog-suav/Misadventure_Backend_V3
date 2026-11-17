import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'
import {
  PARTY_NOT_FOUND,
  postParty,
  resetCampaign,
} from '../../../../../test/parties-e2e'

type TParty = {
  savedAt: string
  dimension: { map: { crossings: { zoneIds: [string, string] }[] } }
  members: { player: { zoneId: string; moveTargets: string[] } }[]
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
})
