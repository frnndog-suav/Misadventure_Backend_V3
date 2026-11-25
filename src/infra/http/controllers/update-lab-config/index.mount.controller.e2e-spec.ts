import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { createApp } from '../../../../../test/lab-app'

/** REQ-156 de ponta a ponta (CONTRATO, FEAT-18: cenário Laboratório). */
describe('Chaves da montaria no laboratório (e2e)', () => {
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

  it('REQ-156: GET inclui values.mountPriceRare 280 e defaults.mountFolderCapacity 10', async () => {
    const response = await request(app.getHttpServer())
      .get('/lab/config')
      .expect(200)
    expect(response.body.values.mountPriceRare).toBe(280)
    expect(response.body.defaults.mountFolderCapacity).toBe(10)
  })

  it('REQ-156: PATCH mountInventorySlots 101 → 400 outOfRange, nada muda', async () => {
    const server = app.getHttpServer()
    const before = await request(server).get('/lab/config').expect(200)

    const response = await request(server)
      .patch('/lab/config')
      .send({ mountInventorySlots: 101 })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        code: 'LAB_CONFIG_INVALID',
        message: 'Configuração do laboratório inválida.',
        details: {
          fields: [{ field: 'mountInventorySlots', reason: 'outOfRange' }],
        },
      },
    })

    const after = await request(server).get('/lab/config').expect(200)
    expect(after.body).toEqual(before.body)
  })
})
