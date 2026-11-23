import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  CONTENT_INVALID,
  createContentApp,
  FORCA_INPUT,
} from '../../../../../test/content-app'

describe('POST /lab/content/collections/:collectionId/cards (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
    await request(ctx.app.getHttpServer())
      .post('/lab/content/collections')
      .send(BOSQUE_INPUT)
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-44: cria a carta como rascunho (201), fora do catálogo', async () => {
    const server = ctx.app.getHttpServer()
    const response = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send(FORCA_INPUT)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      status: 'draft',
      card: {
        type: 'attribute',
        id: 'bosque.forca',
        collectionId: 'bosque',
        name: 'Força',
        flavorText: null,
        rarity: 'common',
        attributeKind: 'basic',
        attributes: ['strength'],
        effects: [],
        priceMultiplier: 1,
      },
    })
    const catalog = await request(server).get(
      '/catalog/collections/bosque/cards'
    )
    expect(catalog.status).toBe(200)
    expect(catalog.body).toEqual([])
  })

  it('REQ-38/REQ-26: cria Carta de Dimensão e zona com arrowLayout pelo editor; releaseOrder repetido no catálogo → 400', async () => {
    const server = ctx.app.getHttpServer()
    const dimension = {
      slug: 'bosque-dimensao',
      type: 'dimension',
      name: 'Dimensão do Bosque',
      flavorText: null,
      releaseOrder: 2,
      arrivalZoneTitle: null,
      effects: [],
      rewardDecks: [],
    }
    const created = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send(dimension)
    expect(created.status).toBe(201)
    expect(created.body.card).toMatchObject({
      type: 'dimension',
      id: 'bosque.bosque-dimensao',
      releaseOrder: 2,
    })

    const zone = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send({
        slug: 'trilha',
        type: 'zone',
        title: 'Trilha',
        zoneType: 'forest',
        location: 'Bosque',
        connectionArrows: 2,
        arrowLayout: 'corner',
        zoneActions: ['startEvent'],
        effects: [],
      })
    expect(zone.status).toBe(201)
    expect(zone.body.card.arrowLayout).toBe('corner')

    // `releaseOrder: 1` já é da fixture.test-dimension.
    const repeated = await request(server)
      .put('/lab/content/cards/bosque.bosque-dimensao')
      .send({ ...dimension, releaseOrder: 1 })
    expect(repeated.status).toBe(400)
    expect(
      repeated.body.error.details.fields.map((f: { path: string }) => f.path)
    ).toContain('releaseOrder')
  })

  it('REQ-43: carta básica com 2 atributos → 400 CONTENT_INVALID no campo attributes', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections/bosque/cards')
      .send({
        ...FORCA_INPUT,
        slug: 'forca-sorte',
        attributes: ['strength', 'luck'],
      })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        ...CONTENT_INVALID,
        details: {
          fields: [
            {
              path: 'attributes',
              message: 'Carta básica tem exatamente 1 atributo.',
            },
          ],
        },
      },
    })
  })

  it('REQ-99/FEAT-11: consumível com efeito sem consumeSelf → 400 CONTENT_INVALID em effects.0.cost', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections/bosque/cards')
      .send({
        slug: 'frasco',
        type: 'item',
        name: 'Frasco Quebrado',
        flavorText: null,
        rarity: 'common',
        itemCategory: 'consumable',
        tags: [],
        effects: [
          {
            text: 'Recupera 5 de vida.',
            trigger: null,
            cost: [],
            activation: [{ kind: 'heal', amount: 5 }],
            duration: { kind: 'immediate' },
            mark: null,
          },
        ],
        toolKind: null,
        scavengeZoneTypes: [],
        scavengeTool: null,
      })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        ...CONTENT_INVALID,
        details: {
          fields: [
            {
              path: 'effects.0.cost',
              message:
                'Consumível precisa ter o custo de usar a própria carta.',
            },
          ],
        },
      },
    })
  })

  it('REQ-99: o editor aponta estrutura, faixa, marca e citações inválidas', async () => {
    const server = ctx.app.getHttpServer()
    const create = (card: object) =>
      request(server).post('/lab/content/collections/bosque/cards').send(card)
    const item = {
      slug: 'efeito-validacao',
      type: 'item',
      name: 'Frasco de Teste',
      flavorText: null,
      rarity: 'common',
      itemCategory: 'treasure',
      tags: [],
      toolKind: null,
      scavengeZoneTypes: [],
      scavengeTool: null,
    }
    const effect = {
      text: 'Recupera 5 de vida.',
      trigger: null,
      cost: [],
      activation: [{ kind: 'heal', amount: 5 }],
      duration: { kind: 'immediate' },
      mark: null,
    }
    const cases = [
      [{ activation: [{ kind: 'unknown' }] }, 'activation.0.kind'],
      [{ activation: [{ kind: 'heal', amount: -1 }] }, 'activation.0.amount'],
      [{ activation: [] }, 'activation'],
      [{ mark: 'buff' }, 'mark'],
      [{ duration: { kind: 'infinite' } }, 'mark'],
      [
        {
          cost: [
            {
              kind: 'offerResources',
              requirements: [{ resource: 'qualquer texto', count: 1 }],
              constraint: 'none',
              exclude: [],
            },
          ],
        },
        'cost.0.requirements.0.resource',
      ],
    ] as const
    for (const [override, path] of cases) {
      const result = await create({
        ...item,
        effects: [{ ...effect, ...override }],
      }).expect(400)
      expect(result.body.error.code).toBe('CONTENT_INVALID')
      expect(result.body.error.details.fields).toContainEqual({
        path: `effects.0.${path}`,
        message: expect.stringMatching(/\S/),
      })
    }
    const invalidAttribute = await create({
      ...FORCA_INPUT,
      slug: 'forca-custo-invalido',
      attributeKind: 'enhanced',
      effects: [{ ...effect, cost: [{ kind: 'consumeSelf' }] }],
    }).expect(400)
    expect(invalidAttribute.body.error).toMatchObject({
      code: 'CONTENT_INVALID',
      details: {
        fields: expect.arrayContaining([
          expect.objectContaining({ path: 'effects.0.cost.0' }),
        ]),
      },
    })

    const draft = await create({
      ...item,
      effects: [
        {
          ...effect,
          trigger: { kind: 'onEnterZoneTitle', zoneTitle: 'Forte Perdido' },
        },
      ],
    }).expect(201)
    const published = await request(server)
      .post(`/lab/content/cards/${draft.body.card.id as string}/publish`)
      .expect(400)
    expect(published.body.error).toMatchObject({
      code: 'CONTENT_INVALID',
      details: {
        fields: [
          expect.objectContaining({ path: 'effects.0.trigger.zoneTitle' }),
        ],
      },
    })
  })

  it('REQ-98/REQ-101: cria item com efeito estruturado (201) e o editor o devolve igual', async () => {
    const effect = {
      text: '+3 de Ataque durante 2 vezes suas.',
      trigger: null,
      cost: [{ kind: 'consumeSelf' }],
      activation: [
        { kind: 'modifierFlat', changes: [{ modifier: 'attack', amount: 3 }] },
      ],
      duration: { kind: 'forOwnTurns', turns: 2 },
      mark: 'buff',
    }
    const server = ctx.app.getHttpServer()
    const created = await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send({
        slug: 'tonico',
        type: 'item',
        name: 'Tônico de Força',
        flavorText: null,
        rarity: 'common',
        itemCategory: 'consumable',
        tags: [],
        effects: [effect],
        toolKind: null,
        scavengeZoneTypes: [],
        scavengeTool: null,
      })

    expect(created.status).toBe(201)
    expect(created.body).toEqual({
      status: 'draft',
      card: {
        type: 'item',
        id: 'bosque.tonico',
        collectionId: 'bosque',
        name: 'Tônico de Força',
        flavorText: null,
        rarity: 'common',
        itemCategory: 'consumable',
        tags: [],
        effects: [effect],
        toolKind: null,
        scavengeZoneTypes: [],
        scavengeTool: null,
        priceMultiplier: 1,
        stockPrice: null,
        stockQuantity: 1,
        boosterCollectionId: null,
      },
    })

    const fetched = await request(server).get(
      '/lab/content/cards/bosque.tonico'
    )
    expect(fetched.status).toBe(200)
    expect(fetched.body.card.effects).toEqual([effect])
  })

  it('REQ-43: id de carta já usado → 409 CONTENT_ID_TAKEN no campo slug', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections/bosque/cards')
      .send(FORCA_INPUT)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'CONTENT_ID_TAKEN',
        message: 'Este identificador já está em uso.',
        details: {
          fields: [
            {
              path: 'slug',
              message: 'Já existe uma carta com este identificador.',
            },
          ],
        },
      },
    })
  })

  it('REQ-44: coleção inexistente → 404 COLLECTION_NOT_FOUND (antes do corpo)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections/nope/cards')
      .send({})

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('COLLECTION_NOT_FOUND')
  })
})
