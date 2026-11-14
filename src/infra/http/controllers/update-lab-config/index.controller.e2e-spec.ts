import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
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

function invalid(fields: { field: string | null; reason: string }[]) {
  return {
    error: {
      code: 'LAB_CONFIG_INVALID',
      message: 'Configuração do laboratório inválida.',
      details: { fields },
    },
  }
}

describe('PATCH /lab/config (e2e)', () => {
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

  it('REQ-05: ajuste parcial responde 200, persiste e sobrevive a um reinício', async () => {
    const response = await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ actionPointsPerTurn: 4 })

    expect(response.status).toBe(200)
    expect(response.body.values).toEqual({
      ...DEFAULTS,
      actionPointsPerTurn: 4,
    })
    expect(response.body.defaults).toEqual(DEFAULTS)

    const read = await request(app.getHttpServer()).get('/lab/config')
    expect(read.body.values).toEqual(response.body.values)

    await app.close()
    app = await createApp(true)
    const afterRestart = await request(app.getHttpServer()).get('/lab/config')
    expect(afterRestart.body.values).toEqual(response.body.values)
  })

  it('REQ-05: {} é aceito e não muda nada', async () => {
    const response = await request(app.getHttpServer())
      .patch('/lab/config')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.values).toEqual(DEFAULTS)
  })

  it('REQ-06: chave fora dos limites e chave desconhecida → 400 e nada é salvo', async () => {
    const response = await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ actionPointsPerTurn: 0, foo: 1 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([
        { field: 'actionPointsPerTurn', reason: 'outOfRange' },
        { field: 'foo', reason: 'unknownKey' },
      ])
    )
    const read = await request(app.getHttpServer()).get('/lab/config')
    expect(read.body.values).toEqual(DEFAULTS)
  })

  it('REQ-06: minPlayers > maxPlayers → 400 minAboveMax nas duas chaves', async () => {
    const response = await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ minPlayers: 5, maxPlayers: 3 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([
        { field: 'minPlayers', reason: 'minAboveMax' },
        { field: 'maxPlayers', reason: 'minAboveMax' },
      ])
    )
  })

  it('REQ-06: valor não inteiro → 400 notInteger', async () => {
    const response = await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ initialGold: 2.5 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([{ field: 'initialGold', reason: 'notInteger' }])
    )
  })

  it('REQ-06: corpo que não é objeto JSON ou está malformado → 400 invalidBody', async () => {
    const asArray = await request(app.getHttpServer())
      .patch('/lab/config')
      .send([1])
    const malformed = await request(app.getHttpServer())
      .patch('/lab/config')
      .set('Content-Type', 'application/json')
      .send('{"actionPointsPerTurn":')

    for (const response of [asArray, malformed]) {
      expect(response.status).toBe(400)
      expect(response.body).toEqual(
        invalid([{ field: null, reason: 'invalidBody' }])
      )
    }
  })
})
