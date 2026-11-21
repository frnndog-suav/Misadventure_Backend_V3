import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import { removePostV6Config } from '../../../../../test/factories/remove-post-v6-config'
import { createContentApp } from '../../../../../test/content-app'
import { postParty, resetCampaign } from '../../../../../test/parties-e2e'

// CONTRATO v0.46, FEAT-32: cofre, limbo, deck de recompensas e Vasculhar
// (REQ-83 a REQ-96) de ponta a ponta. O estado é montado pela doação do
// laboratório (REQ-77) e por `useVault`; só o save v5 vai direto no jsonb.

const F = 'fixture.fishing-rod'
const K = 'fixture.pickaxe'
const S = 'fixture.silver-fish'
const I = 'fixture.iron-ore'
const P = 'fixture.healing-potion'
const STR = 'fixture.strength-basic'
const END = 'fixture.endurance-basic'

type TPlayer = {
  gold: number
  hand: string[]
  zoneId: string
  moveTargets: string[]
  buildSize: number
  tcgFolder: { cardId: string; copies: number }[]
  inventory: { cardId: string; quantity: number }[]
  vault: {
    slots: { cardId: string; quantity: number }[]
    decks: { cardId: string; copies: number }[][]
    gold: number
  }
  vaultCapacity: number
  vaultDeckSlots: number
  vaultGoldCapacity: number
  scavengeTargets: string[]
  lastScavenge: {
    cardId: string
    found: boolean
    delivery: 'inventory' | 'pending' | 'left' | 'none'
  } | null
  availableActions: string[]
}

type TParty = {
  id: string
  savedAt: string
  turn: { actionPoints: number }
  members: { id: string; player: TPlayer }[]
}

const notAllowed = (details: object) => ({
  error: {
    code: 'ACTION_NOT_ALLOWED',
    message: 'Esta ação não é permitida agora.',
    details,
  },
})

const invalid = (fields: object[]) => ({
  error: {
    code: 'ACTION_INVALID',
    message: 'Ação inválida.',
    details: { fields },
  },
})

const useVault = (operations: unknown[]) => ({ type: 'useVault', operations })
const scavenge = (cardId: string) => ({ type: 'scavenge', cardId })

