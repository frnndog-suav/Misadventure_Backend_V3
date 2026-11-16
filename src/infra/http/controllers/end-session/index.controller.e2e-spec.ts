import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'
import {
  ISO_UTC,
  PARTY_NOT_FOUND,
  postParty,
  resetCampaign,
} from '../../../../../test/parties-e2e'

const SESSION_NOT_ACTIVE = {
  error: {
    code: 'PARTY_SESSION_NOT_ACTIVE',
    message: 'Não há sessão em andamento neste grupo.',
  },
}

describe('POST /parties/:partyId/session/end (e2e)', () => {
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

  it('REQ-21: inSession → idle com savedAt novo, gravado; repetir → 409', async () => {
    const created = await postParty(app)
    const started = await request(app.getHttpServer())
      .post(`/parties/${created.id}/session`)
      .expect(200)

    const ended = await request(app.getHttpServer()).post(
      `/parties/${created.id}/session/end`
    )

    expect(ended.status).toBe(200)
    expect(ended.body).toEqual({
      ...created,
      status: 'idle',
      savedAt: expect.stringMatching(ISO_UTC),
    })
    expect(Date.parse(ended.body.savedAt)).toBeGreaterThanOrEqual(
      Date.parse(started.body.savedAt)
    )
    const read = await request(app.getHttpServer()).get(
      `/parties/${created.id}`
    )
    expect(read.body).toEqual(ended.body)

    const again = await request(app.getHttpServer()).post(
      `/parties/${created.id}/session/end`
    )
    expect(again.status).toBe(409)
    expect(again.body).toEqual(SESSION_NOT_ACTIVE)
    const unchanged = await request(app.getHttpServer()).get(
      `/parties/${created.id}`
    )
    expect(unchanged.body).toEqual(ended.body)
  })

  it('REQ-21: inexistente → 404 PARTY_NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).post(
      '/parties/00000000-0000-4000-8000-000000000000/session/end'
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual(PARTY_NOT_FOUND)
  })
})
