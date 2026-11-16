import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  CONTENT_INVALID,
  createContentApp,
} from '../../../../../test/content-app'

describe('PATCH /lab/content/collections/:collectionId (e2e)', () => {
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

  it('REQ-42: muda o nome e mantém o id', async () => {
    const response = await request(ctx.app.getHttpServer())
      .patch('/lab/content/collections/bosque')
      .send({ name: 'Bosque Antigo' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: 'bosque',
      name: 'Bosque Antigo',
      description: BOSQUE_INPUT.description,
    })
  })

  it('REQ-42: id no corpo → 400 CONTENT_INVALID "O identificador não pode mudar."', async () => {
    const response = await request(ctx.app.getHttpServer())
      .patch('/lab/content/collections/bosque')
      .send({ id: 'outro' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        ...CONTENT_INVALID,
        details: {
          fields: [{ path: 'id', message: 'O identificador não pode mudar.' }],
        },
      },
    })
  })

  it('REQ-42: coleção inexistente → 404 COLLECTION_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer())
      .patch('/lab/content/collections/nope')
      .send({ name: 'X' })

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('COLLECTION_NOT_FOUND')
  })
})
