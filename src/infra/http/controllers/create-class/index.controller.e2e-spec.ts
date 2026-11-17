import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  CONTENT_INVALID,
  createContentApp,
  MAGE_INPUT,
} from '../../../../../test/content-app'

// Rotas de classes do editor (CONTRATO FEAT-06; REQ-38). Os `it` seguem em
// ordem: cada um parte do estado deixado pelo anterior.
describe('Classes no editor /lab/content (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
    await request(ctx.app.getHttpServer())
      .post('/lab/content/collections')
      .send(BOSQUE_INPUT)
      .expect(201)
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-38: playerClass já usado (warrior da fixture) → 409 CONTENT_ID_TAKEN em playerClass', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections/bosque/classes')
      .send({
        ...MAGE_INPUT,
        playerClass: 'warrior',
        name: 'Guerreiro',
        essentialAttributes: ['strength', 'endurance'],
        starterDeck: [],
      })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('CONTENT_ID_TAKEN')
    expect(response.body.error.details.fields).toEqual([
      expect.objectContaining({ path: 'playerClass' }),
    ])
  })

  it('REQ-38: cria mage como rascunho (201)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections/bosque/classes')
      .send(MAGE_INPUT)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      status: 'draft',
      classDefinition: { ...MAGE_INPUT, collectionId: 'bosque' },
    })
  })

  it('REQ-38: lista as classes da coleção e lê uma', async () => {
    const server = ctx.app.getHttpServer()
    const list = await request(server).get(
      '/lab/content/collections/bosque/classes'
    )
    expect(list.status).toBe(200)
    expect(list.body).toEqual([
      { playerClass: 'mage', name: 'Mago', status: 'draft' },
    ])

    const one = await request(server).get('/lab/content/classes/mage')
    expect(one.status).toBe(200)
    expect(one.body.classDefinition.playerClass).toBe('mage')
  })

  it('REQ-38: formato inválido → 400 CONTENT_INVALID; coleção inexistente → 404', async () => {
    const server = ctx.app.getHttpServer()
    const invalid = await request(server)
      .post('/lab/content/collections/bosque/classes')
      .send({ ...MAGE_INPUT, playerClass: 'ranger', essentialAttributes: [] })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error).toMatchObject(CONTENT_INVALID)
    expect(
      invalid.body.error.details.fields.map((f: { path: string }) => f.path)
    ).toContain('essentialAttributes')

    const missing = await request(server)
      .post('/lab/content/collections/nope/classes')
      .send(MAGE_INPUT)
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('COLLECTION_NOT_FOUND')
  })

  it('REQ-38: publicar mage sem a trava cumprida → 400 CONTENT_INVALID; o catálogo segue com 2', async () => {
    const server = ctx.app.getHttpServer()
    const response = await request(server).post(
      '/lab/content/classes/mage/publish'
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject(CONTENT_INVALID)
    const catalog = await request(server).get('/catalog/classes')
    expect(catalog.body).toHaveLength(2)
  })

  it('REQ-38: PUT renomeia o rascunho; em publicada com outro playerClass → 409 CONTENT_LOCKED', async () => {
    const server = ctx.app.getHttpServer()
    const renamed = await request(server)
      .put('/lab/content/classes/mage')
      .send({ ...MAGE_INPUT, playerClass: 'cleric', name: 'Clérigo' })
    expect(renamed.status).toBe(200)
    expect(renamed.body.classDefinition.playerClass).toBe('cleric')
    expect(
      (await request(server).get('/lab/content/classes/mage')).status
    ).toBe(404)

    const back = await request(server)
      .put('/lab/content/classes/cleric')
      .send(MAGE_INPUT)
    expect(back.status).toBe(200)

    const warrior = (await request(server).get('/lab/content/classes/warrior'))
      .body.classDefinition as Record<string, unknown>
    const { collectionId, ...input } = warrior
    void collectionId
    const locked = await request(server)
      .put('/lab/content/classes/warrior')
      .send({ ...input, playerClass: 'monk' })
    expect(locked.status).toBe(409)
    expect(locked.body.error.code).toBe('CONTENT_LOCKED')
  })

  it('REQ-38: publicar uma já publicada → 200 sem mudança', async () => {
    const response = await request(ctx.app.getHttpServer()).post(
      '/lab/content/classes/warrior/publish'
    )
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('published')
  })

  it('REQ-38: excluir mage em rascunho → 204; ler depois → 404 CLASS_NOT_FOUND', async () => {
    const server = ctx.app.getHttpServer()
    expect(
      (await request(server).delete('/lab/content/classes/mage')).status
    ).toBe(204)

    const response = await request(server).get('/lab/content/classes/mage')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: { code: 'CLASS_NOT_FOUND', message: 'Classe não encontrada.' },
    })
  })
})
