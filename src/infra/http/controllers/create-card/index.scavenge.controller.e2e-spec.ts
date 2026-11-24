import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  makeDimensionCard,
  makeItemCard,
  toCardInput,
} from '../../../../../test/factories/make-card'
import { createContentApp } from '../../../../../test/content-app'

/** REQ-81 e REQ-82 de ponta a ponta (CONTRATO v0.46, FEAT-32). */
describe('Ferramentas e decks de recompensas no catálogo e no editor (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>
  let server: ReturnType<typeof ctx.app.getHttpServer>

  beforeAll(async () => {
    ctx = await createContentApp()
    server = ctx.app.getHttpServer()
    await request(server).post('/lab/content/collections').send({
      id: 'bosque',
      name: 'Bosque Sombrio',
      description: 'Coleção de teste do editor.',
    })
  })

  afterAll(async () => {
    await ctx.close()
  })

  const dimension = (cardId: string) =>
    toCardInput(
      makeDimensionCard({
        id: 'bosque.reino',
        collectionId: 'bosque',
        releaseOrder: 2,
        arrivalZoneTitle: null,
        rewardDecks: [{ zoneType: 'urban', cards: [{ cardId, copies: 1 }] }],
      })
    )

  it('REQ-81/REQ-82: o catálogo traz os campos novos da fixture', async () => {
    const pickaxe = await request(server).get('/catalog/cards/fixture.pickaxe')
    expect(pickaxe.body).toMatchObject({
      toolKind: 'pickaxe',
      scavengeZoneTypes: ['underground', 'mountainous'],
      scavengeTool: null,
    })

    const fish = await request(server).get('/catalog/cards/fixture.silver-fish')
    expect(fish.body).toMatchObject({
      itemCategory: 'material',
      toolKind: null,
      scavengeTool: 'fishing-rod',
    })

    const blade = await request(server).get(
      '/catalog/cards/fixture.blade-of-dusk'
    )
    expect(blade.body.scavengeTool).toBeNull()

    const harbor = await request(server).get(
      '/catalog/cards/fixture.gray-harbor'
    )
    expect(harbor.body.zoneActions).toEqual([
      'startEvent',
      'scavenge',
      'useVault',
      'visitBlacksmith',
      'visitMarket',
      'saveRespawnPoint',
    ])

    const realm = await request(server).get(
      '/catalog/cards/fixture.test-dimension'
    )
    expect(realm.body.rewardDecks).toEqual([
      {
        zoneType: 'urban',
        cards: [
          { cardId: 'fixture.silver-fish', copies: 1 },
          { cardId: 'fixture.iron-ore', copies: 1 },
          { cardId: 'fixture.healing-potion', copies: 2 },
        ],
      },
    ])
  })

  it('REQ-81: ferramenta inválida → 400 CONTENT_INVALID no path de cada campo', async () => {
    const response = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send(
        toCardInput(
          makeItemCard({
            id: 'bosque.balde',
            collectionId: 'bosque',
            toolKind: 'Balde Velho',
            scavengeZoneTypes: [],
          })
        )
      )

    expect(response.status).toBe(400)
    expect(response.body.error.details.fields).toEqual([
      {
        path: 'toolKind',
        message: 'Só item da categoria Ferramenta tem tipo de ferramenta.',
      },
      {
        path: 'toolKind',
        message: 'Use só letras minúsculas, números e hífens.',
      },
      {
        path: 'scavengeZoneTypes',
        message:
          'Ferramenta precisa de pelo menos 1 tipo de zona onde vasculha.',
      },
    ])
  })

  it('REQ-82: Carta de Dimensão citando carta inexistente → 400; citando carta de outra coleção → 201', async () => {
    const missing = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send(dimension('fixture.nope'))
    expect(missing.status).toBe(400)
    expect(missing.body.error.details.fields).toEqual([
      { path: 'rewardDecks.0.cards.0.cardId', message: 'Carta inexistente.' },
    ])

    const created = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send(dimension('fixture.iron-ore'))
    expect(created.status).toBe(201)
    expect(created.body.card.rewardDecks).toEqual([
      { zoneType: 'urban', cards: [{ cardId: 'fixture.iron-ore', copies: 1 }] },
    ])
  })

  it('REQ-82: publicar Carta de Dimensão que cita rascunho → 400', async () => {
    await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send(
        toCardInput(
          makeItemCard({ id: 'bosque.cogumelo', collectionId: 'bosque' })
        )
      )
    await request(server)
      .put('/lab/content/cards/bosque.reino')
      .send(dimension('bosque.cogumelo'))

    const response = await request(server).post(
      '/lab/content/cards/bosque.reino/publish'
    )
    expect(response.status).toBe(400)
    expect(response.body.error.details.fields).toEqual([
      {
        path: 'rewardDecks.0.cards.0.cardId',
        message: 'Toda carta do deck de recompensas precisa estar publicada.',
      },
    ])
  })

  it('REQ-82: excluir carta citada em rewardDecks → 409 CONTENT_REFERENCED, nada muda', async () => {
    const response = await request(server).delete(
      '/lab/content/cards/fixture.silver-fish'
    )

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'CONTENT_REFERENCED',
        message:
          'Esta carta está no deck de recompensas de uma Carta de Dimensão.',
      },
    })
    expect(
      (await request(server).get('/catalog/cards/fixture.silver-fish')).status
    ).toBe(200)
  })
})
