import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import type { TPartyHttp } from '@/infra/http/presenters/party-presenter'
import { createContentApp } from '../../../../../test/content-app'
import { resetCampaign, WARRIOR_BODY } from '../../../../../test/parties-e2e'

// CONTRATO FEAT-18 (v0.90): cenários "Transbordo", "Transferir", "Formato",
// "Destino pronto" e "Descarte com montaria". T-77: REQ-159, REQ-160.

const H = 'fixture.plow-horse'
const P = 'fixture.healing-potion'
const W = 'fixture.short-sword'
const STR = 'fixture.strength-basic'

type TPlayer = TPartyHttp['members'][number]['player']
const player = (party: TPartyHttp) => party.members[0].player as TPlayer

const notAllowed = (details: object) => ({
  error: {
    code: 'ACTION_NOT_ALLOWED',
    message: 'Esta ação não é permitida agora.',
    details,
  },
})

const transfer = (body: object) => ({
  type: 'prepare',
  operation: 'transferMount',
  ...body,
})

describe('FEAT-18 — Espaço da montaria e transferência (e2e, T-77)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  beforeEach(async () => {
    await resetCampaign(ctx.app)
    await request(server())
      .patch('/lab/config')
      .send({
        initialGold: 0,
        marketFactorMinPercent: 115,
        marketFactorMaxPercent: 115,
        mountInventorySlots: 1,
        inventoryCapacity: 1,
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
  const grant = (party: TPartyHttp, body: object) =>
    request(server())
      .post(`/lab/parties/${party.id}/members/${party.members[0].id}/grants`)
      .send(body)

  async function startedParty(): Promise<TPartyHttp> {
    const { id } = (
      await request(server()).post('/parties').send(WARRIOR_BODY).expect(201)
    ).body
    return (await request(server()).post(`/parties/${id}/session`).expect(200))
      .body
  }

  /** Ajusta o save no banco (como nos e2e da T-75 e T-76). */
  async function patchState(
    party: TPartyHttp,
    patch: { player?: Record<string, unknown>; party?: Record<string, unknown> }
  ) {
    const db = ctx.app.get<Database>(DRIZZLE)
    const [row] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    const state = row.state as Record<string, unknown> & {
      members: { player: Record<string, unknown> }[]
    }
    Object.assign(state.members[0].player, patch.player ?? {})
    Object.assign(state, patch.party ?? {})
    await db
      .update(parties)
      .set({ state: state as typeof row.state })
      .where(eq(parties.id, party.id))
  }

  /** Com `H` e o inventário (1 slot) ocupado por `W`. */
  async function withHorseAndSword(): Promise<TPartyHttp> {
    const party = await startedParty()
    await grant(party, { type: 'card', cardId: H, quantity: 1 }).expect(200)
    await grant(party, { type: 'card', cardId: W, quantity: 1 }).expect(200)
    return get(party)
  }

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

  it('REQ-159: Transbordo — a doação que não cabe vai ao inventário extra, empilha; sem espaço → 409 inventoryFull', async () => {
    const party = await withHorseAndSword()
    await grant(party, { type: 'card', cardId: P, quantity: 1 }).expect(200)
    await grant(party, { type: 'card', cardId: P, quantity: 1 }).expect(200)
    expect(player(await get(party)).mount?.inventory).toEqual([
      { cardId: P, quantity: 2 },
    ])

    const full = await grant(party, { type: 'card', cardId: W, quantity: 1 })
    expect(full.status).toBe(409)
    expect(full.body.error).toMatchObject({
      code: 'LAB_GRANT_NO_SPACE',
      details: { reason: 'inventoryFull' },
    })
  })

  it('REQ-160: Transferir — recusas sem efeito e transferência da pasta sem gastar PA', async () => {
    const party = await withHorseAndSword()
    await grant(party, { type: 'card', cardId: P, quantity: 2 }).expect(200)
    await patchState(party, { player: { tcgFolder: [] } })

    await expectNotAllowed(
      party,
      transfer({
        direction: 'fromMount',
        space: 'inventory',
        cardId: P,
        quantity: 2,
      }),
      { reason: 'inventoryFull' }
    )
    await expectNotAllowed(
      party,
      transfer({
        direction: 'toMount',
        space: 'tcgFolder',
        cardId: STR,
        quantity: 1,
      }),
      { reason: 'notOwned' }
    )

    await grant(party, { type: 'card', cardId: STR, quantity: 1 }).expect(200)
    const before = await get(party)
    const response = await act(
      party,
      transfer({
        direction: 'toMount',
        space: 'tcgFolder',
        cardId: STR,
        quantity: 1,
      })
    ).expect(200)
    expect(player(response.body).mount?.tcgFolder).toEqual([
      { cardId: STR, copies: 1 },
    ])
    expect(player(response.body).tcgFolder).toEqual([])
    expect(response.body.turn.actionPoints).toBe(before.turn.actionPoints)
  })

  it('REQ-160: sem montaria → 409 noMount', async () => {
    const party = await startedParty()
    await grant(party, { type: 'card', cardId: P, quantity: 1 }).expect(200)
    await expectNotAllowed(
      party,
      transfer({
        direction: 'toMount',
        space: 'inventory',
        cardId: P,
        quantity: 1,
      }),
      { reason: 'noMount' }
    )
  })

  it('REQ-160: Formato — direction desconhecida e quantity 0 → 400', async () => {
    const party = await withHorseAndSword()
    const up = await act(
      party,
      transfer({ direction: 'up', space: 'inventory', cardId: P, quantity: 1 })
    ).expect(400)
    expect(up.body.error.details).toEqual([
      { field: 'direction', reason: 'unknownOption' },
    ])
    const zero = await act(
      party,
      transfer({
        direction: 'toMount',
        space: 'inventory',
        cardId: P,
        quantity: 0,
      })
    ).expect(400)
    expect(zero.body.error.details).toEqual([
      { field: 'quantity', reason: 'notPositiveInteger' },
    ])
  })

  it('REQ-159: Destino pronto — buyStock com o inventário ocupado vai ao inventário extra; a vitrine diz o destino', async () => {
    const party = await withHorseAndSword()
    await grant(party, { type: 'gold', amount: 50 }).expect(200)
    // Antes da compra: recurso da vitrine entraria no inventário extra.
    for (const { offer } of player(await get(party)).market?.showcase ?? []) {
      if (offer && offer.cardId !== STR)
        expect(offer.destination).toMatch(/^(mountInventory|tcgFolder)$/)
    }
    const response = await act(party, {
      type: 'visitMarket',
      operations: [{ operation: 'buyStock', cardId: P, quantity: 1 }],
    }).expect(200)
    const me = player(response.body)
    expect(me.lastMarketVisit?.results[0]).toMatchObject({
      operation: 'buyStock',
      received: [{ space: 'mountInventory', quantity: 1 }],
    })
    expect(me.mount?.inventory).toEqual([{ cardId: P, quantity: 1 }])
  })

  it('REQ-159: Descarte com montaria — descartar do inventário extra; space fora do destino → 400; cópias a mais → 409', async () => {
    const party = await withHorseAndSword()
    await grant(party, { type: 'card', cardId: P, quantity: 2 }).expect(200)
    const rewardId = 'reward-t77'
    await patchState(party, {
      party: {
        pendingReward: {
          id: rewardId,
          memberId: party.members[0].id,
          cardId: P,
          origin: { type: 'fixed' },
          source: { type: 'scavenge' },
          destination: 'inventory',
          discardOptions: [
            { cardId: W, space: 'inventory', maxCopies: 1 },
            { cardId: P, space: 'mountInventory', maxCopies: 2 },
          ],
          decisionDeadlineAt: null,
        },
      },
    })
    const pending = await get(party)
    expect(pending.pendingRewards[0].discardOptions).toEqual([
      { cardId: W, space: 'inventory', maxCopies: 1 },
      { cardId: P, space: 'mountInventory', maxCopies: 2 },
    ])

    const keep = (discard: object[]) => ({
      type: 'resolveReward',
      rewardId,
      choice: 'keep',
      discard,
    })
    const wrongSpace = await act(
      party,
      keep([{ cardId: P, space: 'tcgFolder', copies: 2 }])
    ).expect(400)
    expect(wrongSpace.body.error.details).toEqual([
      { field: 'discard.0.space', reason: 'unknownOption' },
    ])
    await expectNotAllowed(
      party,
      keep([{ cardId: P, space: 'mountInventory', copies: 3 }]),
      { reason: 'rewardDoesNotFit' }
    )

    const response = await act(
      party,
      keep([{ cardId: P, space: 'mountInventory', copies: 2 }])
    ).expect(200)
    const me = player(response.body)
    expect(me.inventory).toEqual([{ cardId: W, quantity: 1 }])
    expect(me.mount?.inventory).toEqual([{ cardId: P, quantity: 1 }])
    expect(me.lastRewardDelivery?.space).toBe('mountInventory')
  })
})
