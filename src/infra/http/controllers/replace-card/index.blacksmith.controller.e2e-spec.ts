import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createContentApp } from '../../../../../test/content-app'

/** REQ-145 de ponta a ponta (CONTRATO, FEAT-17: cenários Editor e fixture). */
describe('Ferreiro no catálogo e no editor (e2e)', () => {
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

  it('REQ-145: o catálogo traz as formas novas da fixture e os valores legados', async () => {
    const card = async (id: string) =>
      (await request(server).get(`/catalog/cards/${id}`).expect(200)).body

    const harbor = await card('fixture.gray-harbor')
    expect(harbor.zoneActions).toContain('visitBlacksmith')
    expect(harbor.blacksmith).toEqual({
      enchantments: [
        {
          id: 'ember-edge',
          name: 'Fio de Brasa',
          kind: 'element',
          element: 'fire',
          bonusPercent: 10,
          materials: [{ cardId: 'fixture.ember-shard', quantity: 1 }],
        },
      ],
    })

    expect(await card('fixture.short-sword')).toMatchObject({
      refinement: {
        maxLevel: 10,
        materials: [{ cardId: 'fixture.iron-ore', quantity: 1 }],
      },
      enchantment: { slots: [{ kind: 'element', minRefinement: 2 }] },
    })
    expect(await card('fixture.blade-of-dusk')).toMatchObject({
      refinement: {
        maxLevel: 3,
        materials: [{ cardId: 'fixture.iron-ore', quantity: 1 }],
      },
      enchantment: null,
    })
    expect(await card('fixture.sword-blueprint')).toMatchObject({
      itemCategory: 'document',
      recipe: {
        equipmentId: 'fixture.short-sword',
        materials: [{ cardId: 'fixture.iron-ore', quantity: 2 }],
        gold: 15,
        consumed: false,
      },
    })
    expect(await card('fixture.ember-shard')).toMatchObject({
      itemCategory: 'material',
      rarity: 'rare',
      recipe: null,
    })

    const zones = (
      await request(server)
        .get('/catalog/collections/fixture/cards?type=zone')
        .expect(200)
    ).body as { id: string; blacksmith: unknown }[]
    expect(zones.length).toBeGreaterThan(1)
    for (const zone of zones) {
      if (zone.id !== 'fixture.gray-harbor') expect(zone.blacksmith).toBeNull()
    }
  })

  it('REQ-145: PUT fixture.short-sword com refinement.materials vazio → 400 CONTENT_INVALID', async () => {
    const body = await inputOf('fixture.short-sword')
    const response = await request(server)
      .put('/lab/content/cards/fixture.short-sword')
      .send({
        ...body,
        refinement: { maxLevel: 10, materials: [] },
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CONTENT_INVALID')
    expect(response.body.error.details.fields).toContainEqual({
      path: 'refinement.materials',
      message: 'Equipamento refinável precisa dos materiais de refino.',
    })
  })

  it('REQ-145: PUT fixture.gray-harbor com blacksmith null → 400 no path blacksmith', async () => {
    const body = await inputOf('fixture.gray-harbor')
    const response = await request(server)
      .put('/lab/content/cards/fixture.gray-harbor')
      .send({ ...body, blacksmith: null })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CONTENT_INVALID')
    expect(response.body.error.details.fields).toContainEqual({
      path: 'blacksmith',
      message: 'Zona com Ir ao Ferreiro precisa do ferreiro, e só ela.',
    })
  })

  it('REQ-145: excluir material citado pelo ferreiro → 409 CONTENT_REFERENCED, nada muda', async () => {
    const response = await request(server).delete(
      '/lab/content/cards/fixture.ember-shard'
    )

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'CONTENT_REFERENCED',
        message:
          'Esta carta é usada como material, receita ou encantamento de outra carta.',
      },
    })
    expect(
      (await request(server).get('/catalog/cards/fixture.ember-shard')).status
    ).toBe(200)
  })
})
