import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { createApp } from '../../../../../test/lab-app'
import {
  ISO_UTC,
  postParty,
  resetCampaign,
} from '../../../../../test/parties-e2e'

function invalid(fields: { field: string | null; reason: string }[]) {
  return {
    error: {
      code: 'PARTY_INVALID',
      message: 'Dados do grupo inválidos.',
      details: { fields },
    },
  }
}

describe('POST /parties (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  beforeEach(async () => {
    await resetCampaign(app)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-16: cria um grupo de 1 com o host, idle, e o grava', async () => {
    const response = await request(app.getHttpServer())
      .post('/parties')
      .send({ name: '  Os Teimosos ', characterName: 'Lia' })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      id: expect.any(String),
      name: 'Os Teimosos',
      status: 'idle',
      members: [
        {
          id: expect.any(String),
          characterName: 'Lia',
          kind: 'human',
          isHost: true,
        },
      ],
      createdAt: expect.stringMatching(ISO_UTC),
      savedAt: expect.stringMatching(ISO_UTC),
    })
    expect(response.body.id).not.toBe('')
    expect(response.body.createdAt).toBe(response.body.savedAt)

    const read = await request(app.getHttpServer()).get(
      `/parties/${response.body.id}`
    )
    expect(read.status).toBe(200)
    expect(read.body).toEqual(response.body)
  })

  it('REQ-17: nome em branco e personagem longo → 400 e nada é gravado', async () => {
    const response = await request(app.getHttpServer()).post('/parties').send({
      name: '   ',
      characterName: 'Um nome com mais de vinte e quatro letras',
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([
        { field: 'name', reason: 'blank' },
        { field: 'characterName', reason: 'tooLong' },
      ])
    )
    const list = await request(app.getHttpServer()).get('/parties')
    expect(list.body).toEqual([])
  })

  it('REQ-17: campos ausentes e não texto → required e notString', async () => {
    const response = await request(app.getHttpServer())
      .post('/parties')
      .send({ characterName: 7 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([
        { field: 'name', reason: 'required' },
        { field: 'characterName', reason: 'notString' },
      ])
    )
  })

  it('REQ-17: corpo que não é objeto JSON ou está malformado → 400 invalidBody', async () => {
    const asArray = await request(app.getHttpServer())
      .post('/parties')
      .send([1])
    const malformed = await request(app.getHttpServer())
      .post('/parties')
      .set('Content-Type', 'application/json')
      .send('{"name":')

    for (const response of [asArray, malformed]) {
      expect(response.status).toBe(400)
      expect(response.body).toEqual(
        invalid([{ field: null, reason: 'invalidBody' }])
      )
    }
    const list = await request(app.getHttpServer()).get('/parties')
    expect(list.body).toEqual([])
  })

  it('REQ-17: minPlayers = 2 no laboratório → 400 belowMinPlayers', async () => {
    await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ minPlayers: 2 })
      .expect(200)

    const response = await request(app.getHttpServer())
      .post('/parties')
      .send({ name: 'Solo', characterName: 'Lia' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([{ field: 'members', reason: 'belowMinPlayers' }])
    )
  })

  it('REQ-23: o grupo guarda a configuração da criação; os novos usam a atual', async () => {
    const before = await postParty(app)

    await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ actionPointsPerTurn: 4 })
      .expect(200)
    const after = await postParty(app, { name: 'Depois', characterName: 'Bo' })

    const parties = app.get(PartiesRepository)
    expect(
      (await parties.findById(before.id))?.config.actionPointsPerTurn
    ).toBe(3)
    expect((await parties.findById(after.id))?.config.actionPointsPerTurn).toBe(
      4
    )

    await request(app.getHttpServer()).post('/lab/config/reset').expect(200)
    expect(
      (await parties.findById(before.id))?.config.actionPointsPerTurn
    ).toBe(3)
  })
})
