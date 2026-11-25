import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import type { TPartyHttp } from '@/infra/http/presenters/party-presenter'
import { createContentApp } from '../../../../../test/content-app'
import { resetCampaign, WARRIOR_BODY } from '../../../../../test/parties-e2e'

// CONTRATO FEAT-18 (v0.90): cenários "Estábulo", "Estábulo recusado" e "Vender com conteúdo".
// T-76: REQ-158.

const H = 'fixture.plow-horse'
const MINE = 'fixture.old-mine'

type TPlayer = TPartyHttp['members'][number]['player']
const player = (party: TPartyHttp) => party.members[0].player as TPlayer

const notAllowed = (details: object) => ({
  error: {
    code: 'ACTION_NOT_ALLOWED',
    message: 'Esta ação não é permitida agora.',
    details,
  },
})

const visitMarket = (...operations: object[]) => ({
  type: 'visitMarket',
  operations,
})

describe('FEAT-18 — Estábulo (e2e, T-76)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  beforeEach(async () => {
    await resetCampaign(ctx.app)
    // Bolsa maior para os 400 do cenário do contrato (a padrão é 300).
    await request(server())
      .patch('/lab/config')
      .send({
        initialGold: 0,
        purseCapacity: 1000,
        marketFactorMinPercent: 115,
        marketFactorMaxPercent: 115,
      })
      .expect(200)
  })

  afterAll(async () => {
    await ctx?.close()
  })

  const server = () => ctx.app.getHttpServer()
  const act = (party: TPartyHttp, body: object) =>
    request(server()).post(`/parties/${party.id}/actions`).send(body)
  const get = async (party: TPartyHttp): Promise<TPartyHttp> =>
    (await request(server()).get(`/parties/${party.id}`).expect(200)).body
  const grantGold = (party: TPartyHttp, amount: number) =>
    request(server())
      .post(`/lab/parties/${party.id}/members/${party.members[0].id}/grants`)
      .send({ type: 'gold', amount })
      .expect(200)

  async function startedParty(): Promise<TPartyHttp> {
    const { id } = (
      await request(server()).post('/parties').send(WARRIOR_BODY).expect(201)
    ).body
    return (await request(server()).post(`/parties/${id}/session`).expect(200))
      .body
  }

  /** O mapa é sorteado: o save é ajustado no banco (como no e2e da T-75). */
  async function patchPlayer(
    party: TPartyHttp,
    patch: Record<string, unknown>
  ) {
    const db = ctx.app.get<Database>(DRIZZLE)
    const [row] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    const state = row.state as {
      members: { player: Record<string, unknown> }[]
    }
    Object.assign(state.members[0].player, patch)
    await db
      .update(parties)
      .set({ state: state as typeof row.state })
      .where(eq(parties.id, party.id))
  }

  async function atMine(gold: number): Promise<TPartyHttp> {
    const party = await startedParty()
    await patchPlayer(party, { zoneId: MINE })
    if (gold > 0) await grantGold(party, gold)
    return get(party)
  }

  it('REQ-158: com algo na montaria → sellable false e sellMount 409 mountNotEmpty; nada muda', async () => {
    const party = await atMine(0)
    await patchPlayer(party, {
      mount: {
        cardId: H,
        inventory: [],
        tcgFolder: [{ cardId: 'fixture.strength-basic', copies: 1 }],
      },
    })
    expect(player(await get(party)).market?.stable?.currentMount).toEqual({
      cardId: H,
      price: 140,
      sellable: false,
    })

    await expectNotAllowed(party, visitMarket({ operation: 'sellMount' }), {
      reason: 'mountNotEmpty',
      operationIndex: 0,
      cardId: H,
    })
  })

  async function expectNotAllowed(
    party: TPartyHttp,
    action: object,
    details: object
  ) {
    const before = await get(party)
    const response = await act(party, action).expect(409)
    expect(response.body).toEqual(notAllowed(details))
    expect(await get(party)).toEqual(before)
  }

  it('REQ-158: Porto Cinzento — stable null e buyMount → 409 mountNotOffered; nada muda', async () => {
    const party = await startedParty()
    expect(player(party).market?.stable).toBeNull()

    await expectNotAllowed(
      party,
      visitMarket({ operation: 'buyMount', cardId: H }),
      { reason: 'mountNotOffered', operationIndex: 0, cardId: H }
    )
  })

  it('REQ-158: Mina Velha com 400 — oferta a 322; compra → gold 78, montaria vazia, lastMarketVisit e currentMount a 140', async () => {
    const party = await atMine(400)
    expect(player(party).market?.stable).toEqual({
      offers: [{ cardId: H, price: 322 }],
      currentMount: null,
    })

    const response = await act(
      party,
      visitMarket({ operation: 'buyMount', cardId: H })
    ).expect(200)

    const p = player(response.body)
    expect(p.gold).toBe(78)
    expect(p.mount).toMatchObject({ cardId: H, inventory: [], tcgFolder: [] })
    expect(p.lastMarketVisit).toEqual({
      zoneId: MINE,
      results: [{ operation: 'buyMount', cardId: H, gold: -322 }],
      goldLost: 0,
    })
    expect(p.market?.stable?.currentMount).toEqual({
      cardId: H,
      price: 140,
      sellable: true,
    })
    expect(player(await get(party)).mount).toEqual(p.mount)
  })

  it('REQ-158: com montaria → buyMount 409 mountAlreadyOwned; sem montaria → sellMount 409 noMount; ouro insuficiente → notEnoughGold', async () => {
    const poor = await atMine(321)
    await expectNotAllowed(
      poor,
      visitMarket({ operation: 'buyMount', cardId: H }),
      { reason: 'notEnoughGold', operationIndex: 0, cardId: H }
    )
    await expectNotAllowed(poor, visitMarket({ operation: 'sellMount' }), {
      reason: 'noMount',
      operationIndex: 0,
    })

    await grantGold(poor, 1)
    await act(poor, visitMarket({ operation: 'buyMount', cardId: H })).expect(
      200
    )
    await expectNotAllowed(
      poor,
      visitMarket({ operation: 'buyMount', cardId: H }),
      { reason: 'mountAlreadyOwned', operationIndex: 0, cardId: H }
    )
  })

  it('REQ-158: vender e comprar no mesmo lote → gold −322 +140, montaria vazia de novo', async () => {
    const party = await atMine(400)
    await act(party, visitMarket({ operation: 'buyMount', cardId: H })).expect(
      200
    )
    await grantGold(party, 300)

    const response = await act(
      party,
      visitMarket(
        { operation: 'sellMount' },
        { operation: 'buyMount', cardId: H }
      )
    ).expect(200)

    const p = player(response.body)
    expect(p.gold).toBe(378 + 140 - 322)
    expect(p.mount).toMatchObject({ cardId: H, inventory: [], tcgFolder: [] })
    expect(p.lastMarketVisit?.results).toEqual([
      { operation: 'sellMount', cardId: H, gold: 140 },
      { operation: 'buyMount', cardId: H, gold: -322 },
    ])
  })

  it('REQ-158: venda com a bolsa quase cheia → ouro acima da bolsa perdido; a montaria sai', async () => {
    const party = await atMine(400)
    await act(party, visitMarket({ operation: 'buyMount', cardId: H })).expect(
      200
    )
    await grantGold(party, 1000 - 78 - 50)

    const response = await act(
      party,
      visitMarket({ operation: 'sellMount' })
    ).expect(200)

    const p = player(response.body)
    expect(p.gold).toBe(1000)
    expect(p.mount).toBeNull()
    expect(p.lastMarketVisit).toEqual({
      zoneId: MINE,
      results: [{ operation: 'sellMount', cardId: H, gold: 140 }],
      goldLost: 90,
    })
    expect(p.market?.stable?.currentMount).toBeNull()
  })

  it('REQ-158: forma — buyMount sem cardId e sellMount com campo extra → 400 ACTION_INVALID', async () => {
    const party = await atMine(0)

    const response = await act(
      party,
      visitMarket({ operation: 'buyMount' }, { operation: 'sellMount', x: 1 })
    ).expect(400)

    expect(response.body.error.code).toBe('ACTION_INVALID')
  })
})
