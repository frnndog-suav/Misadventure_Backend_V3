import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../test/content-app'
import { postParty, resetCampaign } from '../../../test/parties-e2e'

const CONTENT_IN_USE = {
  error: {
    code: 'CONTENT_IN_USE',
    message: 'Este conteúdo é usado por algum save e não pode ser apagado.',
  },
}

const CONTENT_REFERENCED = {
  error: {
    code: 'CONTENT_REFERENCED',
    message:
      'Esta carta está no deck pré-pronto de uma classe e não pode ser apagada nem renomeada.',
  },
}

// CONTRATO FEAT-06: conteúdo usado por save (REQ-39) e carta usada por classe (REQ-40).
describe('Conteúdo em uso no editor (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  beforeEach(async () => {
    await resetCampaign(ctx.app)
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-39: com um grupo, excluir zona, carta da build, classe ou a coleção → 409 CONTENT_IN_USE; apagado o grupo, a zona sai (204)', async () => {
    const server = ctx.app.getHttpServer()
    const party = await postParty(ctx.app)

    for (const path of [
      '/lab/content/cards/fixture.gray-harbor',
      '/lab/content/cards/fixture.endurance-basic',
      '/lab/content/classes/warrior',
      '/lab/content/collections/fixture',
    ]) {
      const response = await request(server).delete(path)
      expect(response.status, path).toBe(409)
      expect(response.body).toEqual(CONTENT_IN_USE)
    }

    await request(server).delete(`/parties/${party.id}`).expect(204)
    expect(
      (await request(server).delete('/lab/content/cards/fixture.stone-bend'))
        .status
    ).toBe(204)
  })

  it('REQ-39: com um grupo, substituir a coleção no import (replace=true) → 409 CONTENT_IN_USE, nada muda', async () => {
    const server = ctx.app.getHttpServer()
    await postParty(ctx.app)
    const exported = (
      await request(server).get('/lab/content/collections/fixture/export')
    ).body

    const response = await request(server)
      .post('/lab/content/import?replace=true')
      .send(exported)

    expect(response.status).toBe(409)
    expect(response.body).toEqual(CONTENT_IN_USE)
    expect(
      (await request(server).get('/lab/content/collections/fixture/export'))
        .body
    ).toEqual(exported)
  })

  it('REQ-40: renomear (PUT com outro slug) carta usada no deck de uma classe → 409 CONTENT_REFERENCED, nada muda', async () => {
    const server = ctx.app.getHttpServer()
    const card = {
      slug: 'arcana-draft',
      type: 'attribute',
      name: 'Arcana',
      flavorText: null,
      rarity: 'common',
      attributeKind: 'basic',
      attributes: ['intelligence'],
      effects: [],
    }
    await request(server)
      .post('/lab/content/collections/fixture/cards')
      .send(card)
      .expect(201)
    await request(server)
      .post('/lab/content/collections/fixture/classes')
      .send({
        playerClass: 'mage',
        name: 'Mago',
        essentialAttributes: ['intelligence'],
        baseModifiers: {
          attack: 5,
          defense: 3,
          accuracy: 50,
          evasion: 20,
          celerity: 10,
          piercing: 0,
          reflection: 0,
        },
        starterDeck: [{ cardId: 'fixture.arcana-draft', copies: 60 }],
      })
      .expect(201)

    const response = await request(server)
      .put('/lab/content/cards/fixture.arcana-draft')
      .send({ ...card, slug: 'arcana-nova' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual(CONTENT_REFERENCED)
    await request(server)
      .get('/lab/content/cards/fixture.arcana-draft')
      .expect(200)
  })

  it('REQ-40: sem grupos, excluir carta do deck pré-pronto de uma classe → 409 CONTENT_REFERENCED', async () => {
    const response = await request(ctx.app.getHttpServer()).delete(
      '/lab/content/cards/fixture.dexterity-basic'
    )

    expect(response.status).toBe(409)
    expect(response.body).toEqual(CONTENT_REFERENCED)
  })
})
