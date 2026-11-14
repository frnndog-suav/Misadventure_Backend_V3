import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'

const DEFAULTS = {
  minPlayers: 1,
  maxPlayers: 6,
  actionPointsPerTurn: 3,
  initialPeak: 10,
  initialVigor: 10,
  baseHealth: 20,
  initialGold: 10,
  initialHandSize: 7,
}

const LIMITS = {
  minPlayers: { min: 1, max: 6 },
  maxPlayers: { min: 1, max: 6 },
  actionPointsPerTurn: { min: 1, max: 10 },
  initialPeak: { min: 1, max: 1000 },
  initialVigor: { min: 0, max: 1000 },
  baseHealth: { min: 1, max: 1000 },
  initialGold: { min: 0, max: 100000 },
  initialHandSize: { min: 0, max: 60 },
}

describe('GET /lab/config (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-04: sem ajuste salvo, responde 200 com padrões e limites do contrato', async () => {
    const response = await request(app.getHttpServer()).get('/lab/config')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      values: DEFAULTS,
      defaults: DEFAULTS,
      limits: LIMITS,
    })
  })
})
