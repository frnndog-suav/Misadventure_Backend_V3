import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { SeededRng } from '@/core/rng/seeded-rng'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { TakePartyActionUseCase } from '@/domain/campaign/application/use-cases/take-party-action'
import type { TCombatUpdate } from '@/domain/campaign/enterprise/combat'
import { maxHealthOf } from '@/domain/campaign/enterprise/entities/party-member'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { DrizzlePartyMapper } from '@/infra/database/drizzle/mappers/drizzle-party-mapper'
import {
  makeDimensionCard,
  makeItemCard,
  makeUrbanZoneCard,
} from '../../../../../test/factories/make-card'
import { createApp } from '../../../../../test/lab-app'
import { resetCampaign, WARRIOR_BODY } from '../../../../../test/parties-e2e'

const KEY = '105a315f-de51-44d0-aca0-93a270925182'
const NEXT_KEY = '105a315f-de51-44d0-aca0-93a270925183'
const END_TURN = { type: 'endTurn' }
const DIFFERENT_ACTION = { type: 'recover', option: 'shuffleHand' }

describe('FEAT-20: avanço e recuperação (T-90)', () => {
  let app: INestApplication
  let repository: PartiesRepository

  beforeAll(async () => {
    app = await createApp(true)
    repository = app.get(PartiesRepository)
  })
  beforeEach(async () => resetCampaign(app))
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => app?.close())

  function api() {
    return request(app.getHttpServer())
  }

  function action(id: string, key?: string, body: object = END_TURN) {
    const post = api().post('/parties/' + id + '/actions')
    if (key !== undefined) post.set('Idempotency-Key', key)
    return post.send(body)
  }

  function session(id: string) {
    return api().post('/parties/' + id + '/session')
  }

  async function stored(id: string) {
    const party = await repository.findById(id)
    if (!party) throw new Error('Save ausente')
    return DrizzlePartyMapper.toDrizzle(party)
  }

  async function fixture(first: 'human' | 'helper', aiHelperCount = 2) {
    const created = await api()
      .post('/parties')
      .send({ ...WARRIOR_BODY, aiHelperCount })
      .expect(201)
    const row = await stored(created.body.id)
    const [human, firstHelper, lastHelper] = row.state.members.map(
      ({ id }) => id
    )
    if (aiHelperCount > 0) {
      row.state.turnOrder = [firstHelper, human, lastHelper]
      row.state.turn.memberId = first === 'human' ? human : firstHelper
      row.state.eventDecks = [{ zoneType: 'urban', cards: [], discard: [] }]
      await repository.save(DrizzlePartyMapper.toDomain(row))
    }
    return { id: row.id, human, firstHelper, lastHelper }
  }

  async function current(id: string) {
    return (
      await api()
        .get('/parties/' + id)
        .expect(200)
    ).body
  }

  it('REQ-183: inicia com IA em primeiro e devolve a vez humana gravada', async () => {
    const { id, human, firstHelper } = await fixture('helper')
    expect(await current(id)).toMatchObject({
      status: 'idle',
      turn: { memberId: firstHelper, round: 1 },
    })
    const started = await session(id).expect(200)
    expect(started.body).toMatchObject({
      status: 'inSession',
      turn: { memberId: human, round: 1 },
    })
    expect(await current(id)).toEqual(started.body)
  })

  it('REQ-183/D-157: executa em ordem, relê o save por vez e avança a rodada', async () => {
    const { id, human, firstHelper, lastHelper } = await fixture('human')
    await session(id).expect(200)
    const executor = app.get(TakePartyActionUseCase)
    const execute = executor.executeAiTurn.bind(executor)
    const turns: string[] = []
    vi.spyOn(executor, 'executeAiTurn').mockImplementation(async (party) => {
      const memberId = party.turn.memberId.toString()
      const savedTurn = (await stored(id)).state.turn
      expect(savedTurn).toMatchObject({ memberId, round: party.turn.round })
      turns.push(memberId)
      return execute(party)
    })

    const response = await action(id, KEY).expect(200)
    expect(turns).toEqual([lastHelper, firstHelper])
    const { combatUpdates, ...snapshot } = response.body
    expect(combatUpdates).toEqual([])
    expect(snapshot.turn).toMatchObject({ memberId: human, round: 2 })
    expect(await current(id)).toEqual(snapshot)
  })

  it.each([undefined, 'invalid'])(
    'REQ-184: recusa chave %s sem aplicar a ação',
    async (key) => {
      const { id } = await fixture('human')
      await session(id).expect(200)
      const before = await stored(id)
      const response = await action(id, key).expect(400)
      expect(response.body.error).toMatchObject({
        code: 'ACTION_INVALID',
        details: {
          fields: [
            { field: 'Idempotency-Key', reason: 'invalidIdempotencyKey' },
          ],
        },
      })
      expect(await stored(id)).toEqual(before)
    }
  )

  it('REQ-184: mantém a ação sem chave em save solo', async () => {
    const { id, human } = await fixture('human', 0)
    await session(id).expect(200)
    const response = await action(id).expect(200)
    expect(response.body.turn).toMatchObject({ memberId: human, round: 2 })
  })

  it.each(['ação', 'sessão'] as const)(
    'REQ-184/REQ-185/D-157: retoma pela %s após interromper a segunda vez automática',
    async (resume) => {
      const { id, human, firstHelper, lastHelper } = await fixture('human')
      await session(id).expect(200)
      const executor = app.get(TakePartyActionUseCase)
      const execute = executor.executeAiTurn.bind(executor)
      const turns: string[] = []
      const interrupted = vi
        .spyOn(executor, 'executeAiTurn')
        .mockImplementation(async (party) => {
          const memberId = party.turn.memberId.toString()
          turns.push(memberId)
          if (memberId === firstHelper)
            throw new Error('Interrupção na segunda vez da IA')
          return execute(party)
        })

      await action(id, KEY).expect(500)
      expect(turns).toEqual([lastHelper, firstHelper])
      const checkpoint = await stored(id)
      expect(checkpoint.state.turn).toMatchObject({
        memberId: firstHelper,
        round: 2,
      })
      const pending = await action(id, NEXT_KEY).expect(409)
      expect(pending.body.error.code).toBe('ACTION_ADVANCE_PENDING')
      const conflict = await action(id, KEY, DIFFERENT_ACTION).expect(409)
      expect(conflict.body.error.code).toBe('ACTION_IDEMPOTENCY_CONFLICT')
      expect(await stored(id)).toEqual(checkpoint)

      interrupted.mockRestore()
      const resumedTurns = vi.spyOn(executor, 'executeAiTurn')
      const resumed = await (
        resume === 'sessão' ? session(id) : action(id, KEY)
      ).expect(200)
      expect(resumedTurns).toHaveBeenCalledTimes(1)
      expect(resumed.body.turn).toMatchObject({ memberId: human, round: 2 })
      const replay = await action(id, KEY).expect(200)
      expect(replay.body).toEqual({ ...resumed.body, combatUpdates: [] })
      expect(resumedTurns).toHaveBeenCalledTimes(1)
    }
  )

  it('REQ-185: reenvios simultâneos e históricos preservam resposta, jogadas e RNG', async () => {
    const { id, human } = await fixture('human')
    await session(id).expect(200)
    const executor = vi.spyOn(app.get(TakePartyActionUseCase), 'executeAiTurn')
    const [original, concurrent] = await Promise.all([
      action(id, KEY).expect(200),
      action(id, KEY).expect(200),
    ])
    expect(original.body.turn).toMatchObject({ memberId: human, round: 2 })
    expect(original.body.combatUpdates).toEqual([])
    expect(concurrent.body).toEqual(original.body)
    expect(executor).toHaveBeenCalledTimes(2)

    const later = await action(id, NEXT_KEY).expect(200)
    const { combatUpdates, ...snapshot } = later.body
    expect(combatUpdates).toEqual([])
    expect(snapshot.turn).toMatchObject({ memberId: human, round: 3 })
    const beforeReplay = await stored(id)
    await action(id, KEY).expect(200, original.body)
    expect(executor).toHaveBeenCalledTimes(4)
    expect(await stored(id)).toEqual(beforeReplay)
    expect(await current(id)).toEqual(snapshot)
  })

  it('REQ-184/REQ-185: recupera o commit humano e preserva o lote de combate do checkpoint', async () => {
    const { id, human, firstHelper, lastHelper } = await fixture('human')
    await session(id).expect(200)
    const row = await stored(id)
    row.state.config.actionPointsPerTurn = 1
    row.state.rngState = [0, 0, 0, 10]
    const wolves = 'fixture.howling-wolves'
    row.state.eventDecks = [{ zoneType: 'urban', cards: [wolves], discard: [] }]
    const helper = row.state.members.find(({ id }) => id === lastHelper)!
    const nextHelper = row.state.members.find(({ id }) => id === firstHelper)!
    nextHelper.player.nextTurnActionPointDebt = 1
    helper.player.health = maxHealthOf(helper.player)
    helper.player.vigor = helper.player.peak
    helper.player.modifiers = {
      ...helper.player.modifiers,
      attack: 100,
      accuracy: 100,
      defense: 100,
    }
    for (const zone of row.state.dimension.map.zones) zone.questDeck = []
    await repository.save(DrizzlePartyMapper.toDomain(row))

    const catalog = app.get(CardCatalog)
    const findCard = catalog.findCard.bind(catalog)
    vi.spyOn(catalog, 'findCard').mockImplementation(async (cardId) => {
      const card = await findCard(cardId)
      if (card?.type === 'zone' && card.id === helper.player.zoneId)
        return { ...card, zoneActions: ['startEvent'] }
      if (card?.id !== wolves || card.type !== 'combatEvent') return card
      const [enemy] = card.enemies
      return { ...card, enemies: [{ ...enemy, count: 1, health: 1 }] }
    })

    const executor = app.get(TakePartyActionUseCase)
    const execute = executor.executeAiTurn.bind(executor)
    let batch: readonly TCombatUpdate[] = []
    const automatic = vi
      .spyOn(executor, 'executeAiTurn')
      .mockRejectedValueOnce(new Error('Interrupção após o commit humano'))
      .mockImplementation(async (party) => {
        if (party.turn.memberId.toString() === firstHelper)
          throw new Error('Interrupção após o commit do combate')
        const result = await execute(party)
        if (result.isRight()) batch = result.value.combatUpdates
        return result
      })

    await action(id, KEY).expect(500)
    expect((await stored(id)).state.turn).toMatchObject({
      memberId: lastHelper,
      round: 1,
    })
    await action(id, KEY).expect(500)
    expect((await stored(id)).state.turn).toMatchObject({
      memberId: firstHelper,
      round: 2,
    })
    expect(batch[0]?.type).toBe('combatStarted')
    expect(batch.at(-1)?.type).toBe('combatEnded')

    automatic.mockRestore()
    const resumed = await session(id).expect(200)
    const replay = await action(id, KEY).expect(200)
    expect(replay.body.turn).toMatchObject({ memberId: human, round: 2 })
    expect(replay.body).toEqual({ ...resumed.body, combatUpdates: batch })
    await action(id, NEXT_KEY).expect(200)
    const later = await stored(id)
    await action(id, KEY).expect(200, replay.body)
    expect(await stored(id)).toEqual(later)
  })

  it.each([true, false])(
    'REQ-183: conclui a dimensão (sucessora disponível: %s)',
    async (hasNext) => {
      const { id, human } = await fixture('human')
      const before = await session(id).expect(200)
      const catalog = app.get(CardCatalog)
      const [dimension, city] = await Promise.all([
        catalog.findCard('fixture.test-dimension'),
        catalog.findCard('fixture.gray-harbor'),
      ])
      if (dimension?.type !== 'dimension' || city?.type !== 'zone')
        throw new Error('Dimensão ou cidade inicial ausente')
      const shard = makeItemCard({ id: 'fixture.shard', completionItem: true })
      const next = makeDimensionCard({
        id: 'fixture-next.dimension',
        collectionId: 'fixture-next',
        releaseOrder: dimension.releaseOrder + 1,
      })
      const nextCity = makeUrbanZoneCard({
        id: 'fixture-next.city',
        collectionId: next.collectionId,
      })
      const findCard = catalog.findCard.bind(catalog)
      vi.spyOn(catalog, 'findCard').mockImplementation(async (cardId) => {
        if (cardId === shard.id) return shard
        if (cardId === next.id) return next
        if (cardId === nextCity.id) return nextCity
        if (cardId !== dimension.id) return findCard(cardId)
        return {
          ...dimension,
          completion: {
            zoneTitle: city.title,
            requirement: [{ cardId: shard.id, count: 1 }],
            grandPrize: { cards: [], gold: 10 },
            finalBoss: null,
          },
        }
      })
      const collections = await catalog.listCollections()
      vi.spyOn(catalog, 'listCollections').mockResolvedValue(
        hasNext
          ? [...collections, { id: next.collectionId, name: next.name }]
          : collections
      )
      const listCards = catalog.listCards.bind(catalog)
      vi.spyOn(catalog, 'listCards').mockImplementation((collectionId) =>
        collectionId === next.collectionId
          ? Promise.resolve([next, nextCity])
          : listCards(collectionId)
      )
      await api()
        .post(`/lab/parties/${id}/members/${human}/grants`)
        .send({ type: 'card', cardId: shard.id, quantity: 1 })
        .expect(200)

      const completion = { type: 'completeDimension' } as const
      const executor = app.get(TakePartyActionUseCase)
      let expectedOrder: string[] = []
      if (hasNext) {
        const row = await stored(id)
        for (let seed = 0; seed < 32; seed++) {
          row.state.rngState = [...SeededRng.fromSeed(seed).state()]
          const preview = DrizzlePartyMapper.toDomain(row)
          const result = await executor.executeHumanAction(preview, completion)
          expect(result.isRight()).toBe(true)
          expectedOrder = preview.turnOrder.map(String)
          if (expectedOrder[0] !== human) break
        }
        expect(expectedOrder[0]).not.toBe(human)
        await repository.save(DrizzlePartyMapper.toDomain(row))
      }

      const automatic = vi.spyOn(executor, 'executeAiTurn')
      const result = await action(id, KEY, completion).expect(200)
      const { combatUpdates, ...snapshot } = result.body
      expect(combatUpdates).toEqual([])
      expect(await current(id)).toEqual(snapshot)
      expect(
        result.body.members.map(
          ({ player }: { player: { peak: number; gold: number } }) => [
            player.peak,
            player.gold,
          ]
        )
      ).toEqual(
        before.body.members.map(
          ({ player }: { player: { peak: number; gold: number } }) => [
            player.peak + 25,
            player.gold + 10,
          ]
        )
      )
      if (hasNext) {
        expect(result.body).toMatchObject({
          status: 'inSession',
          turnOrder: expectedOrder,
          turn: { memberId: human, round: 1 },
          dimension: {
            dimensionCardId: next.id,
            startingCityZoneId: nextCity.id,
          },
        })
        expect(automatic).toHaveBeenCalledTimes(expectedOrder.indexOf(human))
        for (const { player } of result.body.members)
          expect(player).toMatchObject({
            zoneId: nextCity.id,
            respawnZoneId: nextCity.id,
          })
      } else {
        expect(result.body.status).toBe('frozen')
        expect(automatic).not.toHaveBeenCalled()
        expect((await session(id).expect(409)).body.error.code).toBe(
          'PARTY_FROZEN'
        )
        await action(id, KEY, completion).expect(200, result.body)
      }
    }
  )
})
