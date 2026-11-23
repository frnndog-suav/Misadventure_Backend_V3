import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'

describe('POST /lab/content/cards/:cardId/duplicate (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-45: cria um rascunho igual com slug <slug>-copia (201)', async () => {
    const response = await request(ctx.app.getHttpServer()).post(
      '/lab/content/cards/fixture.strength-basic/duplicate'
    )

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      status: 'draft',
      card: {
        type: 'attribute',
        id: 'fixture.strength-basic-copia',
        collectionId: 'fixture',
        name: 'Força',
        flavorText: null,
        rarity: 'common',
        attributeKind: 'basic',
        attributes: ['strength'],
        effects: [],
        priceMultiplier: 1,
      },
    })
  })

  it('REQ-45: duplicar de novo usa -copia-2', async () => {
    const response = await request(ctx.app.getHttpServer()).post(
      '/lab/content/cards/fixture.strength-basic/duplicate'
    )

    expect(response.status).toBe(201)
    expect(response.body.card.id).toBe('fixture.strength-basic-copia-2')
  })

  it('REQ-45: carta inexistente → 404 CARD_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer()).post(
      '/lab/content/cards/fixture.nope/duplicate'
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('CARD_NOT_FOUND')
  })
})
