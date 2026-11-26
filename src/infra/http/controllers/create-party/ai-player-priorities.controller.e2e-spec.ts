import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { TakePartyActionUseCase } from '@/domain/campaign/application/use-cases/take-party-action'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { DrizzlePartyMapper } from '@/infra/database/drizzle/mappers/drizzle-party-mapper'
import { createApp } from '../../../../../test/lab-app'
import {
  postParty,
  resetCampaign,
  WARRIOR_BODY,
} from '../../../../../test/parties-e2e'

const DEFAULT_PRIORITIES = [
  'avoidKnockout',
  'dimensionCompletion',
  'quests',
  'peak',
  'gold',
]
const CUSTOM_PRIORITIES = [...DEFAULT_PRIORITIES].reverse()

describe('FEAT-20 — prioridades e vez do ajudante (T-89)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  beforeEach(async () => {
    await resetCampaign(app)
  })

  afterAll(async () => {
    await app?.close()
  })

  async function executeAiTurn(party: Party) {
    const actions = app.get(TakePartyActionUseCase)
    const result = await actions.executeAiTurn(party)
    expect(result.isRight()).toBe(true)
  }

  async function makeActiveHelperSave(actionPoints: number) {
    const { id } = await postParty(app, { ...WARRIOR_BODY, aiHelperCount: 1 })
    const party = await app.get(PartiesRepository).findById(id)
    if (!party) throw new Error('Save ausente')

    const row = DrizzlePartyMapper.toDrizzle(party)
    const helper = row.state.members.find(({ kind }) => kind === 'aiHelper')
    if (!helper) throw new Error('Ajudante ausente')
    row.status = 'inSession'
    row.state.turn.memberId = helper.id
    row.state.turn.actionPoints = actionPoints
    return { row, helper }
  }

  it('REQ-181: publica, substitui e restaura a permutação completa', async () => {
    const api = request(app.getHttpServer())
    const initial = await api.get('/lab/config').expect(200)
    expect(initial.body.values.aiPlayerPriorities).toEqual(DEFAULT_PRIORITIES)
    expect(initial.body.defaults.aiPlayerPriorities).toEqual(DEFAULT_PRIORITIES)
    expect(initial.body.limits).not.toHaveProperty('aiPlayerPriorities')

    const updated = await api
      .patch('/lab/config')
      .send({ aiPlayerPriorities: CUSTOM_PRIORITIES })
      .expect(200)
    expect(updated.body.values.aiPlayerPriorities).toEqual(CUSTOM_PRIORITIES)
    expect(updated.body.defaults.aiPlayerPriorities).toEqual(DEFAULT_PRIORITIES)
    expect(updated.body.limits).not.toHaveProperty('aiPlayerPriorities')
    await api.get('/lab/config').expect(200, updated.body)

    const reset = await api.post('/lab/config/reset').expect(200)
    expect(reset.body.values.aiPlayerPriorities).toEqual(DEFAULT_PRIORITIES)
    expect(reset.body.defaults.aiPlayerPriorities).toEqual(DEFAULT_PRIORITIES)
    await api.get('/lab/config').expect(200, reset.body)
  })

  it.each([
    { label: 'string', value: 'gold' },
    { label: 'null', value: null },
    { label: 'lista incompleta', value: DEFAULT_PRIORITIES.slice(1) },
    {
      label: 'item desconhecido',
      value: [...DEFAULT_PRIORITIES.slice(1), 'other'],
    },
    { label: 'duplicata', value: [...DEFAULT_PRIORITIES.slice(1), 'gold'] },
  ])('REQ-181: recusa $label e preserva a configuração', async ({ value }) => {
    const api = request(app.getHttpServer())
    const before = await api.get('/lab/config').expect(200)
    const rejected = await api
      .patch('/lab/config')
      .send({ aiPlayerPriorities: value, initialGold: 1 })
      .expect(400)

    expect(rejected.body.error).toMatchObject({
      code: 'LAB_CONFIG_INVALID',
      details: {
        fields: [{ field: 'aiPlayerPriorities', reason: 'invalidPriorities' }],
      },
    })
    await api.get('/lab/config').expect(200, before.body)
  })

  it('REQ-181: preserva as prioridades gravadas após edição e reset do laboratório', async () => {
    const api = request(app.getHttpServer())
    const parties = app.get(PartiesRepository)
    const create = () => postParty(app, { ...WARRIOR_BODY, aiHelperCount: 1 })

    const initial = await create()
    await api
      .patch('/lab/config')
      .send({ aiPlayerPriorities: CUSTOM_PRIORITIES })
      .expect(200)
    const customized = await create()
    await api.post('/lab/config/reset').expect(200)
    const afterReset = await create()

    for (const [id, priorities] of [
      [initial.id, DEFAULT_PRIORITIES],
      [customized.id, CUSTOM_PRIORITIES],
      [afterReset.id, DEFAULT_PRIORITIES],
    ] as const) {
      const stored = await parties.findById(id)
      expect(stored?.config).toMatchObject({ aiPlayerPriorities: priorities })
    }
  })

  it('REQ-181: restaura o padrão em um save v11 sem a chave', async () => {
    const { id } = await postParty(app)
    const party = await app.get(PartiesRepository).findById(id)
    if (!party) throw new Error('Save ausente')
    const row = DrizzlePartyMapper.toDrizzle(party)
    const config = { ...row.state.config }
    Reflect.deleteProperty(config, 'aiPlayerPriorities')

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      state: { ...row.state, schemaVersion: 11, config },
    })

    expect(restored.config).toMatchObject({
      aiPlayerPriorities: DEFAULT_PRIORITIES,
    })
  })

  it('REQ-182/D-156: entrega a vez ao próximo membro quando o ajudante não tem PA', async () => {
    const { row } = await makeActiveHelperSave(0)
    const active = DrizzlePartyMapper.toDomain(row)

    await executeAiTurn(active)

    expect(active.turn.memberId).toEqual(active.hostMemberId)
    expect(active.turn.actionPoints).toBe(active.config.actionPointsPerTurn)
  })

  it('REQ-182/D-156: recupera saúde em segurança e repete a decisão a partir do mesmo save', async () => {
    const { row, helper } = await makeActiveHelperSave(1)
    helper.player.health = 1

    async function playFromSnapshot() {
      const party = DrizzlePartyMapper.toDomain(structuredClone(row))
      await executeAiTurn(party)
      const player = party.members.find(({ id }) => id.toString() === helper.id)
      expect(player?.player.health).toBeGreaterThan(1)
      expect(party.turn.memberId).toEqual(party.hostMemberId)
      return {
        player: player?.player,
        rngState: party.rngState,
        turn: party.turn,
      }
    }

    const first = await playFromSnapshot()
    expect(await playFromSnapshot()).toEqual(first)
  })

  it('REQ-182/D-156: mede cinco vezes consecutivas de ajudantes', async () => {
    const { id } = await postParty(app, { ...WARRIOR_BODY, aiHelperCount: 5 })
    const stored = await app.get(PartiesRepository).findById(id)
    if (!stored) throw new Error('Save ausente')
    const row = DrizzlePartyMapper.toDrizzle(stored)
    const helpers = row.state.members.filter(({ kind }) => kind === 'aiHelper')
    expect(helpers).toHaveLength(5)

    row.status = 'inSession'
    row.state.rngState = [0, 0, 0, 10]
    row.state.turnOrder = [
      ...helpers.map(({ id }) => id),
      row.state.hostMemberId,
    ]
    row.state.turn.memberId = helpers[0].id
    row.state.turn.actionPoints = row.state.config.actionPointsPerTurn
    for (const { player } of helpers) player.health = 1

    const durations: number[] = []
    for (let sample = 0; sample < 5; sample++) {
      const party = DrizzlePartyMapper.toDomain(structuredClone(row))
      const start = performance.now()
      for (const helper of helpers) {
        expect(party.turn.memberId.toString()).toBe(helper.id)
        await executeAiTurn(party)
      }
      durations.push(performance.now() - start)

      expect(party.turn.memberId).toEqual(party.hostMemberId)
      for (const member of party.members.filter(
        ({ kind }) => kind === 'aiHelper'
      ))
        expect(member.player.health).toBeGreaterThan(1)
    }
    console.info(
      `D-156 — cinco ajudantes, duração por amostra (ms): ${durations.map((ms) => ms.toFixed(1)).join(', ')}`
    )
  })
})
