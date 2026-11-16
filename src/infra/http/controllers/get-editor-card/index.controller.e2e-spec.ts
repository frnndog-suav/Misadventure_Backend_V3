import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'

describe('GET /lab/content/cards/:cardId (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-44: devolve a carta com o status', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/cards/fixture.strength-basic'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'published',
      card: {
        type: 'attribute',
        id: 'fixture.strength-basic',
        collectionId: 'fixture',
        name: 'Força',
        flavorText: null,
        rarity: 'common',
        attributeKind: 'basic',
        attributes: ['strength'],
        effects: [],
      },
    })
  })

  it('REQ-44: carta inexistente → 404 CARD_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/cards/fixture.nope'
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('CARD_NOT_FOUND')
  })
})
