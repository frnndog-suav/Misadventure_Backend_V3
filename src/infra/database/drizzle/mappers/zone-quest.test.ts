import { describe, expect, it, vi } from 'vitest'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { TakePartyActionUseCase } from '@/domain/campaign/application/use-cases/take-party-action'
import type { TZoneQuestCard } from '@/domain/catalog/enterprise/value-objects/card'
import {
  findPartyCards,
  PartyPresenter,
} from '@/infra/http/presenters/party-presenter'
import {
  makeDimensionCard,
  makeUrbanZoneCard,
} from '../../../../../test/factories/make-card'
import { makeParty } from '../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../test/fakes/fixed-clock'
import { InMemoryCardCatalog } from '../../../../../test/fakes/in-memory-card-catalog'
import { sequentialIds } from '../../../../../test/fakes/sequential-ids'
import { InMemoryPartiesRepository } from '../../../../../test/repositories/in-memory-parties-repository'
import { DrizzlePartyMapper } from './drizzle-party-mapper'

const harbor = makeUrbanZoneCard()
const mine = makeUrbanZoneCard({ id: 'fixture.old-mine', title: 'Mina' })
const location = { type: 'zoneTitle', title: mine.title } as const
const stages = [
  {
    type: 'interaction',
    text: 'Leia o bilhete',
    location: { type: 'zoneType', zoneType: 'urban' },
  },
  { type: 'interaction', text: 'Entregue o bilhete', location },
] as const
const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map(
  (letter): TZoneQuestCard => ({
    type: 'zoneQuest',
    id: `fixture.quest-${letter}`,
    collectionId: 'fixture',
    title: `Missão ${letter}`,
    summary: `Resumo ${letter}`,
    stages,
    rewards: [],
  })
)

function offer({ id, title, summary }: TZoneQuestCard) {
  return { questCardId: id, title, summary }
}

async function setup(deck?: TZoneQuestCard[], maxOpenQuests = 3) {
  const repository = new InMemoryPartiesRepository()
  const catalog = new InMemoryCardCatalog()
  catalog.cards = [harbor, mine, makeDimensionCard(), a, b, c, d, e]
  const ids = sequentialIds('quest')
  const clock = fixedClock('2026-11-22T12:00:00.000Z')
  const actions = new TakePartyActionUseCase(repository, clock, catalog, ids)
  const initial = makeParty()
  const { dimension, turn } = initial
  const party = makeParty({
    status: 'inSession',
    turn,
    config: { ...initial.config, maxOpenQuests },
    dimension: {
      ...dimension,
      map: {
        ...dimension.map,
        zones: dimension.map.zones.map((zone) =>
          zone.zoneId === harbor.id && deck
            ? { ...zone, questDeck: deck.map(({ id }) => id) }
            : zone
        ),
      },
    },
  })
  await repository.create(party)
  const partyId = party.id.toString()
  const stored = async () => {
    const current = await repository.findById(partyId)
    if (!current) throw new Error('Grupo de teste ausente')
    return current
  }
  const project = async (current: Party) =>
    PartyPresenter.toHTTP(current, await findPartyCards(catalog, current))
      .members[0].player
  const execute = (body: unknown) => actions.execute({ partyId, body })
  const act = async (body: unknown) => {
    const result = await execute(body)
    if (result.isLeft()) throw result.value
    return result.value.party
  }
  return { party, repository, ids, stored, project, execute, act }
}

