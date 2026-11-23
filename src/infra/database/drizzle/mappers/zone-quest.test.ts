import { describe, expect, it, vi } from 'vitest'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import { EndSessionUseCase } from '@/domain/campaign/application/use-cases/end-session'
import { GetPartyUseCase } from '@/domain/campaign/application/use-cases/get-party'
import { ResumeLegacyKnockout } from '@/domain/campaign/application/use-cases/resume-legacy-knockout'
import { StartSessionUseCase } from '@/domain/campaign/application/use-cases/start-session'
import { TakePartyActionUseCase } from '@/domain/campaign/application/use-cases/take-party-action'
import type { TPartyProps } from '@/domain/campaign/enterprise/entities/party'
import type { TPlayerState } from '@/domain/campaign/enterprise/entities/party-member'
import type {
  TCard,
  TAttribute,
  TClassDefinition,
  TZoneQuestCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  findPartyCards,
  PartyPresenter,
} from '@/infra/http/presenters/party-presenter'
import {
  makeAttributeCard,
  makeClassDefinition,
  makeCombatEventCard,
  makeDimensionCard,
  makeEnemy,
  makeItemCard,
  makeRandomEventCard,
  makeUrbanZoneCard,
  makeZoneCard,
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
const carried = makeItemCard({ id: 'fixture.carried' })
const prize = makeItemCard({ id: 'fixture.quest-prize' })
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

async function setup(
  deck?: TZoneQuestCard[],
  maxOpenQuests = 3,
  fullInventory = false,
  encounter?: { cards: TCard[]; deckCardId: string; health: number },
  options: {
    player?: Partial<TPlayerState>
    config?: Partial<TPartyProps['config']>
    classes?: TClassDefinition[]
    cards?: TCard[]
  } = {}
) {
  const repository = new InMemoryPartiesRepository()
  const catalog = new InMemoryCardCatalog()
  catalog.cards = [
    encounter ? { ...harbor, zoneActions: ['startEvent'] } : harbor,
    mine,
    encounter
      ? makeDimensionCard({ id: 'fixture.test-dimension' })
      : makeDimensionCard(),
    carried,
    prize,
    ...(encounter?.cards ?? []),
    ...(options.cards ?? []),
    ...(deck ?? [a, b, c, d, e]),
  ]
  catalog.classes = options.classes ?? []
  const ids = sequentialIds('quest')
  const clock = fixedClock('2026-11-22T12:00:00.000Z')
  const actions = new TakePartyActionUseCase(repository, clock, catalog, ids)
  const initial = makeParty()
  const [host] = initial.members
  const { dimension, turn } = initial
  const withPlayer = (members: PartyMember[]) =>
    members.map((member) =>
      options.player
        ? PartyMember.create(
            {
              characterName: member.characterName,
              kind: member.kind,
              player: { ...member.player, ...options.player },
            },
            member.id
          )
        : member
    )
  const party = makeParty({
    status: 'inSession',
    turn,
    members: withPlayer(
      fullInventory
        ? [
            PartyMember.create(
              {
                characterName: host.characterName,
                kind: host.kind,
                player: {
                  ...host.player,
                  vigor: 4,
                  health: encounter?.health ?? host.player.health,
                  modifiers: encounter
                    ? { ...host.player.modifiers, evasion: 0 }
                    : host.player.modifiers,
                  inventory: [{ cardId: carried.id, quantity: 1 }],
                },
              },
              host.id
            ),
          ]
        : [...initial.members]
    ),
    config: {
      ...initial.config,
      ...options.config,
      maxOpenQuests,
      inventoryCapacity: fullInventory ? 1 : initial.config.inventoryCapacity,
    },
    eventDecks: encounter
      ? [{ zoneType: 'urban', cards: [encounter.deckCardId], discard: [] }]
      : initial.eventDecks,
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
    PartyPresenter.toHTTP(
      current,
      await findPartyCards(catalog, current),
      await catalog.listClasses()
    ).members[0].player
  const execute = (body: unknown) => actions.execute({ partyId, body })
  const act = async (body: unknown) => {
    const result = await execute(body)
    if (result.isLeft())
      throw new Error(
        `Ação recusada: ${JSON.stringify(body)} → ${JSON.stringify(result.value)}`
      )
    return result.value.party
  }
  return {
    party,
    repository,
    catalog,
    clock,
    ids,
    stored,
    project,
    execute,
    act,
  }
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

describe('T-57 — tentativas e progresso de missão de zona', () => {
  const emptyOutcome = { text: 'Sem efeito.', steps: [] }
  const prizeOutcome = {
    text: 'Receba uma recompensa.',
    steps: [{ type: 'grantReward', cardId: prize.id, copies: 1 }],
  } as const
  const event = makeRandomEventCard({
    requirements: [
      {
        id: 'vigor',
        kind: 'minimum',
        stat: 'vigor',
        value: 1,
        text: 'Vigor mínimo 1.',
      },
    ],
    goodOutcome: prizeOutcome,
    badOutcome: emptyOutcome,
  })
  const deckCombat = makeCombatEventCard()
  const urban = stages[0].location
  const attempt = { type: 'continueQuest', questId: 'quest-1' }

  async function reload(game: Awaited<ReturnType<typeof setup>>) {
    const row = DrizzlePartyMapper.toDrizzle(await game.stored())
    const restored = DrizzlePartyMapper.toDomain(row)
    await game.repository.save(restored)
    return restored
  }

  it.each([
    { action: 'resolveEvent', status: 'completed' },
    { action: 'giveUpEvent', status: 'ready' },
  ])(
    'REQ-132 e D-111: $action deixa a tentativa vinculada em $status e preserva o deck',
    async ({ action, status }) => {
      const quest: TZoneQuestCard = {
        ...a,
        stages: [
          {
            type: 'randomEvent',
            text: 'Ajude o viajante',
            location: urban,
            eventCardId: event.id,
          },
          stages[1],
        ],
      }
      const game = await setup([quest], 3, true, {
        cards: [event, deckCombat],
        deckCardId: deckCombat.id,
        health: 22,
      })
      const accepted = await game.act({
        type: 'takeQuest',
        questCardId: quest.id,
      })
      const started = await game.act(attempt)
      expect(started.turn.actionPoints).toBe(accepted.turn.actionPoints - 1)
      expect(await game.project(started)).toMatchObject({
        openQuests: [
          { questId: 'quest-1', stage: { index: 0, status: 'inProgress' } },
        ],
        questChoices: [],
      })
      const restored = await reload(game)
      const encounter = restored.randomEventEncounter
      expect(encounter).toMatchObject({ phase: 'anticipation', card: null })
      const encounterId = encounter!.id
      const revealed = await game.act({ type: 'revealEvent', encounterId })
      expect(revealed.randomEventEncounter?.card?.id).toBe(event.id)
      const resolved = await game.act({ type: action, encounterId })
      expect(await game.project(resolved)).toMatchObject({
        openQuests: [{ questId: 'quest-1', stage: { index: 0, status } }],
      })
      expect(resolved.eventDecks).toEqual(accepted.eventDecks)
      if (status === 'ready') {
        const retry = await game.act(attempt)
        expect(retry.randomEventEncounter?.id).not.toBe(encounterId)
        expect(retry.eventDecks).toEqual(accepted.eventDecks)
      }
    }
  )

  it('REQ-132 e D-111: limita o progresso simultâneo no POST de êxito com recompensa pendente', async () => {
    const [first, second] = [1, 2].map((target): TZoneQuestCard => ({
      ...(target === 1 ? a : b),
      stages: [
        {
          type: 'objectives',
          text: 'Conclua encontros',
          location: urban,
          randomEventSuccesses: target,
          combatVictories: 1,
        },
      ],
    }))
    const game = await setup([first, second], 3, true, {
      cards: [event],
      deckCardId: event.id,
      health: 22,
    })
    for (const quest of [first, second]) {
      await game.act({ type: 'takeQuest', questCardId: quest.id })
    }
    for (const count of [1, 2]) {
      const started = await game.act({ type: 'startEvent' })
      const encounterId = started.randomEventEncounter!.id
      await game.act({ type: 'revealEvent', encounterId })
      const success = await game.act({ type: 'resolveEvent', encounterId })
      const expected = {
        openQuests: [1, 2].map((target) => ({
          questId: `quest-${target}`,
          stage: {
            objectives: {
              randomEventSuccesses: {
                current: Math.min(count, target),
                target,
              },
              combatVictories: { current: 0, target: 1 },
            },
          },
        })),
      }
      expect(await game.project(success)).toMatchObject(expected)
      expect(await game.project(await reload(game))).toMatchObject(expected)
      expect(success.pendingRewards).toMatchObject([{ cardId: prize.id }])
      const delivered = await game.act({
        type: 'resolveReward',
        rewardId: success.pendingRewards[0].id,
        choice: 'leave',
      })
      expect(await game.project(delivered)).toMatchObject(expected)
      await game.act({ type: 'endTurn' })
    }
  })

  it.each([
    { action: 'combatAttack', health: 22, playerDown: false, victories: 1 },
    { action: 'combatAttack', health: 1, playerDown: true, victories: 0 },
    { action: 'escapeCombat', health: 22, playerDown: false, victories: 0 },
    { action: 'endCombatTurn', health: 1, playerDown: true, victories: 0 },
  ])(
    'REQ-132 e D-111: aplica o desfecho de $action com playerDown=$playerDown à tentativa vinculada',
    async ({ action, health, playerDown, victories }) => {
      const enemy = makeEnemy({ count: 1, health: 1 })
      const quest: TZoneQuestCard = {
        ...a,
        stages: [
          {
            type: 'combatEvent',
            text: 'Derrote o inimigo',
            location: urban,
            combat: {
              enemies: [
                {
                  ...enemy,
                  modifiers: {
                    ...enemy.modifiers,
                    attack: 20,
                    accuracy: 100,
                    defense: 0,
                    evasion: 0,
                    celerity: 0,
                    reflection: 1,
                  },
                },
              ],
              goodOutcome: prizeOutcome,
              badOutcome: emptyOutcome,
              noEscape: false,
              escapeThreshold: 0,
            },
          },
        ],
      }
      const objectives: TZoneQuestCard = {
        ...b,
        stages: [
          {
            type: 'objectives',
            text: 'Vença combates',
            location: urban,
            randomEventSuccesses: 1,
            combatVictories: 2,
          },
        ],
      }
      const game = await setup([quest, objectives], 3, true, {
        cards: [
          deckCombat,
          makeAttributeCard(),
          makeAttributeCard({
            id: 'fixture.endurance-basic',
            attributes: ['endurance'],
          }),
        ],
        deckCardId: deckCombat.id,
        health,
      })
      const accepted = await game.act({
        type: 'takeQuest',
        questCardId: quest.id,
      })
      await game.act({ type: 'takeQuest', questCardId: objectives.id })
      const started = await game.act(attempt)
      expect(started.combat).toMatchObject({
        cardId: quest.id,
        enemies: [{ health: 1 }],
      })
      const combat = (await reload(game)).combat!
      if (action !== 'combatAttack') {
        const failed = await game.act({
          type: action,
          combatId: combat.id,
          turnId: combat.turn.id,
        })
        expect(failed.lastCombatResult?.resolution).toBe(
          action === 'escapeCombat' ? 'escaped' : 'defeat'
        )
        expect(failed.eventDecks).toEqual(accepted.eventDecks)
        expect(await game.project(failed)).toMatchObject({
          openQuests: [
            { questId: 'quest-1', stage: { status: 'ready' } },
            {
              questId: 'quest-2',
              stage: {
                objectives: {
                  combatVictories: { current: 0, target: 2 },
                },
              },
            },
          ],
        })
        return
      }
      const victory = await game.act({
        type: 'combatAttack',
        combatId: combat.id,
        turnId: combat.turn.id,
        targetId: combat.enemies[0].id,
      })
      const expected = {
        openQuests: [
          { questId: 'quest-1', stage: { index: 0, status: 'completed' } },
          {
            questId: 'quest-2',
            stage: {
              objectives: {
                combatVictories: { current: victories, target: 2 },
              },
            },
          },
        ],
      }
      const result = {
        cardId: quest.id,
        resolution: 'victory',
        cause: 'enemiesDefeated',
        playerDown,
      }
      expect(victory.combat).toBeNull()
      expect(victory.lastCombatResult).toMatchObject(result)
      expect(victory.eventDecks).toEqual(accepted.eventDecks)
      expect(await game.project(victory)).toMatchObject(expected)
      const pending = victory.pendingRewards[0]
      expect(pending).toMatchObject({
        cardId: prize.id,
        source: { type: 'combatEvent', combatId: combat.id },
      })
      if (playerDown) {
        expect(await game.project(victory)).toMatchObject({
          down: true,
          health: 0,
          availableActions: ['resolveReward'],
        })
      }

      await reload(game)
      const request = { partyId: game.party.id.toString() }
      const { repository, clock, catalog, ids } = game
      const resume = new ResumeLegacyKnockout(catalog, ids)
      const getParty = new GetPartyUseCase(repository, clock, resume)
      const read = await getParty.execute(request)
      if (read.isLeft()) throw read.value
      expect(await game.project(read.value.party)).toMatchObject(expected)
      expect(read.value.party.pendingRewards).toEqual([pending])
      const closed = await new EndSessionUseCase(repository, clock).execute(
        request
      )
      if (closed.isLeft()) throw closed.value
      const reopened = await new StartSessionUseCase(
        repository,
        clock,
        resume
      ).execute(request)
      if (reopened.isLeft()) throw reopened.value
      expect(await game.project(reopened.value.party)).toMatchObject(expected)
      expect(reopened.value.party.pendingRewards).toEqual([pending])

      const delivered = await game.act({
        type: 'resolveReward',
        rewardId: pending.id,
        choice: 'leave',
      })
      expect(delivered.pendingRewards).toEqual([])
      expect(delivered.lastCombatResult).toMatchObject(result)
      expect(delivered.eventDecks).toEqual(accepted.eventDecks)
      expect(await game.project(delivered)).toMatchObject(expected)
      if (playerDown) {
        expect(delivered.members[0].player.health).toBeGreaterThan(0)
        expect(delivered.members[0].player.down).toBe(false)
        expect(delivered.members[0].player.lastKnockout).toMatchObject({
          combatId: combat.id,
        })
      }
    }
  )
})

describe('T-57 — Pico na conclusão de missão de zona', () => {
  it.each([
    { zonePeak: undefined, explicitPeak: [], expectedPeak: 13 },
    { zonePeak: 9, explicitPeak: [7], expectedPeak: 17 },
    { zonePeak: 0, explicitPeak: [], expectedPeak: 10 },
  ])(
    'REQ-132 e D-111: conserva Pico $expectedPeak durante a entrega pendente',
    async ({ zonePeak, explicitPeak, expectedPeak }) => {
      const quest: TZoneQuestCard = {
        ...a,
        stages: [stages[0]],
        rewards: [
          { type: 'grantReward', cardId: prize.id, copies: 1 },
          ...explicitPeak.map(
            (amount) =>
              ({
                type: 'effect',
                effect: {
                  text: 'Ganhe Pico.',
                  activation: [{ kind: 'gainPeak', amount }],
                  duration: { kind: 'immediate' },
                  mark: null,
                },
              }) as const
          ),
          {
            type: 'effect',
            effect: {
              text: 'Ganhe 2 de ouro.',
              activation: [{ kind: 'gainGold', amount: 2 }],
              duration: { kind: 'immediate' },
              mark: null,
            },
          },
        ],
      }
      const {
        party,
        repository,
        catalog,
        clock,
        ids,
        act,
        execute,
        project,
        stored,
      } = await setup([quest], 3, true)
      const partyId = party.id.toString()
      const request = { partyId }
      const resume = new ResumeLegacyKnockout(catalog, ids)
      const getParty = new GetPartyUseCase(repository, clock, resume)
      const endSession = new EndSessionUseCase(repository, clock)
      const startSession = new StartSessionUseCase(repository, clock, resume)
      const expectedPlayer = { peak: expectedPeak, vigor: 4, openQuests: [] }
      const completion = {
        dimensionCardId: party.dimension.dimensionCardId,
        questCardId: quest.id,
      }
      const original = DrizzlePartyMapper.toDrizzle(party)
      const config = { ...original.state.config }
      if (zonePeak === undefined) delete config.zoneQuestPeakGain
      else config.zoneQuestPeakGain = zonePeak
      await repository.save(
        DrizzlePartyMapper.toDomain({
          ...original,
          state: { ...original.state, config },
        })
      )

      await act({ type: 'takeQuest', questCardId: quest.id })
      expect(await project(await stored())).toMatchObject({
        peak: 10,
        vigor: 4,
      })
      const finish = { type: 'finishQuest', questId: 'quest-1' }
      const finished = await act(finish)
      expect(await project(finished)).toMatchObject({
        ...expectedPlayer,
        gold: 10,
      })
      expect(finished.members[0].player.completedZoneQuests).toEqual([
        completion,
      ])
      expect(finished.pendingRewards).toMatchObject([
        {
          cardId: prize.id,
          source: { type: 'quest', questId: 'quest-1', questCardId: quest.id },
        },
      ])
      const [pending] = finished.pendingRewards

      const row = DrizzlePartyMapper.toDrizzle(await stored())
      await repository.save(DrizzlePartyMapper.toDomain(row))
      const read = await getParty.execute(request)
      if (read.isLeft()) throw read.value
      expect(await project(read.value.party)).toMatchObject(expectedPlayer)
      expect(read.value.party.pendingRewards).toEqual([pending])

      const closed = await endSession.execute(request)
      if (closed.isLeft()) throw closed.value
      const reopened = await startSession.execute(request)
      if (reopened.isLeft()) throw reopened.value
      expect(await project(reopened.value.party)).toMatchObject(expectedPlayer)
      expect(
        reopened.value.party.members[0].player.completedZoneQuests
      ).toEqual([completion])
      expect(reopened.value.party.pendingRewards).toEqual([pending])

      const resolved = await act({
        type: 'resolveReward',
        rewardId: pending.id,
        choice: 'leave',
      })
      expect(resolved.pendingRewards).toEqual([])
      expect(await project(resolved)).toMatchObject({
        ...expectedPlayer,
        gold: 12,
      })
      expect(resolved.members[0].player.completedZoneQuests).toEqual([
        completion,
      ])
      const retry = await execute(finish)
      expect(retry.value).toMatchObject({ details: { reason: 'questNotOpen' } })
      expect(await project(await stored())).toMatchObject(expectedPlayer)
    }
  )
})

describe('T-58 — provação e mentor', () => {
  const specialization = (id: string) =>
    ({
      id,
      name: id,
      additionalAttributes: ['wisdom'],
      reinforcedAttributes: ['endurance'],
      effects: [],
    }) as const
  const classes = [
    makeClassDefinition({
      specializations: ['knight', 'guardian', 'duelist', 'vanguard'].map(
        specialization
      ),
    }),
    makeClassDefinition({
      playerClass: 'rogue',
      name: 'Ladino',
      specializations: ['shadow', 'thief', 'trickster', 'duelist'].map(
        specialization
      ),
    }),
    makeClassDefinition({
      playerClass: 'mage',
      name: 'Mago',
      specializations: ['pyromancer', 'seer', 'warlock', 'sage'].map(
        specialization
      ),
    }),
  ]
  const trial = {
    type: 'takeTrialQuest',
    classId: 'warrior',
    specializationId: 'knight',
  }
  const knight = {
    playerClass: 'warrior',
    specializationId: 'knight',
    deckLockMet: false,
  } as const
  const rogueClass = { playerClass: 'rogue', deckLockMet: true } as const
  const warriorClass = { playerClass: 'warrior', deckLockMet: true } as const
  const shadow = {
    playerClass: 'rogue',
    specializationId: 'shadow',
    deckLockMet: false,
  } as const
  const instant = {
    trialRandomEventTarget: 0,
    trialCombatTarget: 0,
    mentorRandomEventTarget: 0,
    mentorCombatTarget: 0,
  }
  const forest = makeZoneCard({
    id: 'fixture.forest',
    title: 'Floresta',
    zoneType: 'forest',
  })
  const event = makeRandomEventCard({
    requirements: [
      {
        id: 'vigor',
        kind: 'minimum',
        stat: 'vigor',
        value: 1,
        text: 'Vigor mínimo 1.',
      },
    ],
    goodOutcome: {
      text: 'Receba uma recompensa.',
      steps: [{ type: 'grantReward', cardId: prize.id, copies: 1 }],
    },
    badOutcome: { text: 'Sem efeito.', steps: [] },
  })

  function begin(
    player: Partial<TPlayerState> = {},
    config: Partial<TPartyProps['config']> = {},
    maxOpenQuests = 3
  ) {
    return setup([a, b], maxOpenQuests, false, undefined, {
      player: { peak: 30, ...player },
      config,
      classes,
      cards: [forest],
    })
  }

  async function reload(game: Awaited<ReturnType<typeof setup>>) {
    const row = DrizzlePartyMapper.toDrizzle(await game.stored())
    const restored = DrizzlePartyMapper.toDomain(row)
    await game.repository.save(restored)
    return restored
  }

  it('REQ-133: oferece e aceita a provação com 1 PA e contadores em zero', async () => {
    const game = await begin()
    const before = await game.project(await game.stored())
    expect(before.questChoices).toEqual([
      ...[a, b].map(({ id }) => ({
        type: 'takeQuest',
        questCardId: id,
        actionPoints: 1,
        gold: 0,
      })),
      ...['knight', 'guardian', 'duelist', 'vanguard'].map(
        (specializationId) => ({
          ...trial,
          specializationId,
          actionPoints: 1,
          gold: 0,
        })
      ),
    ])
    const actions = before.availableActions
    expect(actions.indexOf('takeTrialQuest')).toBe(
      actions.indexOf('takeQuest') + 1
    )
    const accepted = await game.act(trial)
    expect(accepted.turn.actionPoints).toBe(2)
    const expected = {
      openQuests: [
        {
          questId: 'quest-1',
          type: 'trialQuest',
          title: 'Missão de provação',
          classId: 'warrior',
          specializationId: 'knight',
          objectives: {
            randomEventSuccesses: { current: 0, target: 3 },
            combatVictories: { current: 0, target: 3 },
          },
        },
      ],
    }
    expect(await game.project(accepted)).toMatchObject(expected)
    expect(await game.project(await reload(game))).toMatchObject(expected)
  })

  it.each([
    {
      name: 'Pico abaixo do mínimo',
      player: { peak: 29 },
      body: trial,
      details: {
        reason: 'questPeakTooLow',
        classId: 'warrior',
        specializationId: 'knight',
      },
    },
    {
      name: 'classe não adquirida',
      player: {},
      body: { ...trial, classId: 'mage', specializationId: 'seer' },
      details: { reason: 'questClassIneligible', classId: 'mage' },
    },
    {
      name: 'classe já especializada',
      player: { specializations: [knight] },
      body: { ...trial, specializationId: 'guardian' },
      details: { reason: 'questClassIneligible', classId: 'warrior' },
    },
    {
      name: 'especialização que a classe não oferece',
      player: {},
      body: { ...trial, specializationId: 'ghost' },
      details: {
        reason: 'questSpecializationIneligible',
        classId: 'warrior',
        specializationId: 'ghost',
      },
    },
    {
      name: 'zona fora de Urbana e Habitada',
      player: { zoneId: forest.id },
      body: trial,
      details: {
        reason: 'questWrongZone',
        classId: 'warrior',
        specializationId: 'knight',
      },
    },
  ])(
    'REQ-133: recusa a provação por $name e preserva o save',
    async ({ player, body, details }) => {
      const game = await begin(player)
      const row = DrizzlePartyMapper.toDrizzle(await game.stored())
      const result = await game.execute(body)
      expect(result.value).toMatchObject({
        code: 'ACTION_NOT_ALLOWED',
        details,
      })
      expect(DrizzlePartyMapper.toDrizzle(await game.stored())).toEqual(row)
    }
  )

  it('REQ-133: aceita só uma genérica e conta a genérica no limite geral', async () => {
    const game = await begin({ playerClasses: [warriorClass, rogueClass] })
    await game.act(trial)
    for (const body of [
      { ...trial, classId: 'rogue', specializationId: 'shadow' },
      { type: 'trainWithMentor', classId: 'mage' },
    ]) {
      const result = await game.execute(body)
      expect(result.value).toMatchObject({
        code: 'ACTION_NOT_ALLOWED',
        details: { reason: 'genericQuestAlreadyOpen' },
      })
    }
    const projected = await game.project(await game.stored())
    expect(projected.questChoices).not.toContainEqual(
      expect.objectContaining({ type: 'takeTrialQuest' })
    )
    const limited = await begin({}, {}, 1)
    await limited.act({ type: 'takeQuest', questCardId: a.id })
    const refused = await limited.execute(trial)
    expect(refused.value).toMatchObject({
      code: 'ACTION_NOT_ALLOWED',
      details: { reason: 'questLimitReached' },
    })
    expect(
      (await limited.project(await limited.stored())).questChoices
    ).not.toContainEqual(expect.objectContaining({ type: 'takeTrialQuest' }))
  })

  it('REQ-132 e REQ-133: conta o êxito aleatório na provação mesmo com recompensa pendente', async () => {
    const game = await setup(
      [a],
      3,
      true,
      { cards: [event], deckCardId: event.id, health: 22 },
      { player: { peak: 30 }, classes }
    )
    await game.act(trial)
    const started = await game.act({ type: 'startEvent' })
    const encounterId = started.randomEventEncounter!.id
    await game.act({ type: 'revealEvent', encounterId })
    const success = await game.act({ type: 'resolveEvent', encounterId })
    const expected = {
      openQuests: [
        {
          type: 'trialQuest',
          objectives: {
            randomEventSuccesses: { current: 1, target: 3 },
            combatVictories: { current: 0, target: 3 },
          },
        },
      ],
    }
    expect(success.pendingRewards).toMatchObject([{ cardId: prize.id }])
    expect(await game.project(success)).toMatchObject(expected)
    expect(await game.project(await reload(game))).toMatchObject(expected)
    const delivered = await game.act({
      type: 'resolveReward',
      rewardId: success.pendingRewards[0].id,
      choice: 'leave',
    })
    expect(await game.project(delivered)).toMatchObject(expected)
  })

  it('REQ-133: recusa finalizar com metas incompletas e não há continuar', async () => {
    const game = await begin()
    await game.act(trial)
    const cases = [
      { type: 'finishQuest', reason: 'questObjectivesIncomplete' },
      { type: 'continueQuest', reason: 'questWrongStage' },
    ]
    for (const { type, reason } of cases) {
      const result = await game.execute({ type, questId: 'quest-1' })
      expect(result.value).toMatchObject({
        code: 'ACTION_NOT_ALLOWED',
        details: { reason, questId: 'quest-1' },
      })
    }
    const choices = (await game.project(await game.stored())).questChoices
    expect(choices).toContainEqual({
      type: 'abandonQuest',
      questId: 'quest-1',
      actionPoints: 0,
      gold: 0,
    })
    expect(choices).not.toContainEqual(
      expect.objectContaining({ type: 'finishQuest' })
    )
    expect(choices).not.toContainEqual(
      expect.objectContaining({ type: 'continueQuest' })
    )
  })

  it('REQ-133 e REQ-132: finaliza a provação, concede a especialização inativa e o Pico', async () => {
    const game = await begin({}, instant)
    await game.act(trial)
    const choices = (await game.project(await game.stored())).questChoices
    expect(choices).toContainEqual({
      type: 'finishQuest',
      questId: 'quest-1',
      actionPoints: 1,
      gold: 0,
    })
    const finished = await game.act({ type: 'finishQuest', questId: 'quest-1' })
    expect(finished.turn.actionPoints).toBe(1)
    const expected = {
      peak: 35,
      vigor: 10,
      openQuests: [],
      playerClasses: [{ playerClass: 'warrior', deckLockMet: true }],
      specializations: [
        { classId: 'warrior', specializationId: 'knight', deckLockMet: false },
      ],
    }
    expect(await game.project(finished)).toMatchObject(expected)
    expect(await game.project(await reload(game))).toMatchObject(expected)
    const again = await game.execute({
      type: 'finishQuest',
      questId: 'quest-1',
    })
    expect(again.value).toMatchObject({
      details: { reason: 'questNotOpen' },
    })
  })

  it('REQ-133: abandona a provação sem custo e permite aceitá-la de novo com outro ID', async () => {
    const game = await begin()
    const accepted = await game.act(trial)
    const board = (await game.project(accepted)).questBoard
    const abandoned = await game.act({
      type: 'abandonQuest',
      questId: 'quest-1',
    })
    expect(abandoned.turn.actionPoints).toBe(accepted.turn.actionPoints)
    expect(await game.project(abandoned)).toMatchObject({
      openQuests: [],
      questBoard: board,
    })
    await game.act({ ...trial, specializationId: 'guardian' })
    expect(await game.project(await game.stored())).toMatchObject({
      openQuests: [
        {
          questId: 'quest-2',
          type: 'trialQuest',
          specializationId: 'guardian',
        },
      ],
    })
  })

  it('REQ-133: treina com mentor, consome os PA restantes e mantém o ouro no abandono', async () => {
    const game = await begin({ gold: 200, specializations: [knight] })
    const before = await game.project(await game.stored())
    expect(before.questChoices).toEqual(
      expect.arrayContaining(
        ['rogue', 'mage'].map((classId) => ({
          type: 'trainWithMentor',
          classId,
          actionPoints: 3,
          gold: 150,
        }))
      )
    )
    expect(before.questChoices).not.toContainEqual(
      expect.objectContaining({ type: 'trainWithMentor', classId: 'warrior' })
    )
    expect(before.availableActions).toContain('trainWithMentor')
    const trained = await game.act({ type: 'trainWithMentor', classId: 'mage' })
    expect(trained.turn.actionPoints).toBe(0)
    const expected = {
      gold: 50,
      openQuests: [
        {
          questId: 'quest-1',
          type: 'mentorQuest',
          title: 'Missão do mentor',
          classId: 'mage',
          objectives: {
            randomEventSuccesses: { current: 0, target: 5 },
            combatVictories: { current: 0, target: 5 },
          },
        },
      ],
    }
    expect(await game.project(trained)).toMatchObject(expected)
    expect(await game.project(await reload(game))).toMatchObject(expected)
    const abandoned = await game.act({
      type: 'abandonQuest',
      questId: 'quest-1',
    })
    expect(await game.project(abandoned)).toMatchObject({
      gold: 50,
      openQuests: [],
    })
    await game.act({ type: 'endTurn' })
    const result = await game.execute({
      type: 'trainWithMentor',
      classId: 'mage',
    })
    expect(result.value).toMatchObject({
      code: 'ACTION_NOT_ALLOWED',
      details: { reason: 'notEnoughGold', classId: 'mage' },
    })
    expect(
      (await game.project(await game.stored())).questChoices
    ).not.toContainEqual(expect.objectContaining({ type: 'trainWithMentor' }))
  })

  it.each([
    { gold: 299, paid: false },
    { gold: 300, paid: true },
  ])(
    'REQ-133: cobra o dobro a cada classe adquirida (ouro $gold)',
    async ({ gold, paid }) => {
      const game = await begin({
        gold,
        playerClasses: [warriorClass, rogueClass],
        specializations: [knight, shadow],
      })
      const result = await game.execute({
        type: 'trainWithMentor',
        classId: 'mage',
      })
      if (paid) {
        expect(result.isRight()).toBe(true)
        expect((await game.project(await game.stored())).gold).toBe(0)
      } else {
        expect(result.value).toMatchObject({
          details: { reason: 'notEnoughGold', classId: 'mage' },
        })
      }
    }
  )

  it.each([
    {
      name: 'classe já adquirida',
      player: { gold: 200, specializations: [knight] },
      classId: 'warrior',
      reason: 'questClassIneligible',
    },
    {
      name: 'classe que o catálogo não publica',
      player: { gold: 200, specializations: [knight] },
      classId: 'ranger',
      reason: 'questClassIneligible',
    },
    {
      name: 'classe atual sem especialização',
      player: { gold: 200 },
      classId: 'mage',
      reason: 'questSpecializationIneligible',
    },
  ])(
    'REQ-133: recusa o mentor por $name e preserva o save',
    async ({ player, classId, reason }) => {
      const game = await begin(player)
      const row = DrizzlePartyMapper.toDrizzle(await game.stored())
      const result = await game.execute({ type: 'trainWithMentor', classId })
      expect(result.value).toMatchObject({
        code: 'ACTION_NOT_ALLOWED',
        details: { reason, classId },
      })
      expect(DrizzlePartyMapper.toDrizzle(await game.stored())).toEqual(row)
    }
  )

  it('REQ-133 e REQ-132: finaliza o mentor, concede a classe inativa e o Pico', async () => {
    const game = await begin({ gold: 150, specializations: [knight] }, instant)
    await game.act({ type: 'trainWithMentor', classId: 'mage' })
    await game.act({ type: 'endTurn' })
    const finished = await game.act({ type: 'finishQuest', questId: 'quest-1' })
    expect(finished.turn.actionPoints).toBe(2)
    const expected = {
      peak: 35,
      gold: 0,
      openQuests: [],
      playerClasses: [
        { playerClass: 'warrior', deckLockMet: true },
        { playerClass: 'mage', deckLockMet: false },
      ],
      specializations: [
        { classId: 'warrior', specializationId: 'knight', deckLockMet: false },
      ],
    }
    expect(await game.project(finished)).toMatchObject(expected)
    expect(await game.project(await reload(game))).toMatchObject(expected)
  })

  it('REQ-133: lista as missões abertas na ordem de aceitação entre os tipos', async () => {
    const game = await begin()
    await game.act({ type: 'takeQuest', questCardId: a.id })
    await game.act(trial)
    await game.act({ type: 'takeQuest', questCardId: b.id })
    const expected = [
      { questId: 'quest-1', type: 'zoneQuest' },
      { questId: 'quest-2', type: 'trialQuest' },
      { questId: 'quest-3', type: 'zoneQuest' },
    ]
    expect((await game.project(await game.stored())).openQuests).toMatchObject(
      expected
    )
    expect((await game.project(await reload(game))).openQuests).toMatchObject(
      expected
    )
  })

  it('REQ-133: valida os campos públicos das intenções', async () => {
    const game = await begin()
    const trialResult = await game.execute({
      type: 'takeTrialQuest',
      gold: 1,
    })
    expect(trialResult.value).toMatchObject({
      code: 'ACTION_INVALID',
      details: {
        fields: expect.arrayContaining([
          { field: 'classId', reason: 'required' },
          { field: 'specializationId', reason: 'required' },
          { field: 'gold', reason: 'unknownKey' },
        ]),
      },
    })
    const mentorResult = await game.execute({
      type: 'trainWithMentor',
      classId: 1,
    })
    expect(mentorResult.value).toMatchObject({
      code: 'ACTION_INVALID',
      details: { fields: [{ field: 'classId', reason: 'notString' }] },
    })
  })
})

describe('T-58 â€” provaÃ§Ã£o e mentor: bordas', () => {
  const specialization = (id: string) =>
    ({
      id,
      name: id,
      additionalAttributes: ['wisdom'],
      reinforcedAttributes: ['endurance'],
      effects: [],
    }) as const
  const classes = [
    makeClassDefinition({
      specializations: ['knight', 'guardian'].map(specialization),
    }),
    makeClassDefinition({
      playerClass: 'rogue',
      name: 'Ladino',
      specializations: ['shadow'].map(specialization),
    }),
    makeClassDefinition({ playerClass: 'mage', name: 'Mago' }),
  ]
  const trial = {
    type: 'takeTrialQuest',
    classId: 'warrior',
    specializationId: 'knight',
  }
  const knight = {
    playerClass: 'warrior',
    specializationId: 'knight',
    deckLockMet: false,
  } as const
  const instant = {
    trialRandomEventTarget: 0,
    trialCombatTarget: 0,
    mentorRandomEventTarget: 0,
    mentorCombatTarget: 0,
  }
  const forest = makeZoneCard({
    id: 'fixture.forest',
    title: 'Floresta',
    zoneType: 'forest',
  })
  const village = makeZoneCard({
    id: 'fixture.village',
    title: 'Vila',
    zoneType: 'inhabited',
  })
  const prizeOutcome = {
    text: 'Receba uma recompensa.',
    steps: [{ type: 'grantReward', cardId: prize.id, copies: 1 }],
  } as const
  const emptyOutcome = { text: 'Sem efeito.', steps: [] }
  const event = makeRandomEventCard({
    requirements: [
      {
        id: 'vigor',
        kind: 'minimum',
        stat: 'vigor',
        value: 1,
        text: 'Vigor mÃ­nimo 1.',
      },
    ],
    goodOutcome: prizeOutcome,
    badOutcome: emptyOutcome,
  })

  function begin(
    player: Partial<TPlayerState> = {},
    config: Partial<TPartyProps['config']> = {},
    maxOpenQuests = 3
  ) {
    return setup([a, b], maxOpenQuests, false, undefined, {
      player: { peak: 30, ...player },
      config,
      classes,
      cards: [forest, village],
    })
  }

  /** Leva o jogador a outra zona pelo save (a zona nÃ£o precisa estar no mapa). */
  async function relocate(
    game: Awaited<ReturnType<typeof setup>>,
    zoneId: string,
    zoneType?: string
  ) {
    const row = DrizzlePartyMapper.toDrizzle(await game.stored())
    const state = row.state as unknown as {
      members: { player: { zoneId: string } }[]
      eventDecks: { zoneType: string }[]
    }
    state.members[0].player.zoneId = zoneId
    if (zoneType) for (const deck of state.eventDecks) deck.zoneType = zoneType
    const restored = DrizzlePartyMapper.toDomain(row)
    await game.repository.save(restored)
  }

  async function exhaust(game: Awaited<ReturnType<typeof setup>>) {
    for (const zoneId of [mine.id, harbor.id, mine.id]) {
      if ((await game.stored()).turn.actionPoints === 0) return
      await game.act({ type: 'move', zoneId })
    }
  }

  it('REQ-133: aceita e finaliza em zona Habitada', async () => {
    const game = await begin({ zoneId: village.id }, instant)
    await game.act(trial)
    const finished = await game.act({ type: 'finishQuest', questId: 'quest-1' })
    expect(await game.project(finished)).toMatchObject({
      specializations: [
        { classId: 'warrior', specializationId: 'knight', deckLockMet: false },
      ],
    })
  })

  it('REQ-133: recusa finalizar fora de Urbana e Habitada', async () => {
    const game = await begin({}, instant)
    await game.act(trial)
    await relocate(game, forest.id)
    const result = await game.execute({
      type: 'finishQuest',
      questId: 'quest-1',
    })
    expect(result.value).toMatchObject({
      code: 'ACTION_NOT_ALLOWED',
      details: { reason: 'questWrongZone', questId: 'quest-1' },
    })
    expect(
      (await game.project(await game.stored())).questChoices
    ).not.toContainEqual(expect.objectContaining({ type: 'finishQuest' }))
  })

  it('REQ-133: recusa sem PA aceitar provaÃ§Ã£o, treinar com mentor e finalizar', async () => {
    const taking = await begin({ gold: 200 })
    await exhaust(taking)
    expect((await taking.stored()).turn.actionPoints).toBe(0)
    const refusedTrial = await taking.execute(trial)
    expect(refusedTrial.value).toMatchObject({
      details: { reason: 'noActionPoints' },
    })
    const mentor = await begin({ gold: 200, specializations: [knight] })
    await exhaust(mentor)
    const refusedMentor = await mentor.execute({
      type: 'trainWithMentor',
      classId: 'mage',
    })
    expect(refusedMentor.value).toMatchObject({
      details: { reason: 'noActionPoints', classId: 'mage' },
    })
    const finishing = await begin({}, instant)
    await finishing.act(trial)
    await exhaust(finishing)
    const refusedFinish = await finishing.execute({
      type: 'finishQuest',
      questId: 'quest-1',
    })
    expect(refusedFinish.value).toMatchObject({
      details: { reason: 'noActionPoints', questId: 'quest-1' },
    })
  })

  it('REQ-133: recusa o mentor com genÃ©rica aberta ou limite atingido', async () => {
    const game = await begin({ gold: 400, specializations: [knight] })
    await game.act({ type: 'trainWithMentor', classId: 'mage' })
    await game.act({ type: 'endTurn' })
    const again = await game.execute({
      type: 'trainWithMentor',
      classId: 'rogue',
    })
    expect(again.value).toMatchObject({
      details: { reason: 'genericQuestAlreadyOpen', classId: 'rogue' },
    })
    const limited = await begin({ gold: 400, specializations: [knight] }, {}, 1)
    await limited.act({ type: 'takeQuest', questCardId: a.id })
    const refused = await limited.execute({
      type: 'trainWithMentor',
      classId: 'mage',
    })
    expect(refused.value).toMatchObject({
      details: { reason: 'questLimitReached', classId: 'mage' },
    })
  })

  it('D-112: com dois motivos, vence o primeiro da ordem', async () => {
    const mentor = await begin({ gold: 0, specializations: [knight] })
    const owned = await mentor.execute({
      type: 'trainWithMentor',
      classId: 'warrior',
    })
    expect(owned.value).toMatchObject({
      details: { reason: 'questClassIneligible', classId: 'warrior' },
    })
    const open = await begin({
      playerClasses: [
        { playerClass: 'warrior', deckLockMet: true },
        { playerClass: 'rogue', deckLockMet: true },
      ],
    })
    await open.act(trial)
    const row = DrizzlePartyMapper.toDrizzle(await open.stored())
    const state = row.state as unknown as {
      members: { player: { peak: number } }[]
    }
    state.members[0].player.peak = 29
    await open.repository.save(DrizzlePartyMapper.toDomain(row))
    const both = await open.execute({
      ...trial,
      classId: 'rogue',
      specializationId: 'shadow',
    })
    expect(both.value).toMatchObject({
      details: { reason: 'genericQuestAlreadyOpen', classId: 'rogue' },
    })
  })

  it('REQ-132 e REQ-133: conta a vitÃ³ria de pÃ© na provaÃ§Ã£o', async () => {
    const enemy = makeEnemy({ count: 1, health: 1 })
    const quest: TZoneQuestCard = {
      ...a,
      stages: [
        {
          type: 'combatEvent',
          text: 'Derrote o inimigo',
          location: { type: 'zoneType', zoneType: 'urban' },
          combat: {
            enemies: [
              {
                ...enemy,
                modifiers: {
                  ...enemy.modifiers,
                  attack: 20,
                  accuracy: 100,
                  defense: 0,
                  evasion: 0,
                  celerity: 0,
                  reflection: 1,
                },
              },
            ],
            goodOutcome: prizeOutcome,
            badOutcome: emptyOutcome,
            noEscape: false,
            escapeThreshold: 0,
          },
        },
      ],
    }
    const deckCombat = makeCombatEventCard()
    const game = await setup(
      [quest],
      3,
      true,
      {
        cards: [
          deckCombat,
          makeAttributeCard(),
          makeAttributeCard({
            id: 'fixture.endurance-basic',
            attributes: ['endurance'],
          }),
        ],
        deckCardId: deckCombat.id,
        health: 22,
      },
      { player: { peak: 30 }, classes }
    )
    await game.act({ type: 'takeQuest', questCardId: quest.id })
    await game.act(trial)
    const started = await game.act({
      type: 'continueQuest',
      questId: 'quest-1',
    })
    const combat = started.combat!
    const victory = await game.act({
      type: 'combatAttack',
      combatId: combat.id,
      turnId: combat.turn.id,
      targetId: combat.enemies[0].id,
    })
    expect(victory.lastCombatResult).toMatchObject({
      resolution: 'victory',
      playerDown: false,
    })
    expect(await game.project(victory)).toMatchObject({
      openQuests: [
        { questId: 'quest-1' },
        {
          questId: 'quest-2',
          type: 'trialQuest',
          objectives: {
            randomEventSuccesses: { current: 0, target: 3 },
            combatVictories: { current: 1, target: 3 },
          },
        },
      ],
    })
  })

  it('REQ-132 e REQ-133: conta fora de Urbana e para na meta', async () => {
    const game = await setup(
      [a],
      3,
      false,
      { cards: [event], deckCardId: event.id, health: 22 },
      {
        player: { peak: 30 },
        classes,
        cards: [forest],
        config: { trialRandomEventTarget: 1 },
      }
    )
    await game.act(trial)
    await relocate(game, forest.id, 'forest')
    for (let round = 0; round < 2; round++) {
      const started = await game.act({ type: 'startEvent' })
      const encounterId = started.randomEventEncounter!.id
      await game.act({ type: 'revealEvent', encounterId })
      const success = await game.act({ type: 'resolveEvent', encounterId })
      for (const reward of success.pendingRewards)
        await game.act({
          type: 'resolveReward',
          rewardId: reward.id,
          choice: 'leave',
        })
      expect(
        (await game.project(await game.stored())).openQuests
      ).toMatchObject([
        {
          type: 'trialQuest',
          objectives: { randomEventSuccesses: { current: 1, target: 1 } },
        },
      ])
      await game.act({ type: 'endTurn' })
    }
  })
})

describe('T-59 — ativação ao salvar a build', () => {
  const card = (name: TAttribute) =>
    makeAttributeCard({
      id: `fixture.${name}-basic`,
      name,
      attributes: [name],
    })
  const [strength, endurance, wisdom, dexterity, luck] = (
    ['strength', 'endurance', 'wisdom', 'dexterity', 'luck'] as const
  ).map(card)
  const entry = (cardId: string, copies: number) => ({ cardId, copies })
  const mods = (attack: number) => ({
    attack,
    defense: 4,
    accuracy: 50,
    evasion: 15,
    celerity: 8,
    piercing: 0,
    reflection: 0,
  })
  const defaults = {
    attack: 5,
    defense: 3,
    accuracy: 50,
    evasion: 20,
    celerity: 10,
    piercing: 0,
    reflection: 0,
  }
  const warrior = makeClassDefinition({
    essentialAttributes: ['strength', 'endurance'],
    baseModifiers: mods(6),
    specializations: [
      {
        id: 'knight',
        name: 'Cavaleiro',
        additionalAttributes: ['wisdom'],
        reinforcedAttributes: ['endurance'],
        effects: [],
      },
    ],
  })
  const rogue = makeClassDefinition({
    playerClass: 'rogue',
    name: 'Ladino',
    essentialAttributes: ['dexterity'],
    baseModifiers: mods(5),
    specializations: [
      {
        id: 'shadow',
        name: 'Sombra',
        additionalAttributes: ['luck'],
        reinforcedAttributes: ['dexterity'],
        effects: [],
      },
    ],
  })
  const warriorEntry = (deckLockMet: boolean) =>
    ({ playerClass: 'warrior', deckLockMet }) as const
  const rogueEntry = (deckLockMet: boolean) =>
    ({ playerClass: 'rogue', deckLockMet }) as const
  const knight = (deckLockMet: boolean) =>
    ({
      playerClass: 'warrior',
      specializationId: 'knight',
      deckLockMet,
    }) as const
  const shadow = (deckLockMet: boolean) =>
    ({
      playerClass: 'rogue',
      specializationId: 'shadow',
      deckLockMet,
    }) as const

  function begin(player: Partial<TPlayerState>) {
    return setup([a, b], 3, false, undefined, {
      player: { peak: 30, modifiers: defaults, ...player },
      config: { tcgFolderCapacity: 100 },
      classes: [warrior, rogue],
      cards: [strength, endurance, wisdom, dexterity, luck],
    })
  }

  async function reload(game: Awaited<ReturnType<typeof setup>>) {
    const restored = DrizzlePartyMapper.toDomain(
      DrizzlePartyMapper.toDrizzle(await game.stored())
    )
    await game.repository.save(restored)
    return restored.members[0].player
  }

  const knightPlayer = {
    playerClasses: [warriorEntry(false)],
    specializations: [knight(false)],
    build: [entry(endurance.id, 30), entry(strength.id, 30)],
    tcgFolder: [entry(wisdom.id, 6), entry(strength.id, 30)],
  }

  it('REQ-134: Ajustar deck ativa a classe e a especialização e persiste; antes disso a trava segue falsa', async () => {
    const game = await begin(knightPlayer)
    const projected = (deckLockMet: boolean) => [
      { classId: 'warrior', specializationId: 'knight', deckLockMet },
    ]
    expect((await game.project(await game.stored())).specializations).toEqual(
      projected(false)
    )
    const saved = await game.act({
      type: 'adjustDeck',
      build: [
        entry(endurance.id, 14),
        entry(strength.id, 40),
        entry(wisdom.id, 6),
      ],
    })
    expect(saved.turn.actionPoints).toBe(2)
    const reloaded = await reload(game)
    expect(reloaded.playerClasses).toEqual([warriorEntry(true)])
    expect(reloaded.specializations).toEqual([knight(true)])
    expect((await game.project(saved)).specializations).toEqual(projected(true))
  })

  it.each([
    {
      name: 'falta uma carta do reforço',
      build: [
        entry(endurance.id, 13),
        entry(strength.id, 41),
        entry(wisdom.id, 6),
      ],
    },
    {
      name: 'falta uma carta do adicional',
      build: [
        entry(endurance.id, 14),
        entry(strength.id, 41),
        entry(wisdom.id, 5),
      ],
    },
  ])(
    'REQ-134: a especialização segue inativa quando $name, com a classe ativa',
    async ({ build }) => {
      const game = await begin(knightPlayer)
      await game.act({ type: 'adjustDeck', build })
      const player = (await game.stored()).members[0].player
      expect(player.playerClasses).toEqual([warriorEntry(true)])
      expect(player.specializations).toEqual([knight(false)])
    }
  )

  it('REQ-134: Usar cofre ativa a especialização ao salvar a build', async () => {
    const game = await begin({
      ...knightPlayer,
      tcgFolder: [],
      vault: {
        slots: [
          { cardId: wisdom.id, quantity: 6 },
          { cardId: strength.id, quantity: 30 },
        ],
        decks: [],
        gold: 0,
      },
    })
    const saved = await game.act({
      type: 'useVault',
      operations: [
        {
          operation: 'editBuild',
          build: [
            entry(endurance.id, 14),
            entry(strength.id, 40),
            entry(wisdom.id, 6),
          ],
        },
      ],
    })
    expect(saved.turn.actionPoints).toBe(2)
    const reloaded = await reload(game)
    expect(reloaded.playerClasses).toEqual([warriorEntry(true)])
    expect(reloaded.specializations).toEqual([knight(true)])
  })

  describe('modificadores base', () => {
    const owned = {
      playerClasses: [warriorEntry(false), rogueEntry(false)],
      build: [
        entry(endurance.id, 20),
        entry(strength.id, 20),
        entry(dexterity.id, 20),
      ],
      tcgFolder: [entry(endurance.id, 20), entry(luck.id, 20)],
    }
    const saveBuild = async (build: ReturnType<typeof entry>[]) => {
      const game = await begin(owned)
      await game.act({ type: 'adjustDeck', build })
      return { game, player: await reload(game) }
    }

    it('REQ-134: com várias classes ativas, vale a primeira adquirida', async () => {
      const { player } = await saveBuild([
        entry(endurance.id, 20),
        entry(strength.id, 20),
        entry(dexterity.id, 20),
      ])
      expect(player.playerClasses).toEqual([
        warriorEntry(true),
        rogueEntry(true),
      ])
      expect(player.modifiers).toEqual(mods(6))
    })

    it('REQ-134: só a segunda classe ativa usa os modificadores dela', async () => {
      const { player } = await saveBuild([
        entry(dexterity.id, 20),
        entry(endurance.id, 20),
        entry(luck.id, 20),
      ])
      expect(player.playerClasses).toEqual([
        warriorEntry(false),
        rogueEntry(true),
      ])
      expect(player.modifiers).toEqual(mods(5))
    })

    it('REQ-134: nenhuma classe ativa usa os padrões e a capacidade de inventário não muda', async () => {
      const game = await begin(owned)
      const capacity = (await game.stored()).config.inventoryCapacity
      await game.act({
        type: 'adjustDeck',
        build: [entry(endurance.id, 40), entry(luck.id, 20)],
      })
      const player = await reload(game)
      expect(player.playerClasses).toEqual([
        warriorEntry(false),
        rogueEntry(false),
      ])
      expect(player.modifiers).toEqual(defaults)
      expect((await game.stored()).config.inventoryCapacity).toBe(capacity)
      expect((await game.project(await game.stored())).inventoryCapacity).toBe(
        capacity
      )
    })
  })

  it('REQ-134: cada especialização é checada contra a própria trava e a ordem de aquisição é preservada', async () => {
    const game = await begin({
      playerClasses: [rogueEntry(false), warriorEntry(false)],
      specializations: [knight(false), shadow(false)],
      build: [
        entry(endurance.id, 20),
        entry(strength.id, 20),
        entry(dexterity.id, 20),
      ],
      tcgFolder: [entry(wisdom.id, 6), entry(endurance.id, 20)],
    })
    await game.act({
      type: 'adjustDeck',
      build: [
        entry(endurance.id, 34),
        entry(strength.id, 10),
        entry(dexterity.id, 10),
        entry(wisdom.id, 6),
      ],
    })
    const player = await reload(game)
    expect(player.playerClasses).toEqual([
      rogueEntry(false),
      warriorEntry(true),
    ])
    expect(player.specializations).toEqual([knight(true), shadow(false)])
    expect(player.modifiers).toEqual(mods(6))
  })

  it('REQ-134: classe ou especialização ausente do catálogo mantém a trava e os modificadores atuais', async () => {
    const mage = { playerClass: 'mage', deckLockMet: true } as const
    const ghost = { ...knight(true), specializationId: 'ghost' }
    const seer = {
      playerClass: 'mage',
      specializationId: 'seer',
      deckLockMet: true,
    } as const
    const game = await begin({
      ...knightPlayer,
      playerClasses: [warriorEntry(true), mage],
      specializations: [ghost, seer],
      modifiers: mods(9),
    })
    await game.act({
      type: 'adjustDeck',
      build: [entry(endurance.id, 9), entry(strength.id, 51)],
    })
    const player = await reload(game)
    expect(player.playerClasses).toEqual([warriorEntry(false), mage])
    expect(player.specializations).toEqual([ghost, seer])
    expect(player.modifiers).toEqual(mods(9))
  })

  it('REQ-134: save sem especializações segue sem a chave depois de salvar a build', async () => {
    const game = await begin({
      playerClasses: [warriorEntry(false)],
      build: [entry(endurance.id, 30), entry(strength.id, 30)],
      tcgFolder: [],
    })
    expect('specializations' in (await game.stored()).members[0].player).toBe(
      false
    )
    await game.act({
      type: 'adjustDeck',
      build: [entry(endurance.id, 30), entry(strength.id, 30)],
    })
    expect('specializations' in (await game.stored()).members[0].player).toBe(
      false
    )
  })
})
