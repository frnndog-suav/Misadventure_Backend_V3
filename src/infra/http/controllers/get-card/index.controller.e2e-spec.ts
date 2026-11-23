import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../../../test/lab-app'

describe('GET /catalog/cards/:cardId (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(false)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-101/FEAT-11: item consumível traz os efeitos no formato estruturado', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/cards/fixture.healing-potion'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      type: 'item',
      id: 'fixture.healing-potion',
      collectionId: 'fixture',
      name: 'Poção de Cura',
      flavorText: null,
      rarity: 'common',
      itemCategory: 'consumable',
      tags: ['poção'],
      effects: [
        {
          text: 'Recupera 5 de vida.',
          trigger: null,
          cost: [{ kind: 'consumeSelf' }],
          activation: [{ kind: 'heal', amount: 5 }],
          duration: { kind: 'immediate' },
          mark: null,
        },
      ],
      toolKind: null,
      scavengeZoneTypes: [],
      scavengeTool: null,
      priceMultiplier: 1,
      stockPrice: 6,
      stockQuantity: 1,
      boosterCollectionId: null,
    })
  })

  it('REQ-14: carta existente responde 200 com a carta', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/cards/fixture.strength-basic'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      type: 'attribute',
      id: 'fixture.strength-basic',
      collectionId: 'fixture',
      name: 'Força',
      flavorText: null,
      rarity: 'common',
      attributeKind: 'basic',
      attributes: ['strength'],
      effects: [],
      priceMultiplier: 1,
    })
  })

  it('REQ-28: Carta de Dimensão responde 200 no formato do contrato', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/cards/fixture.test-dimension'
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      type: 'dimension',
      id: 'fixture.test-dimension',
      collectionId: 'fixture',
      name: 'Dimensão de Teste',
      flavorText: null,
      releaseOrder: 1,
      arrivalZoneTitle: 'Porto Cinzento',
      effects: [],
      eventDecks: [
        {
          zoneType: 'urban',
          cards: [
            { cardId: 'fixture.wounded-traveler', copies: 1 },
            { cardId: 'fixture.howling-wolves', copies: 1 },
          ],
        },
      ],
      rewardDecks: [
        {
          zoneType: 'urban',
          cards: [
            { cardId: 'fixture.silver-fish', copies: 1 },
            { cardId: 'fixture.iron-ore', copies: 1 },
            { cardId: 'fixture.healing-potion', copies: 2 },
          ],
        },
      ],
    })
  })

  it('D-37: zona de 2 setas traz arrowLayout; zona urbana traz null', async () => {
    const server = app.getHttpServer()
    const bend = await request(server).get('/catalog/cards/fixture.stone-bend')
    const harbor = await request(server).get(
      '/catalog/cards/fixture.gray-harbor'
    )

    expect(bend.status).toBe(200)
    expect(bend.body).toMatchObject({
      connectionArrows: 2,
      arrowLayout: 'corner',
    })
    expect(harbor.body).toMatchObject({ arrowLayout: null })
  })

  it('REQ-14: carta inexistente responde 404 CARD_NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/cards/fixture.nope'
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: { code: 'CARD_NOT_FOUND', message: 'Carta não encontrada.' },
    })
  })
})