describe('T-56 — ciclo de missões de zona', () => {
  it('REQ-131: projeta as ofertas, repõe a vaga escolhida e mantém a ordem de aceitação', async () => {
    const { party, project, act } = await setup([a, b, c, d, e])
    const before = await project(party)
    expect(before.questBoard).toEqual([a, b, c].map(offer))
    expect(before.questChoices).toEqual(
      [a, b, c].map(({ id }) => ({
        type: 'takeQuest',
        questCardId: id,
        actionPoints: 1,
        gold: 0,
      }))
    )
    expect(before.availableActions).toContain('takeQuest')

    const accepted = await act({ type: 'takeQuest', questCardId: b.id })
    expect(accepted.turn.actionPoints).toBe(2)
    expect(await project(accepted)).toMatchObject({
      questBoard: [a, d, c].map(offer),
      openQuests: [
        {
          type: 'zoneQuest',
          questId: 'quest-1',
          questCardId: b.id,
          title: b.title,
          originZoneId: harbor.id,
          stage: {
            index: 0,
            text: stages[0].text,
            location: stages[0].location,
            status: 'ready',
            objectives: null,
          },
        },
      ],
    })
    const second = await act({ type: 'takeQuest', questCardId: a.id })
    expect((await project(second)).openQuests).toMatchObject([
      { questCardId: b.id },
      { questCardId: a.id },
    ])
  })

  it('REQ-131 e D-111: avança interação e mantém a etapa e o quadro ao restaurar o save', async () => {
    const { act, project } = await setup([a, b, c, d, e])
    await act({ type: 'takeQuest', questCardId: b.id })
    const advanced = await act({ type: 'continueQuest', questId: 'quest-1' })
    expect(advanced.turn.actionPoints).toBe(1)
    const player = await project(advanced)
    expect(player.openQuests).toMatchObject([
      {
        stage: {
          index: 1,
          text: stages[1].text,
          location,
          status: 'ready',
          objectives: null,
        },
      },
    ])
    expect(player.questChoices).not.toContainEqual(
      expect.objectContaining({ type: 'finishQuest' })
    )
    const row = DrizzlePartyMapper.toDrizzle(advanced)
    const restored = DrizzlePartyMapper.toDomain(row)
    expect(await project(restored)).toEqual(player)
    expect(DrizzlePartyMapper.toDrizzle(restored)).toEqual(row)
  })

  it('REQ-131: abandona em outra zona com 0 PA e reaceita com novo ID e etapa inicial', async () => {
    const { act, project } = await setup([b])
    await act({ type: 'takeQuest', questCardId: b.id })
    await act({ type: 'continueQuest', questId: 'quest-1' })
    const moved = await act({ type: 'move', zoneId: mine.id })
    expect(moved.turn.actionPoints).toBe(0)
    const away = await project(moved)
    expect(away.questBoard).toEqual([])
    expect(away.questChoices).toEqual([
      { type: 'abandonQuest', questId: 'quest-1', actionPoints: 0, gold: 0 },
    ])
    expect(away.availableActions).toContain('abandonQuest')

    const abandoned = await act({ type: 'abandonQuest', questId: 'quest-1' })
    expect(abandoned.turn.actionPoints).toBe(0)
    expect((await project(abandoned)).openQuests).toEqual([])
    await act({ type: 'endTurn' })
    const returned = await act({ type: 'move', zoneId: harbor.id })
    expect((await project(returned)).questBoard).toEqual([offer(b)])
    const accepted = await act({ type: 'takeQuest', questCardId: b.id })
    expect((await project(accepted)).openQuests).toMatchObject([
      {
        questId: 'quest-2',
        questCardId: b.id,
        stage: { index: 0, status: 'ready' },
      },
    ])
  })

  it('REQ-131: devolve ao fundo quando o quadro está cheio', async () => {
    const { act, project } = await setup([a, b, c, d, e])
    await act({ type: 'takeQuest', questCardId: b.id })
    const abandoned = await act({ type: 'abandonQuest', questId: 'quest-1' })
    expect((await project(abandoned)).questBoard).toEqual([a, d, c].map(offer))
    const firstReplacement = await act({ type: 'takeQuest', questCardId: a.id })
    expect((await project(firstReplacement)).questBoard).toEqual(
      [e, d, c].map(offer)
    )
    const secondReplacement = await act({
      type: 'takeQuest',
      questCardId: c.id,
    })
    expect((await project(secondReplacement)).questBoard).toEqual(
      [e, d, b].map(offer)
    )
  })

  it('REQ-131 e D-111: recusa finalizar na zona errada e retira a carta ao concluir a última interação', async () => {
    const { act, execute, project, stored } = await setup([b])
    await act({ type: 'takeQuest', questCardId: b.id })
    await act({ type: 'continueQuest', questId: 'quest-1' })
    const before = DrizzlePartyMapper.toDrizzle(await stored())
    const refused = await execute({ type: 'finishQuest', questId: 'quest-1' })
    expect(refused.value).toMatchObject({
      code: 'ACTION_NOT_ALLOWED',
      details: { reason: 'questWrongZone', questId: 'quest-1' },
    })
    expect(DrizzlePartyMapper.toDrizzle(await stored())).toEqual(before)

    await act({ type: 'move', zoneId: mine.id })
    const nextTurn = await act({ type: 'endTurn' })
    expect((await project(nextTurn)).questChoices).toContainEqual({
      type: 'finishQuest',
      questId: 'quest-1',
      actionPoints: 1,
      gold: 0,
    })
    const finished = await act({ type: 'finishQuest', questId: 'quest-1' })
    expect(finished.turn.actionPoints).toBe(nextTurn.turn.actionPoints - 1)
    expect((await project(finished)).openQuests).toEqual([])
    const returned = await act({ type: 'move', zoneId: harbor.id })
    expect((await project(returned)).questBoard).toEqual([])
  })

  it.each([
    [
      { type: 'takeQuest', questCardId: d.id },
      { reason: 'questOfferUnavailable', questCardId: d.id },
    ],
    [
      { type: 'abandonQuest', questId: 'missing' },
      { reason: 'questNotOpen', questId: 'missing' },
    ],
  ])(
    'REQ-131 e D-111: recusa %j e preserva o save e o RNG',
    async (body, details) => {
      const { execute, repository, ids, stored } = await setup([a, b, c, d])
      const save = vi.spyOn(repository, 'save')
      const nextId = vi.spyOn(ids, 'next')
      const before = DrizzlePartyMapper.toDrizzle(await stored())
      const result = await execute(body)
      expect(result.isLeft()).toBe(true)
      expect(result.value).toMatchObject({
        code: 'ACTION_NOT_ALLOWED',
        details,
      })
      expect(save).not.toHaveBeenCalled()
      expect(nextId).not.toHaveBeenCalled()
      expect(DrizzlePartyMapper.toDrizzle(await stored())).toEqual(before)
    }
  )

  it('REQ-131: aplica o limite geral e omite a opção de aceitar', async () => {
    const { act, execute, project } = await setup([a, b], 1)
    const accepted = await act({ type: 'takeQuest', questCardId: a.id })
    expect((await project(accepted)).questChoices).not.toContainEqual(
      expect.objectContaining({ type: 'takeQuest' })
    )
    const result = await execute({ type: 'takeQuest', questCardId: b.id })
    expect(result.value).toMatchObject({
      code: 'ACTION_NOT_ALLOWED',
      details: { reason: 'questLimitReached', questCardId: b.id },
    })
  })

  it('REQ-131: valida os campos públicos da intenção', async () => {
    const { execute } = await setup([a])
    const result = await execute({ type: 'takeQuest', actionPoints: 0 })
    expect(result.value).toMatchObject({
      code: 'ACTION_INVALID',
      details: {
        fields: expect.arrayContaining([
          { field: 'questCardId', reason: 'required' },
          { field: 'actionPoints', reason: 'unknownKey' },
        ]),
      },
    })
  })

  it('REQ-131 e D-111: lê save legado sem deck de missão com projeções vazias', async () => {
    const { party, project } = await setup()
    const row = DrizzlePartyMapper.toDrizzle(party)
    const state = { ...row.state, schemaVersion: 9 }
    const restored = DrizzlePartyMapper.toDomain({ ...row, state })
    expect(await project(restored)).toMatchObject({
      questBoard: [],
      openQuests: [],
      questChoices: [],
    })
  })
})
