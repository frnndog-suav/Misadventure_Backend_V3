import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createContentApp } from '../../../../../test/content-app'

/** REQ-136 de ponta a ponta (CONTRATO, FEAT-16: cenários Editor e fixture). */
describe('Mercado no catálogo e no editor (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>
  let server: ReturnType<typeof ctx.app.getHttpServer>

  beforeAll(async () => {
    ctx = await createContentApp()
    server = ctx.app.getHttpServer()
  })

  afterAll(async () => {
    await ctx.close()
  })

  /** Corpo de PUT a partir da carta atual do editor. */
  async function inputOf(cardId: string): Promise<Record<string, unknown>> {
    const response = await request(server)
      .get(`/lab/content/cards/${cardId}`)
      .expect(200)
    const card = response.body.card as Record<string, unknown> & {
      id: string
      collectionId: string
    }
    const { id, collectionId, ...rest } = card
    return { ...rest, slug: id.slice(collectionId.length + 1) }
  }

  it('REQ-136: o catálogo traz os campos novos da fixture e os valores legados', async () => {
    const card = async (id: string) =>
      (await request(server).get(`/catalog/cards/${id}`).expect(200)).body

    const harbor = await card('fixture.gray-harbor')
    expect(harbor.zoneActions).toContain('visitMarket')
    expect(harbor.market).toEqual({
      stock: [
        'fixture.healing-potion',
        'fixture.arrows',
        'fixture.fishing-rod',
      ],
      singles: true,
      mounts: [],
    })

    expect((await card('fixture.healing-potion')).stockPrice).toBe(6)
    expect((await card('fixture.fishing-rod')).stockPrice).toBe(20)
    expect((await card('fixture.short-sword')).priceMultiplier).toBe(1.2)
    await card('fixture.arrows')
    await card('fixture.booster')

    // Carta antiga sem os campos novos → valores legados.
    expect(await card('fixture.pickaxe')).toMatchObject({
      priceMultiplier: 1,
      stockPrice: null,
      stockQuantity: 1,
      boosterCollectionId: null,
    })
    const zones = (
      await request(server)
        .get('/catalog/collections/fixture/cards?type=zone')
        .expect(200)
    ).body as { id: string; market: unknown }[]
    expect(zones.length).toBeGreaterThan(1)
    for (const zone of zones) {
      if (zone.id !== 'fixture.gray-harbor' && zone.id !== 'fixture.old-mine')
        expect(zone.market).toBeNull()
    }
  })

  it('REQ-136: PUT fixture.pickaxe com stockPrice em relíquia → 400 CONTENT_INVALID no path stockPrice', async () => {
    const body = await inputOf('fixture.pickaxe')
    const response = await request(server)
      .put('/lab/content/cards/fixture.pickaxe')
      .send({ ...body, stockPrice: 20, itemCategory: 'relic' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CONTENT_INVALID')
    expect(response.body.error.details.fields).toContainEqual({
      path: 'stockPrice',
      message: 'Só consumíveis, materiais e ferramentas têm preço de estoque.',
    })
  })

  it('REQ-136: PUT fixture.gray-harbor com market null → 400 no path market', async () => {
    const body = await inputOf('fixture.gray-harbor')
    const response = await request(server)
      .put('/lab/content/cards/fixture.gray-harbor')
      .send({ ...body, market: null })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CONTENT_INVALID')
    expect(response.body.error.details.fields).toContainEqual({
      path: 'market',
      message: 'Zona com Ir ao Mercado precisa do mercado, e só ela.',
    })
  })

  it('REQ-136: excluir carta do estoque de um mercado → 409 CONTENT_REFERENCED, nada muda', async () => {
    const response = await request(server).delete(
      '/lab/content/cards/fixture.arrows'
    )

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'CONTENT_REFERENCED',
        message: 'Esta carta está no estoque do mercado de uma zona.',
      },
    })
    expect(
      (await request(server).get('/catalog/cards/fixture.arrows')).status
    ).toBe(200)
  })
})
