import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  CONTENT_INVALID,
  createContentApp,
  FORCA_INPUT,
} from '../../../../../test/content-app'

describe('GET /lab/content/collections/:collectionId/cards (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
    const server = ctx.app.getHttpServer()
    await request(server).post('/lab/content/collections').send(BOSQUE_INPUT)
    await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send({ ...FORCA_INPUT, slug: 'forca-bruta', name: 'Força Bruta' })
    await request(server).post('/lab/content/cards/bosque.forca-bruta/publish')
    await request(server).post(
      '/lab/content/cards/bosque.forca-bruta/duplicate'
    )
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-46: filtro status=draft lista só os rascunhos', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/bosque/cards?status=draft'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        id: 'bosque.forca-bruta-copia',
        type: 'attribute',
        name: 'Força Bruta',
        status: 'draft',
      },
    ])
  })

  it('REQ-46: busca q sem diferenciar maiúsculas e acentos, por id', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/bosque/cards?q=FORCA%20bruta'
    )

    expect(response.status).toBe(200)
    expect(response.body.map((card: { id: string }) => card.id)).toEqual([
      'bosque.forca-bruta',
      'bosque.forca-bruta-copia',
    ])
  })

  it('REQ-46: tipo desconhecido → 400 CONTENT_INVALID no parâmetro type (antes da coleção)', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/nope/cards?type=monster'
    )

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        ...CONTENT_INVALID,
        details: {
          fields: [{ path: 'type', message: 'Tipo de carta desconhecido.' }],
        },
      },
    })
  })

  it('REQ-46: filtros combinados com "e" (type e status)', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/bosque/cards?type=attribute&status=published'
    )

    expect(response.status).toBe(200)
    expect(response.body.map((card: { id: string }) => card.id)).toEqual([
      'bosque.forca-bruta',
    ])
  })

  it('REQ-46: status desconhecido → 400 CONTENT_INVALID "Situação desconhecida."', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/bosque/cards?status=archived'
    )

    expect(response.status).toBe(400)
    expect(response.body.error.details.fields).toEqual([
      { path: 'status', message: 'Situação desconhecida.' },
    ])
  })

  it('REQ-46: q repetido → 400 CONTENT_INVALID "Informe a busca uma vez só."', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/bosque/cards?q=a&q=b'
    )

    expect(response.status).toBe(400)
    expect(response.body.error.details.fields).toEqual([
      { path: 'q', message: 'Informe a busca uma vez só.' },
    ])
  })

  it('REQ-46: coleção inexistente → 404 COLLECTION_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/nope/cards'
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('COLLECTION_NOT_FOUND')
  })
})
