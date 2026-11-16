import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'
import {
  PARTY_NOT_FOUND,
  postParty,
  resetCampaign,
} from '../../../../../test/parties-e2e'

describe('DELETE /parties/:partyId (e2e)', () => {
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

  it('REQ-24: apaga o save (idle ou inSession) → 204 sem corpo; depois 404', async () => {
    const idle = await postParty(app)
    const inSession = await postParty(app, { name: 'B', characterName: 'Bo' })
    await request(app.getHttpServer())
      .post(`/parties/${inSession.id}/session`)
      .expect(200)

    for (const party of [idle, inSession]) {
      const response = await request(app.getHttpServer()).delete(
        `/parties/${party.id}`
      )
      expect(response.status).toBe(204)
      expect(response.text).toBe('')

      const read = await request(app.getHttpServer()).get(
        `/parties/${party.id}`
      )
      expect(read.status).toBe(404)
      expect(read.body).toEqual(PARTY_NOT_FOUND)
    }

    const list = await request(app.getHttpServer()).get('/parties')
    expect(list.body).toEqual([])
  })

  it('REQ-24: inexistente → 404 PARTY_NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).delete(
      '/parties/00000000-0000-4000-8000-000000000000'
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual(PARTY_NOT_FOUND)
  })
})
