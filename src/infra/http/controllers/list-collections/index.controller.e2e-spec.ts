import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'

describe('GET /catalog/collections (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(false)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-12: responde 200 com cada coleção e o total de cartas por tipo', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/collections'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        id: 'fixture',
        name: 'Coleção de Teste',
        cardCounts: {
          zone: 4,
          attribute: 3,
          equipment: 7,
          item: 7,
          randomEvent: 1,
          combatEvent: 1,
          zoneQuest: 0,
          dimension: 1,
        },
      },
    ])
  })
})
