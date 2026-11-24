import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'
import { postParty, resetCampaign } from '../../../../../test/parties-e2e'

// CONTRATO v0.85, FEAT-17 (T-69): Ir ao Ferreiro de ponta a ponta (REQ-149,
// REQ-150, REQ-152). Refino de +0 a +1 tem limiar 0 (sem rolagem); a quebra é
// forçada pelo laboratório (limiar 21 e quebra a partir de +1), sem depender do
// sorteio. O estado é montado pela doação (REQ-77).

const W = 'fixture.short-sword'
const ORE = 'fixture.iron-ore'
const BP = 'fixture.sword-blueprint'

type TState = {
  refinement: number
  enchantments: unknown[]
  repairMarks: number
  broken: boolean
}

type TPlayer = {
  gold: number
  inventory: { cardId: string; quantity: number; equipmentState?: TState }[]
  availableActions: string[]
  blacksmith: {
    zoneId: string | null
    blacksmith: {
      equipment: {
        target: unknown
        cardId: string
        state: TState
        repair: { gold: number } | null
        refineSteps: Record<string, unknown>[]
        enchantOptions: unknown[]
      }[]
    } | null
    workshop: unknown
    enchantments: Record<string, unknown>[]
    recipes: Record<string, unknown>[]
  } | null
  lastBlacksmithVisit: {
    source: string
    zoneId: string
    actionPointsSpent: number
    results: Record<string, unknown>[]
  } | null
}

