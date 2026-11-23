import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  createContentApp,
  FORCA_INPUT,
} from '../../../../../test/content-app'

describe('GET /lab/content/collections/:collectionId/export (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
    const server = ctx.app.getHttpServer()
    await request(server).post('/lab/content/collections').send(BOSQUE_INPUT)
    await request(server)
      .patch('/lab/content/collections/bosque')
      .send({ name: 'Bosque Antigo' })
    await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send({ ...FORCA_INPUT, slug: 'forca-bruta' })
    await request(server).post('/lab/content/cards/bosque.forca-bruta/publish')
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-48: devolve o arquivo com a coleção, as cartas com status e classes vazias', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/bosque/export'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      formatVersion: 1,
      collection: {
        id: 'bosque',
        name: 'Bosque Antigo',
        description: 'Coleção de teste do editor.',
      },
      cards: [
        {
          status: 'published',
          card: {
            type: 'attribute',
            id: 'bosque.forca-bruta',
            collectionId: 'bosque',
            name: 'Força',
            flavorText: null,
            rarity: 'common',
            attributeKind: 'basic',
            attributes: ['strength'],
            effects: [],
            priceMultiplier: 1,
          },
        },
      ],
      classes: [],
    })
  })

  it('REQ-48: coleção inexistente → 404 COLLECTION_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/nope/export'
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('COLLECTION_NOT_FOUND')
  })
})
