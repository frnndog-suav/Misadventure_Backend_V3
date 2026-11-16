import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'
import {
  PARTY_NOT_FOUND,
  postParty,
  resetCampaign,
} from '../../../../../test/parties-e2e'

describe('GET /parties/:partyId (e2e)', () => {
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

  it('REQ-19: devolve o mesmo Party da criação', async () => {
    const created = await postParty(app)

    const response = await request(app.getHttpServer()).get(
      `/parties/${created.id}`
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual(created)
  })

  it('REQ-19: inexistente (uuid ou não) → 404 PARTY_NOT_FOUND', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
      const response = await request(app.getHttpServer()).get(`/parties/${id}`)

      expect(response.status).toBe(404)
      expect(response.body).toEqual(PARTY_NOT_FOUND)
    }
  })
})
