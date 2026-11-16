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
  minDeckSize: 60,
  lockOneEssential: 18,
  lockTwoEssentials: 10,
  mapMaxAttempts: 1000,
  defaultAttack: 5,
  defaultDefense: 3,
  defaultAccuracy: 50,
  defaultEvasion: 20,
  defaultCelerity: 10,
  defaultPiercing: 0,
  defaultReflection: 0,
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
  minDeckSize: { min: 1, max: 200 },
  lockOneEssential: { min: 0, max: 200 },
  lockTwoEssentials: { min: 0, max: 200 },
  mapMaxAttempts: { min: 1, max: 100000 },
  defaultAttack: { min: 0, max: 1000 },
  defaultDefense: { min: 0, max: 1000 },
  defaultAccuracy: { min: 0, max: 1000 },
  defaultEvasion: { min: 0, max: 1000 },
  defaultCelerity: { min: 0, max: 1000 },
  defaultPiercing: { min: 0, max: 1000 },
  defaultReflection: { min: 0, max: 1000 },
}

describe('GET /lab/config (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-04, REQ-29: sem ajuste salvo, responde 200 com padrões e limites do contrato', async () => {
    const response = await request(app.getHttpServer()).get('/lab/config')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      values: DEFAULTS,
      defaults: DEFAULTS,
      limits: LIMITS,
    })
  })
})
