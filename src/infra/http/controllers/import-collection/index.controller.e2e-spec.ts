import { readdir } from 'node:fs/promises'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOSQUE_INPUT,
  CONTENT_INVALID,
  createContentApp,
  FORCA_INPUT,
  MAGE_INPUT,
} from '../../../../../test/content-app'

describe('POST /lab/content/import (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>
  let exported: unknown

  beforeAll(async () => {
    ctx = await createContentApp()
    const server = ctx.app.getHttpServer()
    await request(server).post('/lab/content/collections').send(BOSQUE_INPUT)
    await request(server)
      .post('/lab/content/collections/bosque/cards')
      .send({ ...FORCA_INPUT, slug: 'forca-bruta' })
    await request(server).post('/lab/content/cards/bosque.forca-bruta/publish')
    await request(server)
      .post('/lab/content/collections/bosque/classes')
      .send(MAGE_INPUT)
      .expect(201)
    exported = (
      await request(server).get('/lab/content/collections/bosque/export')
    ).body as unknown
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('REQ-48: coleção já existe sem replace → 409 CONTENT_ID_TAKEN em collection.id', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/import')
      .send(exported as object)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'CONTENT_ID_TAKEN',
        message: 'Este identificador já está em uso.',
        details: {
          fields: [
            {
              path: 'collection.id',
              message: 'Já existe uma coleção com este identificador.',
            },
          ],
        },
      },
    })
  })

  it('REQ-48: com replace=true troca a coleção (201) e reproduz o export', async () => {
    const server = ctx.app.getHttpServer()
    const response = await request(server)
      .post('/lab/content/import?replace=true')
      .send(exported as object)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      collectionId: 'bosque',
      cardCount: 1,
      classCount: 1,
    })
    expect(
      (await request(server).get('/lab/content/collections/bosque/export')).body
    ).toEqual(exported)
  })

  it('REQ-48: depois de apagar a coleção, o import sem replace → 201', async () => {
    const server = ctx.app.getHttpServer()
    expect(
      (await request(server).delete('/lab/content/collections/bosque')).status
    ).toBe(204)

    const response = await request(server)
      .post('/lab/content/import')
      .send(exported as object)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      collectionId: 'bosque',
      cardCount: 1,
      classCount: 1,
    })
  })

  it('REQ-48: arquivo vazio → 400 CONTENT_INVALID com formatVersion; nada gravado', async () => {
    const before = await readdir(ctx.root)
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/import')
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject(CONTENT_INVALID)
    expect(response.body.error.details.fields).toContainEqual({
      path: 'formatVersion',
      message: 'Versão do arquivo não suportada.',
    })
    expect(await readdir(ctx.root)).toEqual(before)
  })

  it('REQ-38/REQ-48: export leva a classe e o import com replace a reproduz', async () => {
    const server = ctx.app.getHttpServer()
    const classes = (exported as { classes: unknown[] }).classes
    expect(classes).toEqual([
      {
        status: 'draft',
        classDefinition: {
          ...MAGE_INPUT,
          collectionId: 'bosque',
          specializations: [],
        },
      },
    ])
    expect(
      (await request(server).get('/lab/content/classes/mage')).body
    ).toEqual(classes[0])
  })

  it('REQ-38/REQ-48: classe com playerClass desconhecido → 400 CONTENT_INVALID em classes.0.classDefinition.playerClass', async () => {
    const file = exported as { classes: { classDefinition: object }[] }
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/import?replace=true')
      .send({
        ...file,
        classes: [
          {
            status: 'draft',
            classDefinition: {
              ...file.classes[0].classDefinition,
              playerClass: 'paladino',
            },
          },
        ],
      })

    expect(response.status).toBe(400)
    expect(
      response.body.error.details.fields.map((f: { path: string }) => f.path)
    ).toContain('classes.0.classDefinition.playerClass')
  })

  it('REQ-48: replace fora de true/false → 400 CONTENT_INVALID no parâmetro replace', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/lab/content/import?replace=talvez')
      .send(exported as object)

    expect(response.status).toBe(400)
    expect(response.body.error.details.fields).toContainEqual({
      path: 'replace',
      message: 'Use true ou false.',
    })
  })
})
