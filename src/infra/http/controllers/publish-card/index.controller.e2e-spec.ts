import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  createContentApp,
  FORCA_INPUT,
} from '../../../../../test/content-app'

describe('POST /lab/content/cards/:cardId/publish (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
    const server = ctx.app.getHttpServer()
    await request(server).post('/lab/content/collections').send(BOSQUE_INPUT)
    await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send(FORCA_INPUT)
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-45: publica o rascunho (200) e ele entra no catálogo', async () => {
    const server = ctx.app.getHttpServer()
    const response = await request(server).post(
      '/lab/content/cards/bosque.forca/publish'
    )

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('published')
    expect(response.body.card.id).toBe('bosque.forca')
    expect(
      (await request(server).get('/catalog/cards/bosque.forca')).status
    ).toBe(200)
  })

  it('REQ-45: publicar de novo → 200 sem mudança', async () => {
    const response = await request(ctx.app.getHttpServer()).post(
      '/lab/content/cards/bosque.forca/publish'
    )

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('published')
  })

  it('REQ-45/D-50: publicar a cópia de uma zona com título repetido → 400 CONTENT_INVALID em title', async () => {
    const server = ctx.app.getHttpServer()
    const copy = await request(server).post(
      '/lab/content/cards/fixture.whispering-grove/duplicate'
    )
    const response = await request(server).post(
      `/lab/content/cards/${copy.body.card.id as string}/publish`
    )

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CONTENT_INVALID')
    expect(response.body.error.details.fields).toEqual([
      { path: 'title', message: 'Título repetido na coleção.' },
    ])
  })

  it('REQ-45: carta inexistente → 404 CARD_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer()).post(
      '/lab/content/cards/bosque.nope/publish'
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('CARD_NOT_FOUND')
  })
})
