import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'

describe('GET /catalog/classes (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(false)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-27: responde 200 com as classes publicadas em ordem de playerClass', async () => {
    const response = await request(app.getHttpServer()).get('/catalog/classes')

    expect(response.status).toBe(200)
    expect(
      response.body.map((c: { playerClass: string }) => c.playerClass)
    ).toEqual(['rogue', 'warrior'])
    expect(response.body[1]).toEqual({
      playerClass: 'warrior',
      collectionId: 'fixture',
      name: 'Guerreiro',
      essentialAttributes: ['strength', 'endurance'],
      baseModifiers: {
        attack: 6,
        defense: 5,
        accuracy: 45,
        evasion: 15,
        celerity: 8,
        piercing: 0,
        reflection: 0,
      },
      starterDeck: [
        { cardId: 'fixture.endurance-basic', copies: 30 },
        { cardId: 'fixture.strength-basic', copies: 30 },
      ],
    })
  })
})
