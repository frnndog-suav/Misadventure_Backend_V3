import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  createContentApp,
  FORCA_INPUT,
} from '../../../../../test/content-app'

describe('PUT /lab/content/cards/:cardId (e2e)', () => {
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

  it('REQ-44: rascunho com outro slug é renomeado; o id antigo deixa de existir', async () => {
    const server = ctx.app.getHttpServer()
    const response = await request(server)
      .put('/lab/content/cards/bosque.forca')
      .send({ ...FORCA_INPUT, slug: 'forca-bruta' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('draft')
    expect(response.body.card.id).toBe('bosque.forca-bruta')
    const old = await request(server).get('/lab/content/cards/bosque.forca')
    expect(old.status).toBe(404)
    expect(old.body.error.code).toBe('CARD_NOT_FOUND')
  })

  it('REQ-44: publicada com outro slug → 409 CONTENT_LOCKED; com o mesmo slug grava e continua publicada', async () => {
    const server = ctx.app.getHttpServer()
    await request(server).post('/lab/content/cards/bosque.forca-bruta/publish')

    const locked = await request(server)
      .put('/lab/content/cards/bosque.forca-bruta')
      .send({ ...FORCA_INPUT, slug: 'outra' })
    expect(locked.status).toBe(409)
    expect(locked.body).toEqual({
      error: {
        code: 'CONTENT_LOCKED',
        message: 'O identificador de uma carta publicada não pode mudar.',
      },
    })

    const edited = await request(server)
      .put('/lab/content/cards/bosque.forca-bruta')
      .send({ ...FORCA_INPUT, slug: 'forca-bruta', name: 'Força Bruta' })
    expect(edited.status).toBe(200)
    expect(edited.body.status).toBe('published')
    const catalog = await request(server).get(
      '/catalog/cards/bosque.forca-bruta'
    )
    expect(catalog.body.name).toBe('Força Bruta')
  })

  it('REQ-43: corpo inválido no PUT → 400 CONTENT_INVALID', async () => {
    const response = await request(ctx.app.getHttpServer())
      .put('/lab/content/cards/bosque.forca-bruta')
      .send({ ...FORCA_INPUT, slug: 'forca-bruta', attributes: [] })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CONTENT_INVALID')
  })

  it('REQ-43: renomear rascunho para um id ocupado → 409 CONTENT_ID_TAKEN em slug', async () => {
    const server = ctx.app.getHttpServer()
    await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send({ ...FORCA_INPUT, slug: 'rascunho' })

    const response = await request(server)
      .put('/lab/content/cards/bosque.rascunho')
      .send({ ...FORCA_INPUT, slug: 'forca-bruta' })

    expect(response.status).toBe(409)
    expect(response.body.error.details.fields).toEqual([
      { path: 'slug', message: 'Já existe uma carta com este identificador.' },
    ])
  })

  it('REQ-44: carta inexistente → 404 CARD_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer())
      .put('/lab/content/cards/bosque.nope')
      .send(FORCA_INPUT)

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('CARD_NOT_FOUND')
  })
})
