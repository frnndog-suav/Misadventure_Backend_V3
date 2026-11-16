import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'
import {
  ISO_UTC,
  postParty,
  resetCampaign,
} from '../../../../../test/parties-e2e'

describe('GET /parties (e2e)', () => {
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

  it('REQ-18: sem saves → []', async () => {
    const response = await request(app.getHttpServer()).get('/parties')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('REQ-18: resumo de cada save, do savedAt mais recente para o mais antigo', async () => {
    const first = await postParty(app)
    const second = await postParty(app, { name: 'Outro', characterName: 'Bo' })
    // Continuar o primeiro atualiza o savedAt: ele passa para o topo.
    // A espera garante um instante diferente do relógio real.
    await new Promise((resolve) => setTimeout(resolve, 5))
    await request(app.getHttpServer())
      .post(`/parties/${first.id}/session`)
      .expect(200)

    const response = await request(app.getHttpServer()).get('/parties')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        id: first.id,
        name: 'Os Teimosos',
        status: 'inSession',
        characterNames: ['Lia'],
        createdAt: first.createdAt,
        savedAt: expect.stringMatching(ISO_UTC),
      },
      {
        id: second.id,
        name: 'Outro',
        status: 'idle',
        characterNames: ['Bo'],
        createdAt: second.createdAt,
        savedAt: second.savedAt,
      },
    ])
  })
})
