import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'

describe('POST /lab/content/collections/:collectionId/validate-dimension (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-47: a fixture não tem zona Urbana publicada → valid false com o problema', async () => {
    const response = await request(ctx.app.getHttpServer()).post(
      '/lab/content/collections/fixture/validate-dimension'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      valid: false,
      problems: ['A coleção precisa de pelo menos 1 zona Urbana publicada.'],
    })
  })

  it('REQ-47: coleção inexistente → 404 COLLECTION_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer()).post(
      '/lab/content/collections/nope/validate-dimension'
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('COLLECTION_NOT_FOUND')
  })
})
