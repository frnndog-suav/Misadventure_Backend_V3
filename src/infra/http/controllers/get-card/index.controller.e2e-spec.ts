import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'

describe('GET /catalog/cards/:cardId (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(false)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-14: carta existente responde 200 com a carta', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/cards/fixture.strength-basic'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      type: 'attribute',
      id: 'fixture.strength-basic',
      collectionId: 'fixture',
      name: 'Força',
      flavorText: null,
      rarity: 'common',
      attributeKind: 'basic',
      attributes: ['strength'],
      effects: [],
    })
  })

  it('REQ-14: carta inexistente responde 404 CARD_NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/cards/fixture.nope'
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: { code: 'CARD_NOT_FOUND', message: 'Carta não encontrada.' },
    })
  })
})
