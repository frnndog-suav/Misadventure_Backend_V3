import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'

describe('GET /lab/content/collections/:collectionId (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-42: devolve a coleção com contagens por tipo e raridade e as etiquetas', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/fixture'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      id: 'fixture',
      name: 'Coleção de Teste',
      description: '',
      publishedCount: 12,
      draftCount: 0,
      cardCounts: {
        zone: 4,
        attribute: 3,
        equipment: 1,
        item: 1,
        randomEvent: 1,
        combatEvent: 1,
        dimension: 1,
      },
      rarityCounts: { common: 4, uncommon: 0, rare: 1, epic: 0, legendary: 0 },
      tags: ['duas mãos', 'espada', 'poção'],
    })
  })

  it('REQ-42: coleção inexistente → 404 COLLECTION_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer()).get(
      '/lab/content/collections/nope'
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: {
        code: 'COLLECTION_NOT_FOUND',
        message: 'Coleção não encontrada.',
      },
    })
  })
})
