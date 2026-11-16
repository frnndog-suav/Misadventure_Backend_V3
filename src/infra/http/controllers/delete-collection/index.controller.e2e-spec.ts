import { access } from 'node:fs/promises'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  createContentApp,
  FORCA_INPUT,
} from '../../../../../test/content-app'

describe('DELETE /lab/content/collections/:collectionId (e2e)', () => {
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

  it('REQ-42: apaga a coleção e as cartas (204) no editor e no disco', async () => {
    const server = ctx.app.getHttpServer()
    const response = await request(server).delete(
      '/lab/content/collections/bosque'
    )

    expect(response.status).toBe(204)
    expect(
      (await request(server).get('/lab/content/collections/bosque')).status
    ).toBe(404)
    expect(
      (await request(server).get('/lab/content/cards/bosque.forca')).status
    ).toBe(404)
    await expect(access(join(ctx.root, 'bosque'))).rejects.toThrow()
    const catalog = await request(server).get('/catalog/collections')
    expect(catalog.body.map((c: { id: string }) => c.id)).toEqual(['fixture'])
  })

  it('REQ-42: coleção inexistente → 404 COLLECTION_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer()).delete(
      '/lab/content/collections/nope'
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('COLLECTION_NOT_FOUND')
  })
})