type TParty = {
  id: string
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

const visit = (...operations: unknown[]) => ({
  type: 'visitBlacksmith',
  operations,
})
const inv = (inventorySlotIndex: number) => ({
  location: 'inventory',
  inventorySlotIndex,
})
const DEFAULT_STATE = {
  refinement: 0,
  enchantments: [],
  repairMarks: 0,
  broken: false,
}

describe('Ir ao Ferreiro (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  beforeEach(async () => {
    await resetCampaign(ctx.app)
    await request(server())
      .patch('/lab/config')
      .send({ initialGold: 0 })
      .expect(200)
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

  /** Espada no slot 0, 3 minérios no slot 1, projeto no slot 2 e 100 de ouro. */
  async function stocked(): Promise<TParty> {
    const party = await startedParty()
    await give(party, W)
    await give(party, ORE, 3)
    await give(party, BP)
    await grant(party, { type: 'gold', amount: 100 })
    return get(party.id)
  }

  it('REQ-149: na cidade, visitBlacksmith antes de visitMarket; projeção com refineSteps, encantamentos da zona e receitas; lastBlacksmithVisit null', async () => {
    const party = await stocked()
    const p = player(party)

    expect(p.availableActions).toEqual(
      expect.arrayContaining(['visitBlacksmith', 'visitMarket'])
    )
    expect(p.availableActions.indexOf('visitBlacksmith')).toBe(
      p.availableActions.indexOf('visitMarket') - 1
    )
    expect(p.lastBlacksmithVisit).toBeNull()
    expect(p.inventory[0]).toEqual({
      cardId: W,
      quantity: 1,
      equipmentState: DEFAULT_STATE,
    })
    expect(p.blacksmith?.zoneId).toBe('fixture.gray-harbor')
    expect(p.blacksmith?.workshop).toBeNull()
    expect(p.blacksmith?.enchantments).toEqual([
      {
        enchantment: expect.objectContaining({ id: 'ember-edge' }),
        gold: 50,
        threshold: 10,
      },
    ])
    const sword = p.blacksmith?.blacksmith?.equipment[0]
    expect(sword).toMatchObject({
      target: inv(0),
      cardId: W,
      state: DEFAULT_STATE,
      repair: null,
      enchantOptions: [],
    })
    expect(sword?.refineSteps).toHaveLength(10)
    expect(sword?.refineSteps.slice(0, 2)).toEqual([
      {
        targetLevel: 1,
        materials: [{ cardId: ORE, quantity: 1 }],
        gold: 10,
        threshold: 0,
        d20Bonus: 0,
        breaksOnFailure: false,
      },
      {
        targetLevel: 2,
        materials: [{ cardId: ORE, quantity: 1 }],
        gold: 20,
        threshold: 0,
        d20Bonus: 0,
        breaksOnFailure: false,
      },
    ])
    expect(p.blacksmith?.recipes).toEqual([
      {
        inventorySlotIndex: 2,
        cardId: BP,
        equipmentId: W,
        materials: [{ cardId: ORE, quantity: 2 }],
        gold: 15,
        consumed: false,
        canCraft: true,
      },
    ])
  })

  it('REQ-150, REQ-152: refinar +0 → +1 (sem rolagem) e criar; gasta todos os PA e grava o resultado', async () => {
    const party = await stocked()
    const points = party.turn.actionPoints

    const res = await act(
      party.id,
      visit(
        { operation: 'refine', target: inv(0) },
        { operation: 'craft', inventorySlotIndex: 2 }
      )
    ).expect(200)

    const p = player(res.body)
    expect(res.body.turn.actionPoints).toBe(0)
    expect(p.gold).toBe(100 - 10 - 15)
    expect(p.inventory).toEqual([
      {
        cardId: W,
        quantity: 1,
        equipmentState: { ...DEFAULT_STATE, refinement: 1 },
      },
      { cardId: BP, quantity: 1 },
      { cardId: W, quantity: 1, equipmentState: DEFAULT_STATE },
    ])
    expect(p.lastBlacksmithVisit).toEqual({
      source: 'blacksmith',
      zoneId: 'fixture.gray-harbor',
      actionPointsSpent: points,
      results: [
        {
          operation: 'refine',
          target: inv(0),
          cardId: W,
          targetLevel: 1,
          gold: -10,
          roll: null,
          d20Bonus: 0,
          threshold: 0,
          success: true,
          broke: false,
          skipped: false,
        },
        {
          operation: 'craft',
          recipeCardId: BP,
          equipmentId: W,
          gold: -15,
          inventorySlotIndex: 2,
          skipped: false,
        },
      ],
    })
    expect(p.availableActions).not.toContain('visitBlacksmith')
    expect(player(await get(party.id)).lastBlacksmithVisit).toEqual(
      p.lastBlacksmithVisit
    )
  })

  it('REQ-150, D-132: falha que quebra deixa o 2º refino skipped, sem custo; na vez seguinte, consertar custa 5 + 2 × nível e marca 1 reparo', async () => {
    await request(server())
      .patch('/lab/config')
      .send({ refineThreshold1to3: 21, refineBreakFromLevel: 1 })
      .expect(200)
    const party = await stocked()

    const res = await act(
      party.id,
      visit(
        { operation: 'refine', target: inv(0) },
        { operation: 'refine', target: inv(0) }
      )
    ).expect(200)

    const p = player(res.body)
    expect(p.gold).toBe(90)
    expect(p.inventory[0].equipmentState).toEqual({
      ...DEFAULT_STATE,
      broken: true,
    })
    expect(p.inventory[1]).toEqual({ cardId: ORE, quantity: 2 })
    const [first, second] = p.lastBlacksmithVisit?.results ?? []
    expect(first).toMatchObject({
      threshold: 21,
      success: false,
      broke: true,
      gold: -10,
      skipped: false,
    })
    expect(first.roll).toEqual(expect.any(Number))
    expect(second).toMatchObject({ gold: 0, skipped: true, success: false })

    await act(party.id, { type: 'endTurn' }).expect(200)
    const before = await get(party.id)
    expect(player(before).blacksmith?.blacksmith?.equipment[0]).toMatchObject({
      repair: { gold: 5 },
      refineSteps: [],
    })
    const repaired = await act(
      party.id,
      visit({ operation: 'repair', target: inv(0) })
    ).expect(200)
    expect(player(repaired.body).gold).toBe(85)
    expect(player(repaired.body).inventory[0].equipmentState).toEqual({
      ...DEFAULT_STATE,
      repairMarks: 1,
    })
  })

  it('REQ-149: recusa com o índice da operação, sem gastar PA, ouro, cartas nem RNG', async () => {
    const party = await stocked()
    const before = await get(party.id)

    const res = await act(
      party.id,
      visit(
        { operation: 'refine', target: inv(0) },
        { operation: 'repair', target: inv(0) }
      )
    ).expect(409)

    expect(res.body).toEqual(
      notAllowed({ reason: 'notBroken', cardId: W, operationIndex: 1 })
    )
    expect(await get(party.id)).toEqual(before)
  })

  it('CONTRATO FEAT-17: alvo inexistente → equipmentNotFound; encantar ainda recusado (D-138); forma inválida → 400', async () => {
    const party = await stocked()

    expect(
      (
        await act(
          party.id,
          visit({
            operation: 'refine',
            target: { location: 'equipment', slot: 'weapon' },
          })
        ).expect(409)
      ).body
    ).toEqual(notAllowed({ reason: 'equipmentNotFound', operationIndex: 0 }))
    expect(
      (
        await act(
          party.id,
          visit({
            operation: 'enchant',
            target: inv(0),
            enchantmentId: 'ember-edge',
          })
        ).expect(409)
      ).body
    ).toEqual(
      notAllowed({
        reason: 'enchantmentNotOffered',
        cardId: W,
        operationIndex: 0,
      })
    )
    expect((await act(party.id, visit()).expect(400)).body).toEqual(
      invalid([{ field: 'operations', reason: 'invalidLength' }])
    )
  })

  it('REQ-149: fora de zona com ferreiro → zoneActionUnavailable', async () => {
    const party = await stocked()
    const zones = (await request(server()).get(`/parties/${party.id}`)).body
      .members[0].player.moveTargets as string[]
    await act(party.id, { type: 'move', zoneId: zones[0] }).expect(200)

    expect(
      (await act(party.id, visit({ operation: 'refine', target: inv(0) }))).body
    ).toEqual(notAllowed({ reason: 'zoneActionUnavailable' }))
  })
})
