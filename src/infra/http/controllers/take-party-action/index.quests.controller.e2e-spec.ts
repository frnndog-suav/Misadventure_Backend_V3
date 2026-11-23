import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import prepare from '../../../../../test/prepare-feat-15.cjs'
import { createContentApp } from '../../../../../test/content-app'
import { postParty, resetCampaign } from '../../../../../test/parties-e2e'

const [A, B, C, , E] = ['clue', 'delivery', 'escort', 'herbs', 'lost-tool'].map(
  (slug) => `fixture.t60-${slug}`
)
const D = 'fixture.t60-herbs'
const harbor = 'fixture.gray-harbor'
const mine = 'fixture.old-mine'
const WARRIOR = {
  attack: 6,
  defense: 5,
  accuracy: 45,
  evasion: 15,
  celerity: 8,
  piercing: 0,
  reflection: 0,
}
const MAGE = {
  attack: 3,
  defense: 2,
  accuracy: 40,
  evasion: 18,
  celerity: 10,
  piercing: 0,
  reflection: 0,
}

/** Corpo JSON das respostas (o tipo do Supertest) e do save gravado. */
type TBody = request.Response['body']

function notAllowed(details: object) {
  return { code: 'ACTION_NOT_ALLOWED', details }
}

describe('Missões e progressão de classes solo (HTTP e save, T-60)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp((root) => prepare.writeT60Content(root))
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
  const player = (body: TBody) => body.members[0].player
  const counters = (quest: TBody) => quest.objectives ?? quest.stage.objectives

  async function stored(id: string) {
    const [row] = await db().select().from(parties).where(eq(parties.id, id))
    return row.state as TBody
  }

  async function setup(key: string) {
    const scenario = prepare.scenarios.find((entry) => entry.key === key)
    if (!scenario) throw new Error(`Campanha desconhecida: ${key}`)
    const { id } = await postParty(ctx.app)
    await request(server()).post(`/parties/${id}/session`).expect(200)
    const state = await stored(id)
    prepare.seed(state, scenario)
    await db().update(parties).set({ state }).where(eq(parties.id, id))
    return id
  }

  async function reopen(id: string) {
    await request(server()).post(`/parties/${id}/session/end`).expect(200)
    await request(server()).post(`/parties/${id}/session`).expect(200)
  }

  it('REQ-131/REQ-132: aceita do quadro, recusa a zona errada e entrega com recompensa pendente', async () => {
    const id = await setup('quadro')
    const taken = await act(id, { type: 'takeQuest', questCardId: B }).expect(
      200
    )
    expect(taken.body.turn.actionPoints).toBe(2)
    expect(
      player(taken.body).questBoard.map((offer: TBody) => offer.questCardId)
    ).toEqual([A, D, C])
    const [quest] = player(taken.body).openQuests
    expect(quest).toEqual({
      questId: expect.any(String),
      type: 'zoneQuest',
      title: 'Entrega',
      questCardId: B,
      originZoneId: mine,
      stage: {
        index: 0,
        text: 'Entregue a mensagem',
        location: { type: 'zoneTitle', title: 'Porto Cinzento' },
        status: 'ready',
        objectives: null,
      },
    })

    const wrong = await act(id, {
      type: 'finishQuest',
      questId: quest.questId,
    }).expect(409)
    expect(wrong.body.error).toMatchObject(
      notAllowed({ reason: 'questWrongZone', questId: quest.questId })
    )
    expect((await get(id).expect(200)).body.turn.actionPoints).toBe(2)

    await act(id, { type: 'move', zoneId: harbor }).expect(200)
    const finished = await act(id, {
      type: 'finishQuest',
      questId: quest.questId,
    }).expect(200)
    expect(finished.body.turn.actionPoints).toBe(0)
    expect(player(finished.body).openQuests).toEqual([])
    expect(player(finished.body).peak).toBe(13)
    expect(finished.body.pendingRewards[0].source).toEqual({
      type: 'quest',
      questId: quest.questId,
      questCardId: B,
    })

    await reopen(id)
    const reopened = (await get(id).expect(200)).body
    expect(reopened.pendingRewards).toEqual(finished.body.pendingRewards)
    const resolved = await act(id, {
      type: 'resolveReward',
      rewardId: reopened.pendingRewards[0].id,
      choice: 'leave',
    }).expect(200)
    expect(resolved.body.pendingRewards).toEqual([])
    expect(player(resolved.body).peak).toBe(13)
    expect((await stored(id)).members[0].player.completedZoneQuests).toEqual([
      { dimensionCardId: expect.any(String), questCardId: B },
    ])
  })

  it('REQ-131: abandono com 0 PA devolve a carta ao fundo do deck quando o quadro está cheio', async () => {
    const id = await setup('abandono-cheio')
    const response = await act(id, {
      type: 'abandonQuest',
      questId: 't60-abandon-full',
    }).expect(200)
    expect(response.body.turn.actionPoints).toBe(0)
    expect(player(response.body).openQuests).toEqual([])
    expect(
      player(response.body).questBoard.map((offer: TBody) => offer.questCardId)
    ).toEqual([A, D, C])
    const zone = (await stored(id)).dimension.map.zones.find(
      (entry: TBody) => entry.zoneId === mine
    )
    expect(zone.questDrawPile).toEqual([E, B])
  })

  it('REQ-131: abandono preenche a vaga vazia e a reaceitação gera outro ID na etapa 0', async () => {
    const id = await setup('abandono-vazio')
    const abandoned = await act(id, {
      type: 'abandonQuest',
      questId: 't60-abandon-empty',
    }).expect(200)
    expect(
      player(abandoned.body).questBoard.map((offer: TBody) => offer.questCardId)
    ).toEqual([A, B, C])
    await act(id, { type: 'endTurn' }).expect(200)
    const taken = await act(id, { type: 'takeQuest', questCardId: B }).expect(
      200
    )
    const [quest] = player(taken.body).openQuests
    expect(quest.questId).not.toBe('t60-abandon-empty')
    expect(quest.stage).toMatchObject({ index: 0, status: 'ready' })
  })

  it('REQ-133/REQ-132: provação começa em zero, recusa genérica dupla e conta o êxito com recompensa pendente', async () => {
    const id = await setup('provacao')
    const taken = await act(id, {
      type: 'takeTrialQuest',
      classId: 'warrior',
      specializationId: 'knight',
    }).expect(200)
    expect(taken.body.turn.actionPoints).toBe(2)
    const trial = player(taken.body).openQuests[1]
    expect(trial).toMatchObject({
      type: 'trialQuest',
      classId: 'warrior',
      specializationId: 'knight',
      objectives: {
        randomEventSuccesses: { current: 0, target: 3 },
        combatVictories: { current: 0, target: 3 },
      },
    })

    const again = await act(id, {
      type: 'takeTrialQuest',
      classId: 'warrior',
      specializationId: 'guardian',
    }).expect(409)
    expect(again.body.error).toMatchObject(
      notAllowed({
        reason: 'genericQuestAlreadyOpen',
        classId: 'warrior',
        specializationId: 'guardian',
      })
    )
    const early = await act(id, {
      type: 'finishQuest',
      questId: trial.questId,
    }).expect(409)
    expect(early.body.error).toMatchObject(
      notAllowed({
        reason: 'questObjectivesIncomplete',
        questId: trial.questId,
      })
    )

    const started = await act(id, { type: 'startEvent' }).expect(200)
    const encounterId = started.body.randomEventEncounter.id
    await act(id, { type: 'revealEvent', encounterId }).expect(200)
    const paid = await act(id, {
      type: 'payEventRequirement',
      encounterId,
      requirementId: 'gold',
    }).expect(200)
    expect(paid.body.pendingRewards).toHaveLength(1)
    const successes = (body: TBody) =>
      player(body).openQuests.map(
        (quest: TBody) => counters(quest).randomEventSuccesses.current
      )
    expect(successes(paid.body)).toEqual([1, 1])

    await reopen(id)
    const reopened = (await get(id).expect(200)).body
    expect(successes(reopened)).toEqual([1, 1])
    const resolved = await act(id, {
      type: 'resolveReward',
      rewardId: reopened.pendingRewards[0].id,
      choice: 'leave',
    }).expect(200)
    expect(successes(resolved.body)).toEqual([1, 1])
  })

  it('REQ-133: com três missões abertas, a provação é recusada pelo limite geral', async () => {
    const id = await setup('limite')
    const response = await act(id, {
      type: 'takeTrialQuest',
      classId: 'warrior',
      specializationId: 'knight',
    }).expect(409)
    expect(response.body.error).toMatchObject(
      notAllowed({
        reason: 'questLimitReached',
        classId: 'warrior',
        specializationId: 'knight',
      })
    )
  })

  async function fight(key: string, questId: string, finish: 'attack' | 'end') {
    const id = await setup(key)
    const started = await act(id, { type: 'continueQuest', questId }).expect(
      200
    )
    expect(player(started.body).openQuests[0].stage.status).toBe('inProgress')
    const { combat } = started.body
    const response = await act(
      id,
      finish === 'attack'
        ? {
            type: 'combatAttack',
            combatId: combat.id,
            turnId: combat.turn.id,
            targetId: combat.attackTargetIds[0],
          }
        : { type: 'endCombatTurn', combatId: combat.id, turnId: combat.turn.id }
    ).expect(200)
    expect((await get(id).expect(200)).body.lastCombatResult).toEqual(
      response.body.lastCombatResult
    )
    const [quest, trial] = player(response.body).openQuests
    return {
      result: response.body.lastCombatResult,
      status: quest.stage.status,
      victories: trial.objectives.combatVictories.current,
    }
  }

  it('REQ-132: vitória com o dono caído conclui a etapa sem contar vitória', async () => {
    const outcome = await fight('vitoria-reflexao', 't60-reflection', 'attack')
    expect(outcome.result).toMatchObject({
      resolution: 'victory',
      playerDown: true,
      cardId: 'fixture.t60-hunt-reflection',
    })
    expect(outcome.status).toBe('completed')
    expect(outcome.victories).toBe(1)
  })

  it('REQ-132: vitória de pé conclui a etapa e conta a vitória', async () => {
    const outcome = await fight('vitoria-de-pe', 't60-win', 'attack')
    expect(outcome.result).toMatchObject({
      resolution: 'victory',
      playerDown: false,
    })
    expect(outcome.status).toBe('completed')
    expect(outcome.victories).toBe(2)
  })

  it('REQ-132: derrota devolve a etapa a ready', async () => {
    const outcome = await fight('derrota', 't60-defeat', 'end')
    expect(outcome.result).toMatchObject({ resolution: 'defeat' })
    expect(outcome.status).toBe('ready')
    expect(outcome.victories).toBe(1)
  })

  it('REQ-132: tentativa e entrega em sequência seguem a tabela do contrato', async () => {
    const id = await setup('sequencia')
    const continueChoice = {
      type: 'continueQuest',
      questId: 'q1',
      actionPoints: 1,
      gold: 0,
    }
    const finishChoice = { ...continueChoice, type: 'finishQuest' }
    const abandonChoice = {
      type: 'abandonQuest',
      questId: 'q1',
      actionPoints: 0,
      gold: 0,
    }
    const check = (
      body: TBody,
      actionPoints: number,
      stage: object | null,
      choices: object[]
    ) => {
      expect(body.turn.actionPoints).toBe(actionPoints)
      const [quest] = player(body).openQuests
      if (stage) expect(quest.stage).toMatchObject(stage)
      else expect(quest).toBeUndefined()
      expect(player(body).questChoices).toEqual(choices)
    }

    check((await get(id).expect(200)).body, 3, { index: 0, status: 'ready' }, [
      continueChoice,
      abandonChoice,
    ])
    const opened = await act(id, { type: 'continueQuest', questId: 'q1' })
    check(opened.body, 2, { index: 0, status: 'inProgress' }, [])
    const encounterId = opened.body.randomEventEncounter.id
    await act(id, { type: 'revealEvent', encounterId }).expect(200)
    const paid = await act(id, {
      type: 'payEventRequirement',
      encounterId,
      requirementId: 'gold',
    }).expect(200)
    check(paid.body, 2, { index: 0, status: 'completed' }, [])
    const resolved = await act(id, {
      type: 'resolveReward',
      rewardId: paid.body.pendingRewards[0].id,
      choice: 'leave',
    }).expect(200)
    check(resolved.body, 2, { index: 0, status: 'completed' }, [
      continueChoice,
      abandonChoice,
    ])
    const advanced = await act(id, { type: 'continueQuest', questId: 'q1' })
    check(advanced.body, 1, { index: 1, status: 'ready' }, [
      continueChoice,
      abandonChoice,
    ])
    const fight = await act(id, { type: 'continueQuest', questId: 'q1' })
    check(fight.body, 0, { index: 1, status: 'inProgress' }, [])
    const { combat } = fight.body
    const won = await act(id, {
      type: 'combatAttack',
      combatId: combat.id,
      turnId: combat.turn.id,
      targetId: combat.attackTargetIds[0],
    }).expect(200)
    check(won.body, 0, { index: 1, status: 'completed' }, [abandonChoice])
    const next = await act(id, { type: 'endTurn' }).expect(200)
    check(next.body, 3, { index: 1, status: 'completed' }, [
      finishChoice,
      abandonChoice,
    ])
    const gold = player(next.body).gold
    const finished = await act(id, {
      type: 'finishQuest',
      questId: 'q1',
    }).expect(200)
    check(finished.body, 2, null, [])
    expect(player(finished.body).gold).toBe(gold + 5)
  })

  it('REQ-133/REQ-134: provação concede Cavaleiro inativo e a build seguinte o ativa', async () => {
    const id = await setup('concessoes')
    const finished = await act(id, {
      type: 'finishQuest',
      questId: 't60-trial',
    }).expect(200)
    expect(player(finished.body).peak).toBe(35)
    expect(player(finished.body).specializations).toEqual([
      { classId: 'warrior', specializationId: 'knight', deckLockMet: false },
    ])
    const saved = await act(id, {
      type: 'adjustDeck',
      build: [
        { cardId: 'fixture.endurance-basic', copies: 14 },
        { cardId: 'fixture.strength-basic', copies: 40 },
        { cardId: 'fixture.wisdom-basic', copies: 6 },
      ],
    }).expect(200)
    expect(player(saved.body).playerClasses).toEqual([
      { playerClass: 'warrior', deckLockMet: true },
    ])
    expect(player(saved.body).specializations).toEqual([
      { classId: 'warrior', specializationId: 'knight', deckLockMet: true },
    ])
    expect(player(saved.body).modifiers).toEqual(WARRIOR)
  })

  it('REQ-133: mentor consome os PA e o ouro, o abandono não devolve e falta ouro na nova aceitação', async () => {
    const id = await setup('mentor-aceite')
    const trained = await act(id, {
      type: 'trainWithMentor',
      classId: 'mage',
    }).expect(200)
    expect(trained.body.turn.actionPoints).toBe(0)
    expect(player(trained.body).gold).toBe(50)
    const [quest] = player(trained.body).openQuests
    expect(quest).toMatchObject({
      type: 'mentorQuest',
      classId: 'mage',
      objectives: {
        randomEventSuccesses: { current: 0, target: 5 },
        combatVictories: { current: 0, target: 5 },
      },
    })
    const abandoned = await act(id, {
      type: 'abandonQuest',
      questId: quest.questId,
    }).expect(200)
    expect(player(abandoned.body).gold).toBe(50)
    await act(id, { type: 'endTurn' }).expect(200)
    const refused = await act(id, {
      type: 'trainWithMentor',
      classId: 'mage',
    }).expect(409)
    expect(refused.body.error).toMatchObject(
      notAllowed({ reason: 'notEnoughGold', classId: 'mage' })
    )
  })

  it('REQ-133/REQ-134: mentor concede Mago inativo e os modificadores seguem a primeira classe ativa', async () => {
    const id = await setup('mentor-concessao')
    const build = (copies: Record<string, number>) =>
      act(id, {
        type: 'adjustDeck',
        build: Object.entries(copies).map(([slug, count]) => ({
          cardId: `fixture.${slug}-basic`,
          copies: count,
        })),
      }).expect(200)
    const finished = await act(id, {
      type: 'finishQuest',
      questId: 't60-mentor',
    }).expect(200)
    expect(player(finished.body).playerClasses).toEqual([
      { playerClass: 'warrior', deckLockMet: true },
      { playerClass: 'mage', deckLockMet: false },
    ])

    const both = await build({ endurance: 14, strength: 26, wisdom: 20 })
    expect(
      player(both.body).playerClasses.map((c: TBody) => c.deckLockMet)
    ).toEqual([true, true])
    expect(player(both.body).modifiers).toEqual(WARRIOR)
    await act(id, { type: 'endTurn' }).expect(200)
    const mage = await build({ strength: 30, wisdom: 20, dexterity: 10 })
    expect(
      player(mage.body).playerClasses.map((c: TBody) => c.deckLockMet)
    ).toEqual([false, true])
    expect(player(mage.body).modifiers).toEqual(MAGE)
    const none = await build({
      endurance: 3,
      strength: 30,
      wisdom: 17,
      dexterity: 10,
    })
    expect(
      player(none.body).playerClasses.map((c: TBody) => c.deckLockMet)
    ).toEqual([false, false])
    const { config } = await stored(id)
    const defaults = {
      attack: config.defaultAttack,
      defense: config.defaultDefense,
      accuracy: config.defaultAccuracy,
      evasion: config.defaultEvasion,
      celerity: config.defaultCelerity,
      piercing: config.defaultPiercing,
      reflection: config.defaultReflection,
    }
    expect(player(none.body).modifiers).toEqual(defaults)

    await reopen(id)
    const reopened = player((await get(id).expect(200)).body)
    expect(reopened.playerClasses).toEqual(player(none.body).playerClasses)
    expect(reopened.specializations).toEqual(player(none.body).specializations)
    expect(reopened.modifiers).toEqual(defaults)
  })

  it('REQ-135: save sem as chaves da FEAT-15 projeta listas vazias', async () => {
    const id = await setup('legado')
    const legacy = player((await get(id).expect(200)).body)
    expect(legacy.questBoard).toEqual([])
    expect(legacy.openQuests).toEqual([])
    expect(legacy.questChoices).toEqual([])
    expect(legacy.specializations).toEqual([])
  })

  it('REQ-135: laboratório valida questBoardSize e restaura o padrão', async () => {
    const lab = () => request(server())
    const initial = await lab().get('/lab/config').expect(200)
    expect(initial.body.values.questBoardSize).toBe(3)
    expect(initial.body.defaults.questBoardSize).toBe(3)
    const invalid = await lab()
      .patch('/lab/config')
      .send({ questBoardSize: 0 })
      .expect(400)
    expect(invalid.body.error).toMatchObject({
      code: 'LAB_CONFIG_INVALID',
      details: { fields: [{ field: 'questBoardSize', reason: 'outOfRange' }] },
    })
    const patched = await lab()
      .patch('/lab/config')
      .send({ questBoardSize: 4 })
      .expect(200)
    expect(patched.body.values.questBoardSize).toBe(4)
    expect(patched.body.defaults.questBoardSize).toBe(3)
    const reset = await lab().post('/lab/config/reset').expect(200)
    expect(reset.body.values.questBoardSize).toBe(3)
  })

  it('REQ-135: o editor publica a missão e recusa referência e destino inválidos', async () => {
    const body = {
      slug: 'help-at-the-port',
      type: 'zoneQuest',
      title: 'Ajuda no Porto',
      summary: 'Socorra o viajante',
      stages: [
        {
          type: 'randomEvent',
          text: 'Ajude o viajante',
          location: { type: 'zoneTitle', title: 'Porto Cinzento' },
          eventCardId: 'fixture.wounded-traveler',
        },
      ],
      rewards: [],
    }
    const created = await request(server())
      .post('/lab/content/collections/fixture/cards')
      .send(body)
      .expect(201)
    expect(created.body).toMatchObject({
      status: 'draft',
      card: { id: 'fixture.help-at-the-port' },
    })
    const published = await request(server())
      .post('/lab/content/cards/fixture.help-at-the-port/publish')
      .expect(200)
    expect(published.body.status).toBe('published')

    const put = (stage: object) =>
      request(server())
        .put('/lab/content/cards/fixture.help-at-the-port')
        .send({ ...body, stages: [{ ...body.stages[0], ...stage }] })
        .expect(400)
    const wrongEvent = await put({ eventCardId: 'fixture.howling-wolves' })
    expect(wrongEvent.body.error).toMatchObject({
      code: 'CONTENT_INVALID',
      details: {
        fields: [
          {
            path: 'stages.0.eventCardId',
            message:
              'A carta referenciada deve ser um evento aleatório executável da mesma coleção.',
          },
        ],
      },
    })
    const wrongZone = await put({
      location: { type: 'zoneTitle', title: 'Porto Inexistente' },
    })
    expect(wrongZone.body.error).toMatchObject({
      code: 'CONTENT_INVALID',
      details: {
        fields: [
          {
            path: 'stages.0.location.title',
            message: 'Não há uma zona com esse título na coleção.',
          },
        ],
      },
    })
    const card = await request(server())
      .get('/catalog/cards/fixture.help-at-the-port')
      .expect(200)
    expect(card.body.stages[0]).toMatchObject({
      eventCardId: 'fixture.wounded-traveler',
      location: { type: 'zoneTitle', title: 'Porto Cinzento' },
    })
  })
})
