import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { DrizzlePartyMapper } from '@/infra/database/drizzle/mappers/drizzle-party-mapper'
import { parties } from '@/infra/database/drizzle/schema'
import { createContentApp } from '../../../../../test/content-app'
import {
  postParty,
  resetCampaign,
  withoutMarkets,
} from '../../../../../test/parties-e2e'

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
        state: withoutMarkets({
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
        }),
      })
      .where(eq(parties.id, id))
    return id
  }

  it('REQ-123/REQ-127/REQ-129: preserva a escolha legada sem PA e persiste o respawn no POST', async () => {
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
    const { combatUpdates: victoryUpdates, ...victorySnapshot } = victory.body
    expect(victoryUpdates.map(({ type }: { type: string }) => type)).toEqual([
      'combatDamageResolved',
      'combatEnded',
    ])
    const pending = (await get(id).expect(200)).body
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
    const paused = DrizzlePartyMapper.toDrizzle(
      DrizzlePartyMapper.toDomain(await stored(id))
    ).state
    expect(paused.eventDecks?.[0].discard).toEqual([])
    expect(paused.rewardDecks?.[0].cards).toEqual([])
    expect(paused.combatOutcome?.cursor).toEqual({ nextStep: 0, nextCopy: 1 })
    await db()
      .update(parties)
      .set({
        state: withoutMarkets({
          ...paused,
          schemaVersion: 9,
          members: paused.members.map((member) => ({
            ...member,
            player: {
              ...member.player,
              lastKnockout: undefined,
              skipNextTurn: undefined,
            },
          })),
        }),
      })
      .where(eq(parties.id, id))
    expect((await get(id).expect(200)).body).toEqual(pending)
    await request(server()).post(`/parties/${id}/session/end`).expect(200)
    const { body: reopened } = await request(server())
      .post(`/parties/${id}/session`)
      .expect(200)
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
    const resumed = DrizzlePartyMapper.toDrizzle(
      DrizzlePartyMapper.toDomain(await stored(id))
    ).state
    expect(resumed.combatOutcome).toEqual(paused.combatOutcome)
    expect(resumed.rngState).toEqual(paused.rngState)
    expect(resumed.eventDecks).toEqual(paused.eventDecks)
    expect(resumed.rewardDecks).toEqual(paused.rewardDecks)
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
    const player = snapshot.members[0].player
    expect(player.health).toBeGreaterThan(0)
    expect(snapshot.turn.round).toBe(pending.turn.round + 2)
    expect(player.lastKnockout).toMatchObject({
      id: expect.any(String),
      combatId: combat.id,
      respawnZoneId: player.zoneId,
      healthRestored: player.health,
      roundAtKnockout: pending.turn.round,
      roundAfterRespawn: snapshot.turn.round,
    })
    const persisted = await stored(id)
    expect((await get(id).expect(200)).body).toEqual(snapshot)
    expect(await stored(id)).toEqual(persisted)
    const finished = DrizzlePartyMapper.toDrizzle(
      DrizzlePartyMapper.toDomain(persisted)
    ).state
    expect(finished.eventDecks?.[0].discard).toEqual([wolves])
    expect(finished.rewardDecks).toEqual(paused.rewardDecks)
    expect(finished.rngState).toEqual(paused.rngState)
    expect(pending.members[0].player.lastKnockout).toBeNull()
  })

  it.each([
    { entry: 'GET inativo', respawn: 'saved' },
    { entry: 'GET inativo', respawn: 'missing' },
    { entry: 'reabertura', respawn: 'invalid' },
  ])(
    'REQ-129: conclui derrota legada uma vez via $entry ($respawn)',
    async ({ entry, respawn }) => {
      const id = await setup()
      await request(server()).post(`/parties/${id}/session/end`).expect(200)
      const state = DrizzlePartyMapper.toDrizzle(
        DrizzlePartyMapper.toDomain(await stored(id))
      ).state
      const [member] = state.members
      const city = state.dimension.startingCityZoneId
      const lastCombatResult = {
        combatId: 'legacy-combat',
        cardId: wolves,
        memberId: member.id,
        resolution: 'defeat',
        cause: 'playerDown',
        playerDown: true,
        peakDelta: 0,
      }
      await db()
        .update(parties)
        .set({
          state: withoutMarkets({
            ...state,
            schemaVersion: 9,
            turn: { ...state.turn, round: 6, actionPoints: 0 },
            eventDecks: [{ zoneType: 'urban', cards: [], discard: [wolves] }],
            lastCombatResult,
            members: [
              {
                ...member,
                player: {
                  ...member.player,
                  health: 0,
                  down: true,
                  lastKnockout: undefined,
                  skipNextTurn: undefined,
                  peak: 10,
                  vigor: 9,
                  gold: 32,
                  vault: { ...member.player.vault, gold: 80 },
                  respawnZoneId: {
                    saved: city,
                    missing: undefined,
                    invalid: 'missing-zone',
                  }[respawn],
                },
              },
            ],
          }),
        })
        .where(eq(parties.id, id))

      const open = () => request(server()).post(`/parties/${id}/session`)
      const { body: first } = await (
        entry === 'reabertura' ? open() : get(id)
      ).expect(200)
      expect(first).not.toHaveProperty('combatUpdates')
      expect(first).toMatchObject({
        status: entry === 'reabertura' ? 'inSession' : 'idle',
        turn: { round: 8, actionPoints: 1 },
        lastCombatResult,
        pendingRewards: [],
        members: [
          {
            player: {
              down: false,
              skipNextTurn: false,
              zoneId: city,
              respawnZoneId: city,
              peak: 9,
              vigor: 4,
              gold: 29,
              vault: { gold: 80 },
              lastKnockout: {
                id: expect.any(String),
                combatId: lastCombatResult.combatId,
                respawnZoneId: city,
                peakLost: 1,
                vigorLost: 5,
                purseGoldLost: 3,
                roundAtKnockout: 6,
                roundAfterRespawn: 8,
              },
            },
          },
        ],
      })
      const persisted = await stored(id)
      expect((await get(id).expect(200)).body).toEqual(first)
      expect(await stored(id)).toEqual(persisted)
      const restored = DrizzlePartyMapper.toDomain(persisted)
      expect(restored.rngState).toEqual(state.rngState)
      expect(restored.eventDecks[0].discard).toEqual([wolves])
      if (entry === 'reabertura')
        await request(server()).post(`/parties/${id}/session/end`).expect(200)
      const { body: reopened } = await open().expect(200)
      expect(reopened.turn).toEqual(first.turn)
      expect(reopened.lastCombatResult).toEqual(first.lastCombatResult)
      const player = first.members[0].player
      expect(reopened.members[0].player).toMatchObject({
        lastKnockout: player.lastKnockout,
        health: player.health,
        peak: player.peak,
        vigor: player.vigor,
        gold: player.gold,
        vault: player.vault,
        zoneId: player.zoneId,
        respawnZoneId: player.respawnZoneId,
      })
    }
  )

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
