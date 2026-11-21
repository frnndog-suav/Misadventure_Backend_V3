import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { DrizzlePartyMapper } from '@/infra/database/drizzle/mappers/drizzle-party-mapper'
import { parties } from '@/infra/database/drizzle/schema'
import { createContentApp } from '../../../../../test/content-app'
import { postParty, resetCampaign } from '../../../../../test/parties-e2e'

const wolves = 'fixture.howling-wolves'
const traveler = 'fixture.wounded-traveler'
const ore = 'fixture.iron-ore'
const fish = 'fixture.silver-fish'

describe('Combate solo (HTTP e save)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp(async (root) => {
      const path = join(root, 'fixture', 'combatEvent.json')
      const [card] = JSON.parse(await readFile(path, 'utf8'))
      const [enemy] = card.enemies
      const modifiers = {
        ...enemy.modifiers,
        attack: 0,
        defense: 0,
        evasion: 0,
      }
      await writeFile(
        path,
        JSON.stringify([
          {
            ...card,
            enemies: [
              { ...enemy, count: 1, health: 1, modifiers },
              {
                ...enemy,
                count: 1,
                health: 1,
                modifiers: { ...modifiers, reflection: 1 },
              },
            ],
            goodOutcome: {
              text: 'Compre uma recompensa.',
              steps: [{ type: 'drawRewards', count: 1 }],
            },
            badOutcome: { text: 'Derrota.', steps: [] },
          },
        ])
      )
      const dimensionPath = join(root, 'fixture', 'dimension.json')
      const [dimension] = JSON.parse(await readFile(dimensionPath, 'utf8'))
      dimension.eventDecks[0].cards.find(
        ({ cardId }: { cardId: string }) => cardId === wolves
      ).copies = 2
      await writeFile(dimensionPath, JSON.stringify([dimension]))
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

  async function setup({
    legacy = false,
    pile = [wolves],
    discard = [] as string[],
  } = {}) {
    await request(server())
      .patch('/lab/config')
      .send({ inventoryCapacity: 1, actionPointsPerTurn: 1 })
      .expect(200)
    const { id } = await postParty(ctx.app)
    await request(server()).post(`/parties/${id}/session`).expect(200)
    const state = DrizzlePartyMapper.toDrizzle(
      DrizzlePartyMapper.toDomain(await stored(id))
    ).state
    await db()
      .update(parties)
      .set({
        state: {
          ...state,
          schemaVersion: legacy ? 8 : 9,
          rngState: [0, 0, 0, 10],
          eventDecks: [{ zoneType: 'urban', cards: pile, discard }],
          rewardDecks: [{ zoneType: 'urban', cards: [ore] }],
          members: state.members.map((member) => ({
            ...member,
            player: {
              ...member.player,
              health: 1,
              modifiers: {
                ...member.player.modifiers,
                accuracy: 100,
                defense: 100,
              },
              inventory: [{ cardId: fish, quantity: 1 }],
            },
          })),
        },
      })
      .where(eq(parties.id, id))
    return id
  }

  it('REQ-123/REQ-127: recarrega combate, preserva a escolha sem PA e devolve o respawn no POST', async () => {
    const id = await setup()
    const started = await act(id, { type: 'startEvent' }).expect(200)
    const revealed = await act(id, {
      type: 'revealEvent',
      encounterId: started.body.randomEventEncounter.id,
    }).expect(200)
    expect(
      revealed.body.combatUpdates.map(({ type }: { type: string }) => type)
    ).toEqual(['combatStarted', 'combatTurnStarted'])
    const { combat, combatUpdates, ...rest } = revealed.body
    expect((await get(id).expect(200)).body).toEqual({ ...rest, combat })
    expect(combatUpdates[0].participants).toHaveLength(3)

    await act(id, {
      type: 'combatAttack',
      combatId: combat.id,
      turnId: combat.turn.id,
      targetId: combat.enemies[0].id,
    }).expect(200)
    const active = (await get(id).expect(200)).body.combat
    expect(
      active.enemies.map(({ health }: { health: number }) => health)
    ).toEqual([0, 1])
    expect(active.attackTargetIds).toEqual([combat.enemies[1].id])
    const before = await stored(id)
    await act(id, {
      type: 'combatAttack',
      combatId: combat.id,
      turnId: combat.turn.id,
      targetId: combat.enemies[0].id,
    })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.details.reason).toBe('staleCombatTurn')
      })
    expect(await stored(id)).toEqual(before)

    const victory = await act(id, {
      type: 'combatAttack',
      combatId: combat.id,
      turnId: active.turn.id,
      targetId: active.enemies[1].id,
    }).expect(200)
    expect(
      victory.body.combatUpdates.map(({ type }: { type: string }) => type)
    ).toEqual(['combatDamageResolved', 'combatEnded'])
    const pending = (await get(id).expect(200)).body
    const { combatUpdates: _, ...victorySnapshot } = victory.body
    expect(pending).toEqual(victorySnapshot)
    expect(pending).toMatchObject({
      turn: { ...started.body.turn, actionPoints: 0 },
      combat: null,
      lastCombatResult: { resolution: 'victory', playerDown: true },
      pendingRewards: [
        { cardId: ore, source: { type: 'combatEvent', combatId: combat.id } },
      ],
      members: [
        {
          player: {
            health: 0,
            down: true,
            availableActions: ['resolveReward'],
          },
        },
      ],
    })
    expect(
      DrizzlePartyMapper.toDomain(await stored(id)).eventDecks[0].discard
    ).toEqual([])
    await request(server()).post(`/parties/${id}/session/end`).expect(200)
    await request(server()).post(`/parties/${id}/session`).expect(200)
    const reopened = (await get(id).expect(200)).body
    expect(reopened).toMatchObject({
      turn: pending.turn,
      pendingRewards: pending.pendingRewards,
      members: [
        {
          player: {
            health: 0,
            down: true,
            availableActions: ['resolveReward'],
          },
        },
      ],
    })
    expect(
      DrizzlePartyMapper.toDomain(await stored(id)).eventDecks[0].discard
    ).toEqual([])
    const resolved = await act(id, {
      type: 'resolveReward',
      rewardId: pending.pendingRewards[0].id,
      choice: 'keep',
      discard: [{ cardId: fish, copies: 1 }],
    }).expect(200)
    const { combatUpdates: resolutionUpdates, ...snapshot } = resolved.body
    expect(resolutionUpdates).toEqual([])
    expect(snapshot).toMatchObject({
      pendingRewards: [],
      lastCombatResult: { resolution: 'victory', playerDown: true },
      members: [
        {
          player: {
            down: false,
            zoneId: pending.members[0].player.respawnZoneId,
            inventory: [{ cardId: ore, quantity: 1 }],
          },
        },
      ],
    })
    expect(snapshot.members[0].player.health).toBeGreaterThan(0)
    expect((await get(id).expect(200)).body).toEqual(snapshot)
    expect(
      DrizzlePartyMapper.toDomain(await stored(id)).eventDecks[0].discard
    ).toEqual([wolves])
  })

  it('D-110: inicializa o deck v8 uma vez, antes de reciclar e sem gastar RNG', async () => {
    const id = await setup({ legacy: true, pile: [], discard: [traveler] })
    const legacy = await stored(id)
    await get(id).expect(200)
    await act(id, { type: 'revealEvent', encounterId: 'stale' }).expect(409)
    expect(await stored(id)).toEqual(legacy)
    const started = await act(id, { type: 'startEvent' }).expect(200)
    const upgraded = DrizzlePartyMapper.toDomain(await stored(id))
    expect(upgraded.eventDecks).toEqual([
      { zoneType: 'urban', cards: [wolves, wolves], discard: [traveler] },
    ])
    expect(upgraded.rngState).toEqual(
      DrizzlePartyMapper.toDomain(legacy).rngState
    )
    expect(upgraded.combatSnapshot().upgradedCombatDecks).toEqual(['urban'])
    await act(id, {
      type: 'revealEvent',
      encounterId: started.body.randomEventEncounter.id,
    })
      .expect(200)
      .expect(({ body }) => expect(body.combat.card.id).toBe(wolves))
    expect(DrizzlePartyMapper.toDomain(await stored(id)).eventDecks).toEqual([
      { zoneType: 'urban', cards: [wolves], discard: [traveler] },
    ])
  })
})
