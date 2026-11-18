import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  CONTENT_INVALID,
  createContentApp,
  FORCA_INPUT,
} from '../../../../../test/content-app'

describe('POST /lab/content/collections/:collectionId/cards (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
    await request(ctx.app.getHttpServer())
      .post('/lab/content/collections')
      .send(BOSQUE_INPUT)
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-44: cria a carta como rascunho (201), fora do catálogo', async () => {
    const server = ctx.app.getHttpServer()
    const response = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send(FORCA_INPUT)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      status: 'draft',
      card: {
        type: 'attribute',
        id: 'bosque.forca',
        collectionId: 'bosque',
        name: 'Força',
        flavorText: null,
        rarity: 'common',
        attributeKind: 'basic',
        attributes: ['strength'],
        effects: [],
      },
    })
    const catalog = await request(server).get(
      '/catalog/collections/bosque/cards'
    )
    expect(catalog.status).toBe(200)
    expect(catalog.body).toEqual([])
  })

  it('REQ-38/REQ-26: cria Carta de Dimensão e zona com arrowLayout pelo editor; releaseOrder repetido no catálogo → 400', async () => {
    const server = ctx.app.getHttpServer()
    const dimension = {
      slug: 'bosque-dimensao',
      type: 'dimension',
      name: 'Dimensão do Bosque',
      flavorText: null,
      releaseOrder: 2,
      arrivalZoneTitle: null,
      effects: [],
      rewardDecks: [],
    }
    const created = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send(dimension)
    expect(created.status).toBe(201)
    expect(created.body.card).toMatchObject({
      type: 'dimension',
      id: 'bosque.bosque-dimensao',
      releaseOrder: 2,
    })

    const zone = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send({
        slug: 'trilha',
        type: 'zone',
        title: 'Trilha',
        zoneType: 'forest',
        location: 'Bosque',
        connectionArrows: 2,
        arrowLayout: 'corner',
        zoneActions: ['startEvent'],
        effects: [],
      })
    expect(zone.status).toBe(201)
    expect(zone.body.card.arrowLayout).toBe('corner')

    // `releaseOrder: 1` já é da fixture.test-dimension.
    const repeated = await request(server)
      .put('/lab/content/cards/bosque.bosque-dimensao')
      .send({ ...dimension, releaseOrder: 1 })
    expect(repeated.status).toBe(400)
    expect(
      repeated.body.error.details.fields.map((f: { path: string }) => f.path)
    ).toContain('releaseOrder')
  })

  it('REQ-43: carta básica com 2 atributos → 400 CONTENT_INVALID no campo attributes', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections/bosque/cards')
      .send({
        ...FORCA_INPUT,
        slug: 'forca-sorte',
        attributes: ['strength', 'luck'],
      })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        ...CONTENT_INVALID,
        details: {
          fields: [
            {
              path: 'attributes',
              message: 'Carta básica tem exatamente 1 atributo.',
            },
          ],
        },
      },
    })
  })

  it('REQ-43: id de carta já usado → 409 CONTENT_ID_TAKEN no campo slug', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections/bosque/cards')
      .send(FORCA_INPUT)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'CONTENT_ID_TAKEN',
        message: 'Este identificador já está em uso.',
        details: {
          fields: [
            {
              path: 'slug',
              message: 'Já existe uma carta com este identificador.',
            },
          ],
        },
      },
    })
  })

  it('REQ-44: coleção inexistente → 404 COLLECTION_NOT_FOUND (antes do corpo)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections/nope/cards')
      .send({})

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('COLLECTION_NOT_FOUND')
  })
})