describe('Cofre e Vasculhar (e2e)', () => {
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

  async function startedParty(): Promise<TParty> {
    const created = await postParty(ctx.app)
    return (
      await request(server()).post(`/parties/${created.id}/session`).expect(200)
    ).body
  }

  const act = (id: string, body: unknown) =>
    request(server())
      .post(`/parties/${id}/actions`)
      .send(body as object)

  async function grant(party: TParty, body: object) {
    await request(server())
      .post(`/lab/parties/${party.id}/members/${party.members[0].id}/grants`)
      .send(body)
      .expect(200)
  }

  const give = (party: TParty, cardId: string, quantity = 1) =>
    grant(party, { type: 'card', cardId, quantity })

  const get = async (id: string): Promise<TParty> =>
    (await request(server()).get(`/parties/${id}`)).body

  const player = (party: TParty) => party.members[0].player

  async function rawState(id: string): Promise<Record<string, unknown>> {
    const db = ctx.app.get<Database>(DRIZZLE)
    const [row] = await db.select().from(parties).where(eq(parties.id, id))
    return row.state as Record<string, unknown>
  }

  async function writeState(id: string, state: object): Promise<void> {
    const db = ctx.app.get<Database>(DRIZZLE)
    await db.update(parties).set({ state }).where(eq(parties.id, id))
  }

  it('REQ-83/REQ-90/REQ-93/REQ-96: na criação, cofre vazio, capacidades da config, sem alvos, lastScavenge null e useVault na cidade', async () => {
    const created = (await postParty(ctx.app)) as unknown as TParty

    const p = player(created)
    expect(p.vault).toEqual({ slots: [], decks: [], gold: 0 })
    expect(p.vaultCapacity).toBe(30)
    expect(p.vaultDeckSlots).toBe(10)
    expect(p.vaultGoldCapacity).toBe(2000)
    expect(p.scavengeTargets).toEqual([])
    expect(p.lastScavenge).toBeNull()
    expect(p.availableActions).toEqual([
      'move',
      'recover',
      'adjustDeck',
      'useVault',
      'startEvent',
      'endTurn',
    ])
  })

  it('REQ-89: o deck de recompensas urban é gravado com a composição expandida e embaralhada, e não trafega', async () => {
    const created = await postParty(ctx.app)

    const state = await rawState(created.id)
    const decks = state.rewardDecks as { zoneType: string; cards: string[] }[]
    expect(decks).toHaveLength(1)
    expect(decks[0].zoneType).toBe('urban')
    expect([...decks[0].cards].sort()).toEqual([P, P, I, S].sort())
    expect(JSON.stringify(created)).not.toContain('rewardDecks')
  })

  it('REQ-90/REQ-93: picareta não vasculha urban; a vara de pesca dá [S] e scavenge antes de useVault', async () => {
    const party = await startedParty()

    await give(party, K)
    expect(player(await get(party.id)).scavengeTargets).toEqual([])

    await give(party, F)
    const after = player(await get(party.id))
    expect(after.scavengeTargets).toEqual([S])
    expect(after.availableActions).toEqual([
      'move',
      'recover',
      'adjustDeck',
      'scavenge',
      'useVault',
      'saveRespawnPoint',
      'startEvent',
      'endTurn',
    ])
  })

  it('REQ-91/REQ-96: o 1º Vasculhar acha S, o 2º gasta o ponto e não acha; o deck continua sem S', async () => {
    const party = await startedParty()
    await give(party, F)

    const first = await act(party.id, scavenge(S))
    expect(first.status).toBe(200)
    expect(player(first.body).inventory).toEqual([
      { cardId: F, quantity: 1 },
      { cardId: S, quantity: 1 },
    ])
    expect(player(first.body).lastScavenge).toEqual({
      cardId: S,
      found: true,
      delivery: 'inventory',
    })
    expect(first.body.turn.actionPoints).toBe(2)

    const second = await act(party.id, scavenge(S))
    expect(second.status).toBe(200)
    expect(second.body.turn.actionPoints).toBe(1)
    expect(player(second.body).inventory).toEqual([
      { cardId: F, quantity: 1 },
      { cardId: S, quantity: 1 },
    ])
    expect(player(second.body).lastScavenge).toEqual({
      cardId: S,
      found: false,
      delivery: 'none',
    })

    const saved = player(await get(party.id))
    expect(saved.lastScavenge).toEqual({
      cardId: S,
      found: false,
      delivery: 'none',
    })
    const decks = (await rawState(party.id)).rewardDecks as {
      cards: string[]
    }[]
    expect([...decks[0].cards].sort()).toEqual([P, P, I].sort())
  })

  it('REQ-92/REQ-115/REQ-116: recusa forma e alvo inválidos e persiste a escolha com inventário cheio', async () => {
    const party = await startedParty()
    await give(party, F)

    expect((await act(party.id, { type: 'scavenge' })).body).toEqual(
      invalid([{ field: 'cardId', reason: 'required' }])
    )
    expect((await act(party.id, { type: 'scavenge', cardId: 1 })).body).toEqual(
      invalid([{ field: 'cardId', reason: 'notString' }])
    )
    expect(
      (await act(party.id, { type: 'scavenge', cardId: S, x: 1 })).body
    ).toEqual(invalid([{ field: 'x', reason: 'unknownKey' }]))

    const before = await get(party.id)
    const refused = await act(party.id, scavenge(I))
    expect(refused.status).toBe(409)
    expect(refused.body).toEqual(notAllowed({ reason: 'notScavengeable' }))
    const unchanged = await get(party.id)
    expect(unchanged.savedAt).toBe(before.savedAt)
    expect(player(unchanged).lastScavenge).toBeNull()

    // Inventário cheio: 10 slots, nenhum de S (F + 9 picaretas não empilham).
    await give(party, K, 9)
    const full = await act(party.id, scavenge(S)).expect(200)
    expect(full.body).toMatchObject({
      turn: { actionPoints: 2 },
      randomEventEncounter: null,
      pendingRewards: [
        {
          cardId: S,
          origin: { type: 'rewardDeck', zoneType: 'urban' },
          source: { type: 'scavenge' },
        },
      ],
      members: [
        {
          player: {
            availableActions: ['resolveReward'],
            lastScavenge: { cardId: S, found: true, delivery: 'pending' },
          },
        },
      ],
    })
    {
      const { combatUpdates, ...snapshot } = full.body
      expect(combatUpdates).toEqual([])
      expect(await get(party.id)).toEqual(snapshot)
    }
    const left = await act(party.id, {
      type: 'resolveReward',
      rewardId: full.body.pendingRewards[0].id,
      choice: 'leave',
    }).expect(200)
    expect(left.body.pendingRewards).toEqual([])
    expect(player(left.body).lastScavenge).toEqual({
      cardId: S,
      found: true,
      delivery: 'left',
    })
    const decks = (await rawState(party.id)).rewardDecks as {
      cards: string[]
    }[]
    expect(decks[0].cards.at(-1)).toBe(S)

    await request(server()).post(`/parties/${party.id}/session/end`).expect(200)
    const idle = await act(party.id, scavenge(S))
    expect(idle.status).toBe(409)
    expect(idle.body.error.code).toBe('PARTY_SESSION_NOT_ACTIVE')
  })

  it('REQ-92: com 0 pontos → noActionPoints e scavenge/useVault fora de availableActions', async () => {
    const party = await startedParty()
    await give(party, F)
    for (let i = 0; i < 3; i++) {
      await act(party.id, { type: 'recover', option: 'drawToHand' }).expect(200)
    }

    const refused = await act(party.id, scavenge(S))
    expect(refused.status).toBe(409)
    expect(refused.body).toEqual(notAllowed({ reason: 'noActionPoints' }))
    expect(player(await get(party.id)).availableActions).toEqual(['endTurn'])
  })

  it('REQ-84/REQ-85/REQ-86: store, storeGold e discard em ordem; 1 ponto; grava', async () => {
    const party = await startedParty()
    await give(party, P, 3)
    await grant(party, { type: 'gold', amount: 100 - player(party).gold })

    const response = await act(
      party.id,
      useVault([
        { operation: 'store', cardId: P, quantity: 2 },
        { operation: 'storeGold', amount: 60 },
        { operation: 'discard', cardId: P, quantity: 1 },
      ])
    )

    expect(response.status).toBe(200)
    const p = player(response.body)
    expect(p.inventory).toEqual([{ cardId: P, quantity: 1 }])
    expect(p.vault).toEqual({
      slots: [{ cardId: P, quantity: 1 }],
      decks: [],
      gold: 60,
    })
    expect(p.gold).toBe(40)
    expect(response.body.turn.actionPoints).toBe(2)
    expect(player(await get(party.id)).vault.gold).toBe(60)
  })

  it('REQ-88: a primeira operação recusada traz operationIndex e nada muda', async () => {
    const party = await startedParty()
    await give(party, P, 3)
    await grant(party, { type: 'gold', amount: 100 - player(party).gold })
    await act(
      party.id,
      useVault([
        { operation: 'store', cardId: P, quantity: 2 },
        { operation: 'storeGold', amount: 60 },
        { operation: 'discard', cardId: P, quantity: 1 },
      ])
    ).expect(200)
    const before = await get(party.id)

    const refused = await act(
      party.id,
      useVault([
        { operation: 'takeGold', amount: 10 },
        { operation: 'take', cardId: P, quantity: 5 },
      ])
    )
    expect(refused.status).toBe(409)
    expect(refused.body).toEqual(
      notAllowed({ reason: 'notInVault', operationIndex: 1 })
    )
    const after = await get(party.id)
    expect(after.savedAt).toBe(before.savedAt)
    expect(player(after).gold).toBe(40)

    await grant(party, { type: 'gold', amount: 300 - 40 })
    const purse = await act(
      party.id,
      useVault([{ operation: 'takeGold', amount: 1 }])
    )
    expect(purse.status).toBe(409)
    expect(purse.body).toEqual(
      notAllowed({ reason: 'purseFull', operationIndex: 0 })
    )
  })

  it('REQ-87: store + editBuild refaz a build; saveDeck guarda; swapBuild abaixo do mínimo e deckNotFound recusados', async () => {
    const party = await startedParty()
    await give(party, STR, 4)

    const edited = await act(
      party.id,
      useVault([
        { operation: 'store', cardId: STR, quantity: 4 },
        {
          operation: 'editBuild',
          build: [
            { cardId: END, copies: 30 },
            { cardId: STR, copies: 32 },
          ],
        },
      ])
    )
    expect(edited.status).toBe(200)
    const p = player(edited.body)
    expect(p.buildSize).toBe(62)
    expect(p.tcgFolder).toEqual([])
    expect(p.vault.slots).toEqual([{ cardId: STR, quantity: 2 }])
    expect(p.hand).toHaveLength(7)
    expect(edited.body.turn.actionPoints).toBe(2)

    const saved = await act(
      party.id,
      useVault([{ operation: 'saveDeck', cards: [{ cardId: STR, copies: 2 }] }])
    )
    expect(saved.status).toBe(200)
    expect(player(saved.body).vault.decks).toEqual([
      [{ cardId: STR, copies: 2 }],
    ])

    const swap = await act(
      party.id,
      useVault([{ operation: 'swapBuild', deckIndex: 0 }])
    )
    expect(swap.status).toBe(409)
    expect(swap.body).toEqual(
      notAllowed({ reason: 'buildBelowMinimum', operationIndex: 0 })
    )

    const missing = await act(
      party.id,
      useVault([{ operation: 'unpackDeck', deckIndex: 3 }])
    )
    expect(missing.status).toBe(409)
    expect(missing.body).toEqual(
      notAllowed({ reason: 'deckNotFound', operationIndex: 0 })
    )
  })

  it('REQ-88: capacidades baixas no laboratório → vaultFull, vaultGoldFull e deckSlotsFull', async () => {
    await request(server())
      .patch('/lab/config')
      .send({ vaultCapacity: 1, vaultDeckSlots: 1, vaultGoldCapacity: 50 })
      .expect(200)
    const party = await startedParty()
    expect(player(party).vaultCapacity).toBe(1)
    await give(party, P)
    await give(party, K)
    await grant(party, { type: 'gold', amount: 100 - player(party).gold })
    await give(party, STR)

    expect(
      (
        await act(
          party.id,
          useVault([
            { operation: 'store', cardId: P, quantity: 1 },
            { operation: 'store', cardId: K, quantity: 1 },
          ])
        )
      ).body
    ).toEqual(notAllowed({ reason: 'vaultFull', operationIndex: 1 }))
    expect(
      (await act(party.id, useVault([{ operation: 'storeGold', amount: 51 }])))
        .body
    ).toEqual(notAllowed({ reason: 'vaultGoldFull', operationIndex: 0 }))
    expect(
      (
        await act(
          party.id,
          useVault([
            { operation: 'store', cardId: STR, quantity: 1 },
            { operation: 'saveDeck', cards: [{ cardId: STR, copies: 1 }] },
          ])
        )
      ).body
    ).toEqual(notAllowed({ reason: 'deckSlotsFull', operationIndex: 1 }))
  })

  it('REQ-88: forma inválida → 400 ACTION_INVALID com o índice da operação', async () => {
    const party = await startedParty()

    expect((await act(party.id, useVault([]))).body).toEqual(
      invalid([{ field: 'operations', reason: 'invalidLength' }])
    )
    expect(
      (
        await act(
          party.id,
          useVault([{ operation: 'store', cardId: P, quantity: 0 }])
        )
      ).body
    ).toEqual(
      invalid([
        { field: 'operations.0.quantity', reason: 'notPositiveInteger' },
      ])
    )
    expect(
      (await act(party.id, useVault([{ operation: 'pack' }]))).body
    ).toEqual(
      invalid([{ field: 'operations.0.operation', reason: 'unknownOperation' }])
    )
  })

  it('REQ-88/REQ-92/REQ-93: fora de Porto Cinzento → zoneActionUnavailable e nenhum dos dois disponível', async () => {
    const party = await startedParty()
    await give(party, F)
    await give(party, P)
    const [target] = player(party).moveTargets
    const moved = await act(party.id, { type: 'move', zoneId: target })
    expect(moved.status).toBe(200)
    expect(player(moved.body).scavengeTargets).toEqual([])
    expect(player(moved.body).availableActions).not.toContain('scavenge')
    expect(player(moved.body).availableActions).not.toContain('useVault')

    expect((await act(party.id, scavenge(S))).body).toEqual(
      notAllowed({ reason: 'zoneActionUnavailable' })
    )
    expect(
      (
        await act(
          party.id,
          useVault([{ operation: 'store', cardId: P, quantity: 1 }])
        )
      ).body
    ).toEqual(notAllowed({ reason: 'zoneActionUnavailable' }))
  })

  it('REQ-94/REQ-82: cartas no cofre e no deck de recompensas do grupo estão em uso; sem grupo, a do rewardDecks é referenciada', async () => {
    const party = await startedParty()
    await give(party, P)
    await act(
      party.id,
      useVault([{ operation: 'store', cardId: P, quantity: 1 }])
    ).expect(200)

    const inUse = await request(server()).delete(`/lab/content/cards/${P}`)
    expect(inUse.status).toBe(409)
    expect(inUse.body.error.code).toBe('CONTENT_IN_USE')

    const inDeck = await request(server()).delete(`/lab/content/cards/${S}`)
    expect(inDeck.status).toBe(409)
    expect(inDeck.body.error.code).toBe('CONTENT_IN_USE')

    await request(server()).delete(`/parties/${party.id}`).expect(204)
    const referenced = await request(server()).delete(`/lab/content/cards/${S}`)
    expect(referenced.status).toBe(409)
    expect(referenced.body.error.code).toBe('CONTENT_REFERENCED')
  })

  it('REQ-95/REQ-96/D-87: save v5 inserido à mão é lido com cofre vazio, lastScavenge null, sem deck (Vasculhar não acha) e regravado como v9', async () => {
    const party = await startedParty()
    await give(party, F)
    const state = (await rawState(party.id)) as {
      config: Record<string, number>
      members: { player: Record<string, unknown> }[]
      rewardDecks?: unknown
    }
    const config = { ...state.config }
    removePostV6Config(config)
    delete config.escapeVigorPercent
    delete config.reserveDeck
    delete config.vaultCapacity
    delete config.vaultDeckSlots
    delete config.vaultGoldCapacity
    const members = state.members.map((m) => {
      const playerState = { ...m.player }
      delete playerState.statuses
      delete playerState.vault
      delete playerState.lastScavenge
      return { ...m, player: playerState }
    })
    const legacy = { ...state, schemaVersion: 5, config, members }
    delete legacy.rewardDecks
    await writeState(party.id, legacy)

    const read = player(await get(party.id))
    expect(read.vault).toEqual({ slots: [], decks: [], gold: 0 })
    expect(read.lastScavenge).toBeNull()
    expect(read.vaultCapacity).toBe(30)
    expect(read.scavengeTargets).toEqual([S])

    const scavenged = await act(party.id, scavenge(S))
    expect(scavenged.status).toBe(200)
    expect(player(scavenged.body).lastScavenge).toEqual({
      cardId: S,
      found: false,
      delivery: 'none',
    })
    const rewritten = await rawState(party.id)
    expect(rewritten.schemaVersion).toBe(9)
    expect(rewritten.rewardDecks).toEqual([])
  })
})
