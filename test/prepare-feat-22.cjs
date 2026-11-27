/* global require, process, __dirname, console, fetch, URL */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomUUID } = require('node:crypto')
const assert = require('node:assert/strict')
const { cp, mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { config } = require('dotenv')
const { Client } = require('pg')

const harbor = 'fixture.gray-harbor'
const wolves = 'fixture.howling-wolves'
const dimensionId = 'fixture.test-dimension'
const potion = 'fixture.healing-potion'
const shard = 'fixture.t117-shard'
const rngState = [0, 0, 0, 10]
const rosterProfiles = [
  ['1-elenco', 3],
  ['1-lista-vazia', 3],
  ['1-recusa-total', 1],
  ['1-solo-legado', 0],
  ['2-aceitar', 1],
  ['2-recusar', 1],
  ['3-ordem-padrao', 1],
  ['3-humano-primeiro', 1],
  ['4-fuga-do-iniciador', 1],
  ['4-limite', 1],
  ['5-iniciador-de-pe', 1],
  ['5-iniciador-fugido', 2],
  ['6-iniciador-de-pe', 1],
  ['6-iniciador-fugido', 1],
  ['6-saque-pendente', 1],
  ['7-controle', 1],
  ['7-reenvio', 1],
]

async function prepareContent() {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-feat-22-'))
  await cp(join(__dirname, 'fixtures', 'content'), root, { recursive: true })
  const file = (name) => join(root, 'fixture', name + '.json')
  const read = async (name) => JSON.parse(await readFile(file(name), 'utf8'))
  const write = (name, data) =>
    writeFile(file(name), JSON.stringify(data, null, 2))

  const [combat] = await read('combatEvent')
  const [enemy] = combat.enemies
  enemy.count = 1
  enemy.health = 1
  combat.goodOutcome.steps = []
  combat.badOutcome.steps = []
  await write('combatEvent', [combat])
  const zones = await read('zone')
  const arrival = zones.find(({ id }) => id === harbor)
  arrival.zoneActions = ['startEvent', 'useVault', 'saveRespawnPoint']
  delete arrival.market
  delete arrival.blacksmith
  await write('zone', zones)
  const items = await read('item')
  items.push({
    ...items.find(({ id }) => id === potion),
    id: shard,
    name: 'Fragmento T-117',
    effects: [],
    stockPrice: null,
    completionItem: true,
  })
  await write('item', items)
  const [dimension] = await read('dimension')
  dimension.completion = {
    zoneTitle: 'Porto Cinzento',
    requirement: [{ cardId: shard, count: 1 }],
    grandPrize: { cards: [], gold: 5 },
    finalBoss: {
      title: 'Guardião',
      flavorText: null,
      noEscape: false,
      enemies: [
        {
          ...enemy,
          enemyCategory: 'boss',
          modifiers: {
            ...enemy.modifiers,
            attack: 0,
            defense: 0,
            evasion: 0,
            celerity: 0,
          },
        },
      ],
    },
  }
  await write('dimension', [dimension])
  console.log(root)
}

async function prepareCampaigns() {
  config({ quiet: true })
  const base = process.env.FEAT22_API_URL ?? 'http://localhost:3333'
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  assert(process.env.DATABASE_URL, 'Defina DATABASE_URL para o banco da API.')
  async function api(path, body) {
    const response = await fetch(
      new URL(path, base),
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': randomUUID(),
            },
            body: JSON.stringify(body),
          }
    )
    const result = await response.json()
    assert(
      response.ok,
      `${path} → ${response.status} ${JSON.stringify(result)}`
    )
    return result
  }

  await api('/health')
  const dimension = await api('/catalog/cards/' + dimensionId)
  const combat = await api('/catalog/cards/' + wolves)
  assert.equal(dimension.completion?.finalBoss?.title, 'Guardião')
  assert.equal(combat.enemies[0].health, 1)
  await db.connect()
  try {
    for (const [scenario, aiHelperCount] of rosterProfiles) {
      const { id } = await api('/parties', {
        name: 'T-117 ' + scenario,
        characterName: 'Lia',
        playerClass: 'warrior',
        aiHelperCount,
      })
      const path = '/parties/' + id
      const {
        rows: [row],
      } = await db.query('select state from parties where id = $1', [id])
      assert(row, 'A API e o preparador precisam usar o mesmo banco.')
      const state = row.state
      assert.equal(state.dimension.dimensionCardId, dimensionId)
      const [human, helper, declining, remote] = state.members
      const aiFirst = scenario.startsWith('2-') || scenario.startsWith('7-')
      const boss = scenario.startsWith('6-')
      state.rngState = rngState
      state.config.actionPointsPerTurn = aiFirst ? 1 : 3
      state.turn.actionPoints = state.config.actionPointsPerTurn
      if (helper)
        state.turnOrder = [
          ...state.members.slice(1).map(({ id }) => id),
          human.id,
        ]
      state.turn.memberId = aiFirst ? helper.id : human.id
      state.eventDecks = [{ zoneType: 'urban', cards: [wolves], discard: [] }]
      state.rewardDecks = [{ zoneType: 'urban', cards: [potion] }]
      for (const zone of state.dimension.map.zones) zone.questDeck = []
      for (const { player } of state.members) {
        player.zoneId = harbor
        player.health = Math.floor(
          (player.baseHealth * (100 + player.peak)) / 100
        )
        player.vigor = player.peak
        Object.assign(player.modifiers, {
          attack: 100,
          accuracy: 100,
          celerity: 10,
        })
      }
      if (scenario.startsWith('1-')) {
        if (helper) helper.player.health = Math.ceil(helper.player.health / 2)
        if (declining)
          declining.player.health = Math.ceil(declining.player.health / 2) - 1
        if (remote)
          remote.player.zoneId = state.dimension.map.zones.find(
            ({ zoneId }) => zoneId !== harbor
          ).zoneId
        if (scenario === '1-recusa-total') helper.player.health -= 1
        if (scenario === '1-solo-legado') state.schemaVersion = 10
      }
      if (aiFirst) {
        human.player.health -= 1
        human.player.modifiers.celerity = 100
        human.player.inventory = [{ cardId: potion, quantity: 1 }]
      }
      human.player.automaticEventEscape =
        scenario.includes('fuga') || scenario.includes('fugido')
      if (scenario === '4-limite') state.config.maxCombatCycles = 1
      if (boss) human.player.completionItems = [{ cardId: shard, quantity: 1 }]
      if (scenario === '6-saque-pendente') {
        state.config.inventoryCapacity = 1
        human.player.inventory = [{ cardId: 'fixture.iron-ore', quantity: 1 }]
      }
      await db.query('update parties set state = $1 where id = $2', [state, id])
      const loot = scenario.startsWith('5-') || scenario === '6-saque-pendente'
      const limit = scenario === '4-limite'
      if (loot || limit) {
        await api(path + '/session', {})
        if (boss) await api(path + '/actions', { type: 'completeDimension' })
        else {
          const started = await api(path + '/actions', { type: 'startEvent' })
          await api(path + '/actions', {
            type: 'revealEvent',
            encounterId: started.randomEventEncounter.id,
          })
        }
        const {
          rows: [checkpoint],
        } = await db.query('select state from parties where id = $1', [id])
        assert.equal((await api(path)).pendingCombatDecision?.type, 'roster')
        if (limit) {
          checkpoint.state.combatRecruitment.card.noEscape = true
          checkpoint.state.combatRecruitment.card.enemies[0].health = 1000
        } else {
          checkpoint.state.combatRecruitment.card.goodOutcome = {
            text: 'Saque T-117',
            steps: [{ type: 'drawRewards', count: boss ? 1 : 3 }],
          }
          checkpoint.state.rewardDecks[0].cards = [
            potion,
            'fixture.iron-ore',
            'fixture.silver-fish',
          ]
        }
        await db.query('update parties set state = $1 where id = $2', [
          checkpoint.state,
          id,
        ])
      }
      const party = await api(path)
      assert.equal(party.turn.memberId, state.turn.memberId)
      const {
        rows: [initial],
      } = await db.query('select state from parties where id = $1', [id])
      console.log(
        JSON.stringify({
          scenario,
          id,
          url: new URL(path, base).href,
          dimensionId,
          rngState,
          checkpointRngState: initial.state.rngState,
          revision: party.revision,
          trigger:
            loot || limit
              ? 'roster'
              : aiFirst
                ? 'session'
                : boss
                  ? 'completeDimension'
                  : 'startEvent',
          turn: party.turn,
          turnOrder: state.turnOrder,
          participants: state.members.map(({ id, player }) => ({
            id,
            zoneId: player.zoneId,
            health: player.health,
            vigor: player.vigor,
            peak: player.peak,
            gold: player.gold,
            celerityModifier: player.modifiers.celerity,
            inventory: player.inventory,
          })),
        })
      )
    }
  } finally {
    await db.end()
  }
}

const operation = process.argv[2]
if (operation === 'content' || operation === 'saves') {
  ;(operation === 'content' ? prepareContent() : prepareCampaigns()).catch(
    (error) => {
      console.error(error.message)
      process.exitCode = 1
    }
  )
} else {
  console.error('Use content ou saves.')
  process.exitCode = 1
}
