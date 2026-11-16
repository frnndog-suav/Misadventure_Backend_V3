import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'

describe('DELETE /lab/content/cards/:cardId (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-45: apaga a carta (204); some do editor e do catálogo', async () => {
    const server = ctx.app.getHttpServer()
    const response = await request(server).delete(
      '/lab/content/cards/fixture.strength-basic'
    )

    expect(response.status).toBe(204)
    expect(
      (await request(server).get('/lab/content/cards/fixture.strength-basic'))
        .status
    ).toBe(404)
    expect(
      (await request(server).get('/catalog/cards/fixture.strength-basic'))
        .status
    ).toBe(404)
  })

  it('REQ-45: carta inexistente → 404 CARD_NOT_FOUND', async () => {
    const response = await request(ctx.app.getHttpServer()).delete(
      '/lab/content/cards/fixture.nope'
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('CARD_NOT_FOUND')
  })
})
