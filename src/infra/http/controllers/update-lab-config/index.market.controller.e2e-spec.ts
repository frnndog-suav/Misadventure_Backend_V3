import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { createApp } from '../../../../../test/lab-app'

function invalid(fields: { field: string | null; reason: string }[]) {
  return {
    error: {
      code: 'LAB_CONFIG_INVALID',
      message: 'Configuração do laboratório inválida.',
      details: { fields },
    },
  }
}

/** REQ-137 de ponta a ponta (CONTRATO, FEAT-16: cenário Laboratório). */
describe('Chaves do mercado no laboratório (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  beforeEach(async () => {
    await app.get(GameConfigRepository).delete()
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-137: GET traz boosterPrice 30 e singlesPoolSize 20', async () => {
    const response = await request(app.getHttpServer())
      .get('/lab/config')
      .expect(200)
    expect(response.body.values.boosterPrice).toBe(30)
    expect(response.body.defaults.singlesPoolSize).toBe(20)
  })

  it('REQ-137: chances do booster que não somam 1000 → 400 sumMismatch nas 5 chaves, nada muda', async () => {
    const server = app.getHttpServer()
    const before = await request(server).get('/lab/config').expect(200)

    const response = await request(server)
      .patch('/lab/config')
      .send({ boosterChanceCommon: 700 })
    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([
        { field: 'boosterChanceCommon', reason: 'sumMismatch' },
        { field: 'boosterChanceUncommon', reason: 'sumMismatch' },
        { field: 'boosterChanceRare', reason: 'sumMismatch' },
        { field: 'boosterChanceEpic', reason: 'sumMismatch' },
        { field: 'boosterChanceLegendary', reason: 'sumMismatch' },
      ])
    )

    const after = await request(server).get('/lab/config').expect(200)
    expect(after.body).toEqual(before.body)
  })

  it('REQ-137: marketFactorMinPercent > marketFactorMaxPercent → 400 minAboveMax nas duas chaves, nada muda', async () => {
    const server = app.getHttpServer()
    const before = await request(server).get('/lab/config').expect(200)

    const response = await request(server)
      .patch('/lab/config')
      .send({ marketFactorMinPercent: 130 })
    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([
        { field: 'marketFactorMinPercent', reason: 'minAboveMax' },
        { field: 'marketFactorMaxPercent', reason: 'minAboveMax' },
      ])
    )

    const after = await request(server).get('/lab/config').expect(200)
    expect(after.body).toEqual(before.body)
  })
})
