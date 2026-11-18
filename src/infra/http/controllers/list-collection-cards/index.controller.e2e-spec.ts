import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'

const STRENGTH_BASIC = {
  type: 'attribute',
  id: 'fixture.strength-basic',
  collectionId: 'fixture',
  name: 'Força',
  flavorText: null,
  rarity: 'common',
  attributeKind: 'basic',
  attributes: ['strength'],
  effects: [],
}

describe('GET /catalog/collections/:collectionId/cards (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(false)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-13: responde 200 com as cartas da coleção ordenadas por id', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/collections/fixture/cards'
    )

    expect(response.status).toBe(200)
    expect(
      (response.body as { id: string; type: string }[]).map(({ id, type }) => [
        id,
        type,
      ])
    ).toEqual([
      ['fixture.arcane-wand', 'equipment'],
      ['fixture.blade-of-dusk', 'equipment'],
      ['fixture.dexterity-basic', 'attribute'],
      ['fixture.endurance-basic', 'attribute'],
      ['fixture.gray-harbor', 'zone'],
      ['fixture.healing-potion', 'item'],
      ['fixture.howling-wolves', 'combatEvent'],
      ['fixture.iron-helm', 'equipment'],
      ['fixture.oak-shield', 'equipment'],
      ['fixture.old-mine', 'zone'],
      ['fixture.pickaxe', 'item'],
      ['fixture.short-sword', 'equipment'],
      ['fixture.stone-bend', 'zone'],
      ['fixture.strength-basic', 'attribute'],
      ['fixture.test-dimension', 'dimension'],
      ['fixture.whispering-grove', 'zone'],
      ['fixture.wounded-traveler', 'randomEvent'],
    ])
  })

  it('REQ-13: com ?type=attribute, responde 200 só com as cartas daquele tipo', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/collections/fixture/cards?type=attribute'
    )

    expect(response.status).toBe(200)
    expect(response.body.map((card: { id: string }) => card.id)).toEqual([
      'fixture.dexterity-basic',
      'fixture.endurance-basic',
      'fixture.strength-basic',
    ])
    expect(response.body[2]).toEqual(STRENGTH_BASIC)
  })

  it('REQ-28: com ?type=dimension, responde 200 com a Carta de Dimensão', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/collections/fixture/cards?type=dimension'
    )

    expect(response.status).toBe(200)
    expect(response.body.map((card: { id: string }) => card.id)).toEqual([
      'fixture.test-dimension',
    ])
  })

  it('REQ-13: tipo de filtro desconhecido responde 400 CATALOG_QUERY_INVALID', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/collections/fixture/cards?type=monster'
    )

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        code: 'CATALOG_QUERY_INVALID',
        message: 'Filtro do catálogo inválido.',
        details: { field: 'type', reason: 'unknownCardType' },
      },
    })
  })

  it('REQ-13: coleção inexistente responde 404 COLLECTION_NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/collections/nope/cards'
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
