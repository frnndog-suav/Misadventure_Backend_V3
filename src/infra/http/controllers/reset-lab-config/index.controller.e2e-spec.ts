import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'

describe('POST /lab/config/reset (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-07: com ajuste salvo, responde 200 com values igual a defaults e o GET seguinte também', async () => {
    await request(app.getHttpServer())
      .patch('/lab/config')
      .send({
        actionPointsPerTurn: 4,
        questBoardSize: 4,
        escapeVigorPercent: 100,
        reserveDeck: [{ type: 'gold', amount: 5, weight: 3 }],
      })
      .expect(200)

    const response = await request(app.getHttpServer()).post(
      '/lab/config/reset'
    )

    expect(response.status).toBe(200)
    expect(response.body.values).toEqual(response.body.defaults)
    expect(response.body.values.actionPointsPerTurn).toBe(3)
    expect(response.body.values.questBoardSize).toBe(3)
    expect(response.body.defaults.escapeVigorPercent).toBe(20)
    expect(response.body.limits.escapeVigorPercent).toEqual({
      min: 0,
      max: 100,
    })
    expect(response.body.limits.reserveDeck).toEqual({
      minEntries: 1,
      minWeight: 1,
    })
    const read = await request(app.getHttpServer()).get('/lab/config')
    expect(read.body.values).toEqual(response.body.defaults)
  })
})
