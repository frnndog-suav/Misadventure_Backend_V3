import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import { createContentApp } from '../../../../../test/content-app'
import { postParty, resetCampaign } from '../../../../../test/parties-e2e'

const traveler = 'fixture.wounded-traveler'
const strength = 'fixture.strength-basic'
const endurance = 'fixture.endurance-basic'
const ore = 'fixture.iron-ore'
const potion = 'fixture.healing-potion'

describe('Eventos aleatórios (HTTP e save)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp(async (root) => {
      const path = join(root, 'fixture', 'randomEvent.json')
      const [card] = JSON.parse(await readFile(path, 'utf8'))
      await writeFile(
        path,
        JSON.stringify([
          {
            ...card,
            requirements: [
              {
                id: 'discard',
                text: 'Descarte duas cartas.',
                kind: 'discardFromHand',
                requirements: [{ attribute: 'any', count: 2 }],
                excludeAttributes: [],
                constraint: 'none',
                random: true,
              },
              {
                id: 'min',
                text: 'Vigor mínimo 5.',
                kind: 'minimum',
                stat: 'vigor',
                value: 5,
              },
            ],
            goodOutcome: {
              text: 'Compre duas recompensas.',
              steps: [{ type: 'drawRewards', count: 2 }],
            },
          },
        ])
      )
    })
  })

  beforeEach(async () => {
    await resetCampaign(ctx.app)
  })

  afterAll(async () => {
    await ctx.close()
  })

  const server = () => ctx.app.getHttpServer()
  const db = () => ctx.app.get<Database>(DRIZZLE)
  const act = (id: string, body: object) =>
    request(server()).post(`/parties/${id}/actions`).send(body)
  const get = (id: string) => request(server()).get(`/parties/${id}`)

  async function stored(id: string) {
    const [row] = await db().select().from(parties).where(eq(parties.id, id))
    return row
  }

  async function setup(vigor: number, firstRoll = 11) {
    await request(server())
      .patch('/lab/config')
      .send({
        actionPointsPerTurn: 1,
        inventoryCapacity: 1,
        reserveDeck: [{ type: 'card', cardId: potion, weight: 1 }],
      })
      .expect(200)
    const { id } = await postParty(ctx.app)
    await request(server()).post(`/parties/${id}/session`).expect(200)
    const row = await stored(id)
    const state = row.state as {
      members: { id: string; player: Record<string, unknown> }[]
    }
    const handCopies = [
      { copyId: 'h1', cardId: strength },
      { copyId: 'h2', cardId: strength },
      { copyId: 'h3', cardId: endurance },
    ]
    await db()
      .update(parties)
      .set({
        state: {
          ...state,
          rngState: [0, 0, 0, firstRoll - 1],
          members: state.members.map((member) => ({
            ...member,
            player: {
              ...member.player,
              vigor,
              hand: handCopies.map(({ cardId }) => cardId),
              handCopies,
              inventory: [{ cardId: 'fixture.silver-fish', quantity: 2 }],
            },
          })),
          rewardDecks: [{ zoneType: 'urban', cards: [ore] }],
        },
      })
      .where(eq(parties.id, id))
    return id
  }

  async function reveal(id: string) {
    const started = await act(id, { type: 'startEvent' }).expect(200)
    const encounterId: string = started.body.randomEventEncounter.id
    expect(started.body).toMatchObject({
      turn: { actionPoints: 0 },
      randomEventEncounter: {
        phase: 'anticipation',
        card: null,
        requirements: [],
        escape: null,
        decisionDeadlineAt: null,
      },
      members: [{ player: { availableActions: ['revealEvent'] } }],
    })
    expect(started.body).not.toHaveProperty('eventDecks')
    expect((await get(id).expect(200)).body).toEqual(started.body)
    await act(id, { type: 'endTurn' })
      .expect(409)
      .expect(({ body }) =>
        expect(body.error.details.reason).toBe('choicePending')
      )
    await act(id, { type: 'revealEvent', encounterId: 'obsolete' })
      .expect(409)
      .expect(({ body }) =>
        expect(body.error.details.reason).toBe('staleEncounter')
      )
    const revealed = await act(id, { type: 'revealEvent', encounterId }).expect(
      200
    )
    expect(revealed.body.randomEventEncounter).toMatchObject({
      id: encounterId,
      phase: 'encounter',
      card: { id: traveler },
    })
    return {
      type: 'payEventRequirement',
      encounterId,
      requirementId: 'discard',
    }
  }

  it('REQ-111/REQ-116: lê save v7, estabiliza IDs de cópia e inicializa o deck sem avançar o RNG', async () => {
    const id = await setup(5)
    const row = await stored(id)
    const legacy = {
      ...(row.state as Record<string, unknown>),
      schemaVersion: 7,
    } as Record<string, unknown>
    delete legacy.eventDecks
    delete legacy.eventEncounter
    delete legacy.pendingReward
    delete legacy.rewardSequence
    const config = legacy.config as Record<string, unknown>
    delete config.escapeVigorPercent
    delete config.reserveDeck
    const members = legacy.members as { player: Record<string, unknown> }[]
    const player = members[0].player
    delete player.handCopies
    delete player.handCopySequence
    delete player.nextTurnActionPointDebt
    delete player.lastRandomEvent
    delete player.lastRewardSearch
    delete player.lastRewardDelivery
    player.lastScavenge = { cardId: ore, found: true }
    await db().update(parties).set({ state: legacy }).where(eq(parties.id, id))

    const read = await get(id).expect(200)
    expect(read.body).toMatchObject({
      randomEventEncounter: null,
      pendingRewards: [],
      members: [
        {
          player: {
            lastRandomEvent: null,
            lastRewardDelivery: null,
            lastRewardSearch: null,
            nextTurnActionPointDebt: 0,
            lastScavenge: { cardId: ore, found: true, delivery: 'inventory' },
          },
        },
      ],
    })
    const migrated = read.body.members[0].player
    const copies = migrated.handCopies as { copyId: string; cardId: string }[]
    expect(copies.map(({ cardId }) => cardId)).toEqual(migrated.hand)
    expect(new Set(copies.map(({ copyId }) => copyId)).size).toBe(3)
    expect(migrated.availableActions.slice(-2)).toEqual([
      'startEvent',
      'endTurn',
    ])
    expect((await get(id).expect(200)).body).toEqual(read.body)
    await reveal(id)
    expect(await stored(id)).toMatchObject({
      state: {
        rngState: legacy.rngState,
        config: { escapeVigorPercent: 20, reserveDeck: expect.any(Array) },
      },
    })
  })

  it('REQ-111/REQ-112/REQ-113/REQ-116: recarrega a fase e o recibo e reverte o sorteio da última parte recusada', async () => {
    const id = await setup(4)
    const pay = await reveal(id)
    await act(id, { ...pay, payment: { handCards: ['h2'] } })
      .expect(409)
      .expect(({ body }) =>
        expect(body.error.details.reason).toBe('paymentInvalid')
      )
    const paid = await act(id, pay).expect(200)
    const encounter = paid.body.randomEventEncounter
    expect(encounter.payments).toEqual([
      {
        requirementId: 'discard',
        handCards: [
          {
            copyId: 'h2',
            cardId: strength,
          },
        ],
      },
    ])
    expect(encounter.requirements[0]).toMatchObject({
      status: 'partial',
      remaining: { copies: 1 },
      handCardSelection: 'random',
      eligibleHandCopyIds: [],
    })
    expect(paid.body.members[0].player.handCopies).toHaveLength(2)
    expect((await get(id).expect(200)).body).toEqual(paid.body)
    const before = await stored(id)
    await act(id, pay)
      .expect(409)
      .expect(({ body }) => {
        expect(body.error).toMatchObject({
          code: 'ACTION_NOT_ALLOWED',
          details: {
            reason: 'eventMinimumNotMet',
            checks: [
              { requirementId: 'min', stat: 'vigor', minimum: 5, actual: 4 },
            ],
          },
        })
      })
    expect(await stored(id)).toEqual(before)
    expect((await get(id).expect(200)).body).toEqual(paid.body)
    const gaveUp = await act(id, {
      type: 'giveUpEvent',
      encounterId: pay.encounterId,
    }).expect(200)
    expect(gaveUp.body.members[0].player.lastRandomEvent).toMatchObject({
      resolution: 'setback',
      cause: 'gaveUp',
      payments: encounter.payments,
      replacement: { requested: 1, drawn: 1 },
    })
  })

  it.each([
    { roll: 10, resolution: 'setback', debt: 1 },
    { roll: 11, resolution: 'escaped', debt: 0 },
  ])(
    'REQ-114/REQ-116: persiste fuga com rolagem $roll e dívida $debt',
    async ({ roll, resolution, debt }) => {
      const id = await setup(6, roll)
      const pay = await reveal(id)
      await act(id, { type: 'resolveEvent', encounterId: pay.encounterId })
        .expect(409)
        .expect(({ body }) =>
          expect(body.error.details.reason).toBe('requirementsNotPaid')
        )
      const escaped = await act(id, {
        type: 'escapeEvent',
        encounterId: pay.encounterId,
      }).expect(200)
      expect(escaped.body).toMatchObject({
        randomEventEncounter: null,
        members: [
          {
            player: {
              vigor: 4,
              nextTurnActionPointDebt: debt,
              lastRandomEvent: {
                resolution,
                escape: {
                  vigorSpent: 2,
                  naturalRoll: roll,
                  total: roll,
                  threshold: 10,
                  succeeded: roll > 10,
                  actionPointsLost: 0,
                  nextTurnActionPointDebtAdded: debt,
                },
              },
            },
          },
        ],
      })
      expect((await get(id).expect(200)).body).toEqual(escaped.body)
      const next = await act(id, { type: 'endTurn' }).expect(200)
      expect(next.body.turn.actionPoints).toBe(1 - debt)
      expect(next.body.members[0].player.nextTurnActionPointDebt).toBe(0)
    }
  )

  it('REQ-114/REQ-115/REQ-116: retoma o desfecho da escolha salva e só consome uma resolução concorrente', async () => {
    const id = await setup(5)
    const pay = await reveal(id)
    await act(id, pay).expect(200)
    const paused = await act(id, pay).expect(200)
    expect(paused.body).toMatchObject({
      randomEventEncounter: { phase: 'success' },
      members: [{ player: { availableActions: ['resolveReward'] } }],
      pendingRewards: [
        {
          cardId: ore,
          origin: { type: 'rewardDeck', zoneType: 'urban' },
          source: { type: 'randomEvent', encounterId: pay.encounterId },
          discardOptions: [{ cardId: 'fixture.silver-fish', maxCopies: 2 }],
          decisionDeadlineAt: null,
        },
      ],
    })
    expect((await get(id).expect(200)).body).toEqual(paused.body)
    const keep = {
      type: 'resolveReward',
      rewardId: paused.body.pendingRewards[0].id,
      choice: 'keep',
    }
    const before = await stored(id)
    await act(id, {
      ...keep,
      discard: [{ cardId: 'fixture.silver-fish', copies: 1 }],
    })
      .expect(409)
      .expect(({ body }) =>
        expect(body.error.details.reason).toBe('rewardDoesNotFit')
      )
    expect(await stored(id)).toEqual(before)

    const intent = {
      ...keep,
      discard: [{ cardId: 'fixture.silver-fish', copies: 2 }],
    }
    const results = await Promise.all([act(id, intent), act(id, intent)])
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409])
    expect(
      results.find(({ status }) => status === 409)?.body.error.details.reason
    ).toBe('staleReward')
    const resumed = await get(id).expect(200)
    expect(resumed.body).toEqual(
      results.find(({ status }) => status === 200)?.body
    )
    expect(resumed.body.pendingRewards).toMatchObject([
      { cardId: potion, origin: { type: 'reserveDeck' } },
    ])
    const leave = {
      type: 'resolveReward',
      rewardId: resumed.body.pendingRewards[0].id,
      choice: 'leave',
    }
    const finished = await act(id, leave).expect(200)
    expect(finished.body).toMatchObject({
      randomEventEncounter: null,
      pendingRewards: [],
      members: [
        {
          player: {
            inventory: [{ cardId: ore, quantity: 1 }],
            lastRewardDelivery: { disposition: 'removed' },
            lastRandomEvent: {
              resolution: 'success',
              replacement: { requested: 2, drawn: 2 },
            },
          },
        },
      ],
    })
    const completedSave = await stored(id)
    await act(id, leave)
      .expect(409)
      .expect(({ body }) =>
        expect(body.error.details.reason).toBe('staleReward')
      )
    expect(await stored(id)).toEqual(completedSave)
  })
})
