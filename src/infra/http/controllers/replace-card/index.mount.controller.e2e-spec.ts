import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createContentApp } from '../../../../../test/content-app'

/** REQ-155 de ponta a ponta (CONTRATO, FEAT-18: cenários Editor e fixture). */
describe('Montaria no catálogo e no editor (e2e)', () => {
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

  it('REQ-155: o catálogo traz as montarias, o Estábulo da Mina Velha e cardCounts.mount 2', async () => {
    const card = async (id: string) =>
      (await request(server).get(`/catalog/cards/${id}`).expect(200)).body

    expect(await card('fixture.plow-horse')).toEqual({
      type: 'mount',
      id: 'fixture.plow-horse',
      collectionId: 'fixture',
      name: 'Cavalo de Arado',
      flavorText: null,
      rarity: 'rare',
      mountTypes: ['beast'],
      creature: 'Cavalo',
      effects: [],
      abilities: [],
    })
    expect(await card('fixture.war-pony')).toMatchObject({
      type: 'mount',
      rarity: 'common',
      mountTypes: ['beast'],
      creature: 'Pônei',
      effects: [{ trigger: null, cost: [{ kind: 'payGold', amount: 1 }] }],
      abilities: [{ id: 'pony-rest', timing: 'outsideCombat' }],
    })
    expect(await card('fixture.old-mine')).toMatchObject({
      zoneType: 'rural',
      zoneActions: ['startEvent', 'visitMarket'],
      market: { stock: [], singles: false, mounts: ['fixture.plow-horse'] },
    })
    expect((await card('fixture.gray-harbor')).market.mounts).toEqual([])

    const collections = (
      await request(server).get('/catalog/collections').expect(200)
    ).body as { id: string; cardCounts: Record<string, number> }[]
    expect(
      collections.find(({ id }) => id === 'fixture')?.cardCounts.mount
    ).toBe(2)
  })

  it('REQ-155: PUT fixture.plow-horse com mountTypes vazio → 400 CONTENT_INVALID', async () => {
    const body = await inputOf('fixture.plow-horse')
    const response = await request(server)
      .put('/lab/content/cards/fixture.plow-horse')
      .send({ ...body, mountTypes: [] })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CONTENT_INVALID')
    expect(response.body.error.details.fields).toContainEqual({
      path: 'mountTypes',
      message: 'A montaria precisa de ao menos um tipo, sem repetição.',
    })
  })

  it('REQ-155: PUT fixture.gray-harbor com Estábulo → 400 no path market.mounts', async () => {
    const body = await inputOf('fixture.gray-harbor')
    const response = await request(server)
      .put('/lab/content/cards/fixture.gray-harbor')
      .send({
        ...body,
        market: {
          ...(body.market as object),
          mounts: ['fixture.plow-horse'],
        },
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CONTENT_INVALID')
    expect(response.body.error.details.fields).toContainEqual({
      path: 'market.mounts',
      message: 'Só zonas Rurais e Habitadas têm Estábulo.',
    })
  })

  it('REQ-155: excluir a montaria do Estábulo → 409 CONTENT_REFERENCED, nada muda', async () => {
    const response = await request(server).delete(
      '/lab/content/cards/fixture.plow-horse'
    )

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'CONTENT_REFERENCED',
        message: 'Esta montaria está no Estábulo de uma zona.',
      },
    })
    expect(
      (await request(server).get('/catalog/cards/fixture.plow-horse')).status
    ).toBe(200)
  })
})
