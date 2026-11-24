import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { createApp } from '../../../../../test/lab-app'

/** REQ-146 de ponta a ponta (CONTRATO, FEAT-17: cenário Laboratório). */
describe('Chaves do ferreiro no laboratório (e2e)', () => {
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

  it('REQ-146: GET inclui refineGoldPerLevel 10 e defaults.artificerMaxRefineLevel 6', async () => {
    const response = await request(app.getHttpServer())
      .get('/lab/config')
      .expect(200)
    expect(response.body.values.refineGoldPerLevel).toBe(10)
    expect(response.body.defaults.artificerMaxRefineLevel).toBe(6)
  })

  it('REQ-146: PATCH refineThreshold10 22 → 400 outOfRange, nada muda', async () => {
    const server = app.getHttpServer()
    const before = await request(server).get('/lab/config').expect(200)

    const response = await request(server)
      .patch('/lab/config')
      .send({ refineThreshold10: 22 })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        code: 'LAB_CONFIG_INVALID',
        message: 'Configuração do laboratório inválida.',
        details: {
          fields: [{ field: 'refineThreshold10', reason: 'outOfRange' }],
        },
      },
    })

    const after = await request(server).get('/lab/config').expect(200)
    expect(after.body).toEqual(before.body)
  })

  it('REQ-146: PATCH aceito altera o valor e mantém o padrão', async () => {
    const server = app.getHttpServer()
    const patched = await request(server)
      .patch('/lab/config')
      .send({ refineBreakFromLevel: 11 })
      .expect(200)
    expect(patched.body.values.refineBreakFromLevel).toBe(11)
    expect(patched.body.defaults.refineBreakFromLevel).toBe(7)
  })
})
