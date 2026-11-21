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
  maxCopiesPerCard: 4,
  tcgFolderCapacity: 30,
  recoverHealthPercent: 15,
  recoverVigorPercent: 5,
  recoverHandSize: 7,
  inventoryCapacity: 10,
  purseCapacity: 300,
  vaultCapacity: 30,
  vaultDeckSlots: 10,
  vaultGoldCapacity: 2000,
  escapeVigorPercent: 20,
  knockoutHealthPercent: 10,
  knockoutPeakLossPercent: 10,
  knockoutVigorCapPercent: 50,
  soloKnockoutGoldLossPercent: 10,
  soloKnockoutWaitRounds: 1,
  reserveDeck: [{ type: 'gold', amount: 1, weight: 1 }],
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
  maxCopiesPerCard: { min: 1, max: 200 },
  tcgFolderCapacity: { min: 0, max: 1000 },
  recoverHealthPercent: { min: 0, max: 100 },
  recoverVigorPercent: { min: 0, max: 100 },
  recoverHandSize: { min: 0, max: 200 },
  inventoryCapacity: { min: 0, max: 100 },
  purseCapacity: { min: 0, max: 1000000 },
  vaultCapacity: { min: 0, max: 1000 },
  vaultDeckSlots: { min: 1, max: 100 },
  vaultGoldCapacity: { min: 0, max: 10000000 },
  escapeVigorPercent: { min: 0, max: 100 },
  knockoutHealthPercent: { min: 1, max: 100 },
  knockoutPeakLossPercent: { min: 0, max: 100 },
  knockoutVigorCapPercent: { min: 0, max: 100 },
  soloKnockoutGoldLossPercent: { min: 0, max: 100 },
  soloKnockoutWaitRounds: { min: 0, max: 10 },
  reserveDeck: { minEntries: 1, minWeight: 1 },
}

describe('GET /lab/config (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-04, REQ-29, REQ-60, REQ-130: responde 200 com padrões e limites do contrato', async () => {
    const response = await request(app.getHttpServer()).get('/lab/config')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      values: DEFAULTS,
      defaults: DEFAULTS,
      limits: LIMITS,
    })
  })
})
