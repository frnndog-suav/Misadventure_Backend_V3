import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'
import {
  PARTY_NOT_FOUND,
  postParty,
  resetCampaign,
} from '../../../../../test/parties-e2e'

// CONTRATO FEAT-10: doação do laboratório (REQ-69, REQ-70, REQ-76 a REQ-78).

const B = 'fixture.blade-of-dusk'
const P = 'fixture.healing-potion'
const K = 'fixture.pickaxe'
const S = 'fixture.strength-basic'

type TPlayer = {
  gold: number
  inventory: { cardId: string; quantity: number }[]
  inventoryCapacity: number
  purseCapacity: number
  tcgFolder: { cardId: string; copies: number }[]
}

type TParty = {
  id: string
  savedAt: string
  members: { id: string; player: TPlayer }[]
}

const grantInvalid = (fields: object[]) => ({
  error: {
    code: 'LAB_GRANT_INVALID',
    message: 'Doação inválida.',
    details: { fields },
  },
})

describe('POST /lab/parties/:partyId/members/:memberId/grants (e2e)', () => {
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

  const server = () => ctx.app.getHttpServer()

  async function created(): Promise<TParty> {
    return (await postParty(ctx.app)) as unknown as TParty
  }

  const grant = (party: TParty, body: unknown, memberId?: string) =>
    request(server())
      .post(
        `/lab/parties/${party.id}/members/${memberId ?? party.members[0].id}/grants`
      )
      .send(body as object)

  const get = async (id: string): Promise<TParty> =>
    (await request(server()).get(`/parties/${id}`)).body

  it('REQ-69: /lab/config traz inventoryCapacity e purseCapacity com padrões e limites; o grupo guarda a cópia', async () => {
    const config = await request(server()).get('/lab/config').expect(200)
    expect(config.body.values).toMatchObject({
      inventoryCapacity: 10,
      purseCapacity: 300,
    })
    expect(config.body.defaults).toMatchObject({
      inventoryCapacity: 10,
      purseCapacity: 300,
    })
    expect(config.body.limits).toMatchObject({
      inventoryCapacity: { min: 0, max: 100 },
      purseCapacity: { min: 0, max: 1000000 },
    })

    const old = await created()
    await request(server())
      .patch('/lab/config')
      .send({ inventoryCapacity: 2, purseCapacity: 50 })
      .expect(200)
    const fresh = await created()

    expect(fresh.members[0].player.inventoryCapacity).toBe(2)
    expect(fresh.members[0].player.purseCapacity).toBe(50)
    const oldRead = await get(old.id)
    expect(oldRead.members[0].player.inventoryCapacity).toBe(10)
    expect(oldRead.members[0].player.purseCapacity).toBe(300)
  })

  it('REQ-70: na criação, o ouro acima de purseCapacity é perdido', async () => {
    await request(server())
      .patch('/lab/config')
      .send({ initialGold: 500 })
      .expect(200)

    const party = await created()

    expect(party.members[0].player.gold).toBe(300)
  })

  it('REQ-70/REQ-77: consumível empilha num slot; ferramenta abre um slot por cópia, depois; atributo vai para a pasta', async () => {
    const party = await created()

    await grant(party, { type: 'card', cardId: P, quantity: 2 }).expect(200)
    const stacked = await grant(party, { type: 'card', cardId: P, quantity: 3 })
    expect(stacked.status).toBe(200)
    expect(stacked.body.members[0].player.inventory).toEqual([
      { cardId: P, quantity: 5 },
    ])

    const tools = await grant(party, { type: 'card', cardId: K, quantity: 2 })
    expect(tools.body.members[0].player.inventory).toEqual([
      { cardId: P, quantity: 5 },
      { cardId: K, quantity: 1 },
      { cardId: K, quantity: 1 },
    ])

    const folder = await grant(party, { type: 'card', cardId: S, quantity: 2 })
    expect(folder.body.members[0].player.tcgFolder).toEqual([
      { cardId: S, copies: 2 },
    ])
    expect((await get(party.id)).members[0].player.inventory).toHaveLength(3)
  })

  it('REQ-76/REQ-77: ouro acima da bolsa é perdido; a doação vale sem sessão e fora da vez', async () => {
    const party = await created()

    const response = await grant(party, { type: 'gold', amount: 295 })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('idle')
    expect(response.body.members[0].player.gold).toBe(300)
    expect((await get(party.id)).members[0].player.gold).toBe(300)
  })

  it('REQ-77: recusas na ordem do contrato, nada gravado', async () => {
    const party = await created()

    const missingParty = await request(server())
      .post(`/lab/parties/nope/members/${party.members[0].id}/grants`)
      .send({ type: 'gold', amount: 1 })
    expect(missingParty.status).toBe(404)
    expect(missingParty.body).toEqual(PARTY_NOT_FOUND)

    const missingMember = await grant(party, { type: 'nope' }, 'nobody')
    expect(missingMember.status).toBe(404)
    expect(missingMember.body).toEqual({
      error: {
        code: 'MEMBER_NOT_FOUND',
        message: 'Membro não encontrado neste grupo.',
      },
    })

    const badType = await grant(party, { type: 'gem' })
    expect(badType.status).toBe(400)
    expect(badType.body).toEqual(
      grantInvalid([{ field: 'type', reason: 'unknownGrantType' }])
    )

    const badAmount = await grant(party, { type: 'gold', amount: 0 })
    expect(badAmount.status).toBe(400)
    expect(badAmount.body).toEqual(
      grantInvalid([{ field: 'amount', reason: 'notPositiveInteger' }])
    )

    const missingCard = await grant(party, {
      type: 'card',
      cardId: 'fixture.nope',
      quantity: 1,
    })
    expect(missingCard.status).toBe(404)
    expect(missingCard.body.error.code).toBe('CARD_NOT_FOUND')

    const zone = await grant(party, {
      type: 'card',
      cardId: 'fixture.gray-harbor',
      quantity: 1,
    })
    expect(zone.status).toBe(400)
    expect(zone.body).toEqual(
      grantInvalid([{ field: 'cardId', reason: 'notGrantable' }])
    )

    const read = await get(party.id)
    expect(read.savedAt).toBe(party.savedAt)
    expect(read.members[0].player.inventory).toEqual([])
  })

  it('REQ-77: o que não cabe inteiro → 409 LAB_GRANT_NO_SPACE, nada muda', async () => {
    const party = await created()
    await grant(party, { type: 'card', cardId: K, quantity: 9 }).expect(200)

    const full = await grant(party, { type: 'card', cardId: B, quantity: 2 })
    expect(full.status).toBe(409)
    expect(full.body).toEqual({
      error: {
        code: 'LAB_GRANT_NO_SPACE',
        message: 'Não há espaço para essa doação.',
        details: { reason: 'inventoryFull' },
      },
    })

    const folder = await grant(party, { type: 'card', cardId: S, quantity: 31 })
    expect(folder.status).toBe(409)
    expect(folder.body.error.details).toEqual({ reason: 'tcgFolderFull' })

    const read = await get(party.id)
    expect(read.members[0].player.inventory).toHaveLength(9)
    expect(read.members[0].player.tcgFolder).toEqual([])
  })

  it('REQ-78: carta no inventário de um save está em uso; apagado o grupo, sai (204)', async () => {
    const party = await created()
    await grant(party, { type: 'card', cardId: K, quantity: 1 }).expect(200)

    const blocked = await request(server()).delete(`/lab/content/cards/${K}`)
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.code).toBe('CONTENT_IN_USE')

    await request(server()).delete(`/parties/${party.id}`).expect(204)
    await request(server()).delete(`/lab/content/cards/${K}`).expect(204)
  })
})
