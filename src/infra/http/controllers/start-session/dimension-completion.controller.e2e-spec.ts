import request from 'supertest'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { DrizzlePartyMapper } from '@/infra/database/drizzle/mappers/drizzle-party-mapper'
import {
  makeDimensionCard,
  makeItemCard,
  makeUrbanZoneCard,
} from '../../../../../test/factories/make-card'
import { createContentApp } from '../../../../../test/content-app'
import { postParty } from '../../../../../test/parties-e2e'

let ctx: Awaited<ReturnType<typeof createContentApp>>

beforeAll(async () => {
  ctx = await createContentApp()
})

afterAll(async () => {
  vi.restoreAllMocks()
  await ctx?.close()
})

it('REQ-171/REQ-172: congela, projeta idle e serializa a conclusão e a retomada concorrentes', async () => {
  const { app } = ctx
  const server = app.getHttpServer()
  const catalog = app.get(CardCatalog)
  const repository = app.get(PartiesRepository)
  const created = await postParty(app)
  const { id } = created
  const root = `/parties/${id}`
  const member = (created.members as { id: string }[])[0]
  const current = await catalog.findCard('fixture.test-dimension')
  if (current?.type !== 'dimension') throw new Error('Dimensão ausente')
  const zone = await catalog.findCard('fixture.gray-harbor')
  if (zone?.type !== 'zone') throw new Error('Cidade inicial ausente')
  const started = await request(server).post(`${root}/session`).expect(200)
  expect(started.body.lastDimensionCompletion).toBeNull()
  expect(started.body.members[0].player.completionItems).toEqual([])
  expect(started.body.members[0].player.availableActions).not.toContain(
    'completeDimension'
  )
  const shard = makeItemCard({ id: 'fixture.shard', completionItem: true })
  const next = makeDimensionCard({
    id: 'fixture-next.dimension',
    collectionId: 'fixture-next',
    name: 'Segunda Dimensão',
    releaseOrder: current.releaseOrder + 1,
  })
  const city = makeUrbanZoneCard({
    id: 'fixture-next.city',
    collectionId: next.collectionId,
  })
  const findCard = catalog.findCard.bind(catalog)
  vi.spyOn(catalog, 'findCard').mockImplementation(async (id) => {
    if (id === shard.id) return shard
    if (id === next.id) return next
    if (id === city.id) return city
    if (id !== current.id) return findCard(id)
    return {
      ...current,
      completion: {
        zoneTitle: zone.title,
        requirement: [{ cardId: shard.id, count: 1 }],
        grandPrize: { cards: [], gold: 10 },
        finalBoss: null,
      },
    }
  })
  const listCards = catalog.listCards.bind(catalog)
  vi.spyOn(catalog, 'listCards').mockImplementation((id) =>
    id === next.collectionId ? Promise.resolve([next, city]) : listCards(id)
  )

  async function saved() {
    const party = await repository.findById(id)
    if (!party) throw new Error('Save ausente')
    return DrizzlePartyMapper.toDrizzle(party)
  }

  await request(server)
    .post(`/lab/parties/${id}/members/${member.id}/grants`)
    .send({ type: 'card', cardId: shard.id, quantity: 1 })
    .expect(200)
  const complete = () =>
    request(server).post(`${root}/actions`).send({ type: 'completeDimension' })
  const completions = await Promise.all([complete(), complete()])
  expect(completions.map(({ status }) => status).sort()).toEqual([200, 409])
  const frozen = completions.find(({ status }) => status === 200)!.body
  expect(frozen).toMatchObject({
    status: 'frozen',
    lastDimensionCompletion: { next: { type: 'frozen' } },
  })
  expect(frozen.members[0].player).toMatchObject({
    completionItems: [],
    gold: started.body.members[0].player.gold + 10,
    peak: started.body.members[0].player.peak + 25,
  })
  const frozenRow = await saved()
  const detail = await request(server).get(root).expect(200)
  expect(detail.body.status).toBe('frozen')
  const list = await request(server).get('/parties').expect(200)
  expect(list.body).toContainEqual(
    expect.objectContaining({ id, status: 'frozen' })
  )
  const open = () => request(server).post(`${root}/session`)
  const blocked = await open().expect(409)
  expect(blocked.body).toEqual({
    error: {
      code: 'PARTY_FROZEN',
      message: 'Este save está congelado até o lançamento da próxima dimensão.',
    },
  })

  const collections = await catalog.listCollections()
  vi.spyOn(catalog, 'listCollections').mockResolvedValue([
    ...collections,
    { id: next.collectionId, name: next.name },
  ])
  const idle = await request(server).get(root).expect(200)
  expect(idle.body).toMatchObject({
    status: 'idle',
    savedAt: frozen.savedAt,
    lastDimensionCompletion: frozen.lastDimensionCompletion,
  })
  const published = await request(server).get('/parties').expect(200)
  expect(published.body).toContainEqual(
    expect.objectContaining({ id, status: 'idle' })
  )
  expect(await saved()).toEqual(frozenRow)

  const [first, second] = await Promise.all([
    open().expect(200),
    open().expect(200),
  ])
  expect(first.body).toMatchObject({
    status: 'inSession',
    dimension: { dimensionCardId: next.id },
    lastDimensionCompletion: {
      ...frozen.lastDimensionCompletion,
      next: {
        type: 'nextDimension',
        dimensionCardId: next.id,
        name: next.name,
      },
    },
  })
  expect(first.body.members[0].player).toMatchObject({
    zoneId: city.id,
    respawnZoneId: city.id,
    gold: frozen.members[0].player.gold,
    peak: frozen.members[0].player.peak,
  })
  expect(second.body).toEqual(first.body)
  const resumedRow = await saved()
  expect(resumedRow.state.rngState).not.toEqual(frozenRow.state.rngState)
  await open().expect(200)
  expect(await saved()).toEqual(resumedRow)
})
