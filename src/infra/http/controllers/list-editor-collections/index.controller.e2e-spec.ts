import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'

describe('GET /lab/content/collections (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-42: lista as coleções com as contagens de publicadas e rascunhos, por id', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        id: 'fixture',
        name: 'Coleção de Teste',
        description: '',
        publishedCount: 20,
        draftCount: 0,
      },
    ])
  })
})
