import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  CONTENT_INVALID,
  createContentApp,
} from '../../../../../test/content-app'

const ZERO_TYPES = {
  zone: 0,
  attribute: 0,
  equipment: 0,
  item: 0,
  randomEvent: 0,
  combatEvent: 0,
  zoneQuest: 0,
  dimension: 0,
  mount: 0,
}
const ZERO_RARITIES = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }

describe('POST /lab/content/collections (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-42: cria a coleção (201) e grava no disco', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections')
      .send(BOSQUE_INPUT)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      ...BOSQUE_INPUT,
      publishedCount: 0,
      draftCount: 0,
      cardCounts: ZERO_TYPES,
      rarityCounts: ZERO_RARITIES,
      tags: [],
    })
    const file = JSON.parse(
      await readFile(join(ctx.root, 'bosque/collection.json'), 'utf8')
    ) as unknown
    expect(file).toMatchObject({ name: 'Bosque Sombrio' })
  })

  it('REQ-42: id já usado → 409 CONTENT_ID_TAKEN no campo id', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections')
      .send(BOSQUE_INPUT)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'CONTENT_ID_TAKEN',
        message: 'Este identificador já está em uso.',
        details: {
          fields: [
            {
              path: 'id',
              message: 'Já existe uma coleção com este identificador.',
            },
          ],
        },
      },
    })
  })

  it('REQ-42: id fora de kebab-case e nome vazio → 400 CONTENT_INVALID com os dois campos', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections')
      .send({ id: 'Bosque X', name: ' ', description: '' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        ...CONTENT_INVALID,
        details: {
          fields: [
            {
              path: 'id',
              message: 'Use só letras minúsculas, números e hífens.',
            },
            { path: 'name', message: 'Informe o nome.' },
          ],
        },
      },
    })
  })

  it('D-51: JSON malformado → 400 CONTENT_INVALID no corpo inteiro', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/collections')
      .set('Content-Type', 'application/json')
      .send('{"id": ')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        ...CONTENT_INVALID,
        details: { fields: [{ path: '', message: 'Envie um objeto JSON.' }] },
      },
    })
  })
})
