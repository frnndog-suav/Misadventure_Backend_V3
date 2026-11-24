import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'
import { postParty, resetCampaign } from '../../../../../test/parties-e2e'

// CONTRATO v0.85, FEAT-17 (T-71): Oficina do Artífice de ponta a ponta
// (REQ-153; D-133, D-134). A classe `artificer` entra só na cópia do conteúdo
// deste teste (a `warrior` renomeada, com a trava cumprida). A quebra é forçada
// pelo laboratório (limiar 21, quebra a partir de +1 e bônus do Artífice 0).

const W = 'fixture.short-sword'
const ORE = 'fixture.iron-ore'

type TState = {
  refinement: number
  enchantments: unknown[]
  repairMarks: number
  broken: boolean
}

type TService = {
  equipment: {
    target: unknown
    cardId: string
    state: TState
    repair: { gold: number } | null
    refineSteps: Record<string, unknown>[]
    enchantOptions: unknown[]
  }[]
}

type TPlayer = {
  gold: number
  zoneId: string
  inventory: { cardId: string; quantity: number; equipmentState?: TState }[]
  availableActions: string[]
  moveTargets: string[]
  blacksmith: {
    zoneId: string | null
    blacksmith: TService | null
    workshop: TService | null
    enchantments: unknown[]
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

const workshop = (...operations: unknown[]) => ({
  type: 'artificerWorkshop',
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

describe('Oficina do Artífice (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp(async (root) => {
      const file = join(root, 'fixture', 'class.json')
      const classes = JSON.parse(await readFile(file, 'utf8')) as {
        playerClass: string
        name: string
      }[]
      // Atributos essenciais não se repetem entre classes: o Guerreiro vira Artífice.
      const renamed = classes.map((c) =>
        c.playerClass === 'warrior'
          ? { ...c, playerClass: 'artificer', name: 'Artífice' }
          : c
      )
      await writeFile(file, JSON.stringify(renamed))
    })
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

  const act = (id: string, body: unknown) =>
    request(server())
      .post(`/parties/${id}/actions`)
      .send(body as object)

  const get = async (id: string): Promise<TParty> =>
    (await request(server()).get(`/parties/${id}`)).body

  const player = (party: TParty) => party.members[0].player

  /** Espada no slot 0, 3 minérios no slot 1 e 100 de ouro. */
  async function stocked(playerClass = 'artificer'): Promise<TParty> {
    const created = await postParty(ctx.app, {
      name: 'Os Teimosos',
      characterName: 'Lia',
      playerClass,
    })
    const party: TParty = (
      await request(server()).post(`/parties/${created.id}/session`).expect(200)
    ).body
    const grant = (body: object) =>
      request(server())
        .post(`/lab/parties/${party.id}/members/${party.members[0].id}/grants`)
        .send(body)
        .expect(200)
    await grant({ type: 'card', cardId: W, quantity: 1 })
    await grant({ type: 'card', cardId: ORE, quantity: 3 })
    await grant({ type: 'gold', amount: 100 })
    return get(party.id)
  }

  it('REQ-153: Artífice ativo → artificerWorkshop logo depois de adjustDeck (sem missão a abandonar); projeção da Oficina com teto +6 e sem encantar', async () => {
    const p = player(await stocked())

    expect(p.availableActions.indexOf('artificerWorkshop')).toBe(
      p.availableActions.indexOf('adjustDeck') + 1
    )
    const sword = p.blacksmith?.workshop?.equipment[0]
    expect(sword).toMatchObject({
      target: inv(0),
      cardId: W,
      state: DEFAULT_STATE,
      repair: null,
      enchantOptions: [],
    })
    expect(sword?.refineSteps.map((step) => step.targetLevel)).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
    expect(sword?.refineSteps[0]).toMatchObject({ d20Bonus: 2 })
    expect(p.blacksmith?.blacksmith?.equipment[0].refineSteps).toHaveLength(10)
  })

  it('REQ-153: gasta 1 PA, é repetível; conserto com 50% de desconto (⌈5 × 50%⌉ = 3) soma 1 marca; lastBlacksmithVisit com source workshop', async () => {
    await request(server())
      .patch('/lab/config')
      .send({
        refineThreshold1to3: 21,
        refineBreakFromLevel: 1,
        artificerD20Bonus: 0,
      })
      .expect(200)
    const party = await stocked()
    const points = party.turn.actionPoints

    const broke = await act(
      party.id,
      workshop({ operation: 'refine', target: inv(0) })
    ).expect(200)
    expect(broke.body.turn.actionPoints).toBe(points - 1)
    expect(player(broke.body).inventory[0].equipmentState).toEqual({
      ...DEFAULT_STATE,
      broken: true,
    })
    expect(
      player(broke.body).blacksmith?.workshop?.equipment[0].repair
    ).toEqual({ gold: 3 })

    const repaired = await act(
      party.id,
      workshop({ operation: 'repair', target: inv(0) })
    ).expect(200)
    const p = player(repaired.body)
    expect(repaired.body.turn.actionPoints).toBe(points - 2)
    expect(p.gold).toBe(87)
    expect(p.inventory[0].equipmentState).toEqual({
      ...DEFAULT_STATE,
      repairMarks: 1,
    })
    expect(p.lastBlacksmithVisit).toEqual({
      source: 'workshop',
      zoneId: p.zoneId,
      actionPointsSpent: 1,
      results: [
        {
          operation: 'repair',
          target: inv(0),
          cardId: W,
          gold: -3,
          repairMarks: 1,
          skipped: false,
        },
      ],
    })
  })

  it('REQ-153: enchant → enchantNotAvailable; acima do teto → refineLevelTooHigh; nada muda', async () => {
    await request(server())
      .patch('/lab/config')
      .send({ artificerMaxRefineLevel: 0 })
      .expect(200)
    const party = await stocked()
    const before = await get(party.id)

    expect(
      (
        await act(
          party.id,
          workshop({
            operation: 'enchant',
            target: inv(0),
            enchantmentId: 'ember-edge',
          })
        ).expect(409)
      ).body
    ).toEqual(notAllowed({ reason: 'enchantNotAvailable', operationIndex: 0 }))
    expect(
      (
        await act(
          party.id,
          workshop({ operation: 'refine', target: inv(0) })
        ).expect(409)
      ).body
    ).toEqual(
      notAllowed({
        reason: 'refineLevelTooHigh',
        cardId: W,
        operationIndex: 0,
      })
    )
    expect(await get(party.id)).toEqual(before)
  })

  it('REQ-153: vale fora da zona com ferreiro (zoneId da zona atual, sem encantamentos)', async () => {
    const party = await stocked()
    await act(party.id, {
      type: 'move',
      zoneId: player(party).moveTargets[0],
    }).expect(200)
    const moved = player(await get(party.id))
    expect(moved.availableActions).toContain('artificerWorkshop')
    expect(moved.blacksmith).toMatchObject({
      zoneId: null,
      blacksmith: null,
      enchantments: [],
    })

    const res = await act(
      party.id,
      workshop({ operation: 'refine', target: inv(0) })
    ).expect(200)
    expect(player(res.body).lastBlacksmithVisit).toMatchObject({
      source: 'workshop',
      zoneId: moved.zoneId,
    })
  })

  it('REQ-153: sem Artífice ativo → artificerInactive, e a ação não aparece', async () => {
    const party = await stocked('rogue')
    expect(player(party).availableActions).not.toContain('artificerWorkshop')
    expect(player(party).blacksmith?.workshop).toBeNull()

    expect(
      (
        await act(
          party.id,
          workshop({ operation: 'refine', target: inv(0) })
        ).expect(409)
      ).body
    ).toEqual(notAllowed({ reason: 'artificerInactive' }))
  })
})
