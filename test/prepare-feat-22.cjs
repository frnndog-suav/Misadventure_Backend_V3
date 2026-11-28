/* global require, process, __dirname, console, fetch, URL, structuredClone */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomUUID } = require('node:crypto')
const assert = require('node:assert/strict')
const { cp, mkdir, mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { config } = require('dotenv')
const { Client } = require('pg')

const harbor = 'fixture.gray-harbor'
const wolves = 'fixture.howling-wolves'
const dimensionId = 'fixture.test-dimension'
const potion = 'fixture.healing-potion'
const shard = 'fixture.t117-shard'
const revival = 'fixture.t117-revival'
const questCardId = 'fixture.t117-combat-quest'
const successorId = 'fixture-next.next-dimension'
const rngState = [0, 0, 0, 10]
const lootCards = [potion, 'fixture.iron-ore', 'fixture.silver-fish']
const retryFleeProfiles = [
  '4-fuga-do-iniciador',
  '5-iniciador-fugido',
  '6-iniciador-fugido',
]
const pendingProfiles = [
  ['3-recalculo-padrao', 2],
  ['3-recalculo-humano', 2],
  ['3-apenas-ias', 2],
  ['3-ressurreicao', 1],
  ['3-respawn', 1],
  ['4-fuga-falha', 1],
  ['4-fuga-total', 1],
  ['4-fuga-e-derrota', 1],
  ['4-limite-com-nocaute', 1],
  ['5-iniciador-caido', 2],
  ['5-rodizio-humano', 2],
  ['5-missao-vitoria', 1],
  ['5-missao-fuga', 1],
  ['5-missao-derrota', 1],
  ['5-reflexao-solo', 1],
  ['5-reflexao-grupo', 1],
  ['6-sucessora', 1],
  ['6-reflexao', 1],
  ['6-sem-vitoria', 1],
  ['6-premio-pendente', 1],
  ['6-saque-com-respawn', 1],
]
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

const effect = (activation, cost = []) => ({
  text: 'Efeito T-117',
  trigger: null,
  cost,
  activation,
  duration: { kind: 'immediate' },
  mark: null,
})

function outcomeEffect(activation) {
  const { text, duration, mark } = effect(activation)
  return { type: 'effect', effect: { text, activation, duration, mark } }
}

async function prepareContent(withSuccessor) {
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
  const aiEvents = ['3-apenas-ias', '5-rodizio-humano'].map((scenario) => {
    const card = structuredClone(combat)
    card.id = 'fixture.t117-' + scenario
    preparePendingCard(scenario, card)
    return card
  })
  await write('combatEvent', [combat, ...aiEvents])
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
  items.push({
    ...items.find(({ id }) => id === potion),
    id: revival,
    name: 'Ressurreição T-117',
    effects: [
      effect(
        [{ kind: 'reviveAlly', healthPercent: 50 }],
        [{ kind: 'consumeSelf' }]
      ),
    ],
    stockPrice: null,
  })
  await write('item', items)
  await write('zoneQuest', [
    {
      id: questCardId,
      title: 'Combate T-117',
      summary: 'Verificar o progresso após o combate.',
      rewards: [],
      stages: [
        {
          type: 'combatEvent',
          location: { type: 'zoneType', zoneType: 'urban' },
          text: 'Enfrente o lobo.',
          combat: {
            enemies: [enemy],
            noEscape: false,
            goodOutcome: combat.goodOutcome,
            badOutcome: combat.badOutcome,
          },
        },
      ],
    },
  ])
  const [dimension] = await read('dimension')
  dimension.completion = {
    zoneTitle: 'Porto Cinzento',
    requirement: [{ cardId: shard, count: 1 }],
    grandPrize: {
      cards: withSuccessor ? [{ cardId: potion, copies: 1 }] : [],
      gold: 5,
    },
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
  if (withSuccessor) {
    const next = join(root, 'fixture-next')
    await mkdir(next)
    const city = {
      ...arrival,
      id: 'fixture-next.city',
      title: 'Porto da Segunda Dimensão',
    }
    await writeFile(
      join(next, 'collection.json'),
      JSON.stringify({
        name: 'Coleção Sucessora',
      })
    )
    await writeFile(join(next, 'zone.json'), JSON.stringify([city]))
    await writeFile(
      join(next, 'dimension.json'),
      JSON.stringify([
        {
          id: successorId,
          name: 'Segunda Dimensão',
          flavorText: null,
          releaseOrder: 2,
          arrivalZoneTitle: city.title,
          effects: [],
          status: 'published',
          rewardDecks: [],
        },
      ])
    )
  }
  console.log(root)
}

function preparePendingState(scenario, state) {
  const [human, helper, second] = state.members.map(({ player }) => player)
  human.automaticEventEscape = false
  const helperEscapes = [
    '4-fuga-total',
    '5-missao-fuga',
    '5-rodizio-humano',
    '5-reflexao-grupo',
    '6-reflexao',
  ]
  if (helperEscapes.includes(scenario)) {
    helper.automaticEventEscape = true
    if (scenario !== '5-rodizio-humano') helper.health = 11
    state.config.aiPlayerPriorities = [
      'avoidKnockout',
      ...state.config.aiPlayerPriorities.filter(
        (priority) => priority !== 'avoidKnockout'
      ),
    ]
  }
  if (
    [
      '4-fuga-falha',
      '4-fuga-total',
      '4-fuga-e-derrota',
      '5-missao-vitoria',
      '5-missao-fuga',
    ].includes(scenario)
  )
    human.modifiers.celerity = 12
  if (scenario === '5-rodizio-humano') human.vigor = 6

  if (scenario.startsWith('3-recalculo')) {
    helper.statuses = [
      {
        statusId: 't117-speed',
        sourceCardId: potion,
        effectIndex: 0,
        text: 'Celeridade temporária',
        mark: 'buff',
        activation: [
          {
            kind: 'modifierFlat',
            changes: [{ modifier: 'celerity', amount: 4 }],
          },
        ],
        duration: { kind: 'forCombatCycles', cycles: 1 },
        remaining: 1,
      },
    ]
    helper.modifiers.attack = -100
    second.modifiers.attack = -100
  }
  if (scenario === '3-apenas-ias' || scenario === '5-rodizio-humano') {
    state.eventDecks[0].cards = ['fixture.t117-' + scenario]
    human.modifiers.celerity = 10
    if (scenario === '3-apenas-ias') human.zoneId = 'fixture.old-mine'
  }
  if (scenario === '3-ressurreicao')
    human.inventory = [{ cardId: revival, quantity: 1 }]
  if (
    [
      '3-ressurreicao',
      '3-respawn',
      '4-limite-com-nocaute',
      '6-saque-com-respawn',
      '6-sucessora',
    ].includes(scenario)
  ) {
    human.modifiers.celerity = 12
    helper.health = 11
    helper.modifiers.defense = 0
    helper.modifiers.evasion = 0
    helper.respawnZoneId = 'fixture.old-mine'
  }
  if (
    ['5-iniciador-caido', '5-missao-derrota', '6-sem-vitoria'].includes(
      scenario
    )
  ) {
    human.health = 1
    human.modifiers.defense = 0
    human.modifiers.evasion = 0
  }
  if (
    scenario === '4-fuga-e-derrota' ||
    scenario === '5-missao-vitoria' ||
    scenario === '6-sucessora'
  )
    human.automaticEventEscape = true
  if (['5-reflexao-grupo', '6-reflexao'].includes(scenario)) {
    helper.automaticEventEscape = true
    helper.modifiers.celerity = 12
  }
  if (scenario.includes('reflexao')) human.health = 1
  if (scenario === '4-limite-com-nocaute' || scenario === '6-sem-vitoria')
    state.config.maxCombatCycles = 1
  if (scenario === '4-limite-com-nocaute') human.vigor = 3
  if (scenario === '6-sem-vitoria' || scenario === '6-premio-pendente')
    human.modifiers.celerity = 12
  if (
    ['5-rodizio-humano', '6-premio-pendente', '6-saque-com-respawn'].includes(
      scenario
    )
  ) {
    state.config.inventoryCapacity = 1
    human.inventory = [{ cardId: lootCards[1], quantity: 1 }]
  }
  if (scenario.startsWith('5-') || scenario === '6-saque-com-respawn')
    state.rewardDecks[0].cards = [...lootCards]
  if (scenario.startsWith('5-missao-') || scenario === '5-reflexao-grupo') {
    human.openZoneQuests = [
      {
        questId: randomUUID(),
        questCardId,
        originZoneId: harbor,
        stageIndex: 0,
        status: 'ready',
      },
    ]
  }
}

function preparePendingCard(scenario, card) {
  const [enemy] = card.enemies
  Object.assign(enemy.modifiers, { defense: 0, evasion: 0 })
  if (scenario === '6-sucessora') enemy.count = 2
  const knockout = [
    '3-ressurreicao',
    '3-respawn',
    '4-fuga-e-derrota',
    '4-limite-com-nocaute',
    '5-iniciador-caido',
    '5-missao-derrota',
    '6-sem-vitoria',
    '6-saque-com-respawn',
  ].includes(scenario)
  if (knockout) {
    Object.assign(enemy.modifiers, {
      attack: 100,
      accuracy: 100,
      celerity: ['5-iniciador-caido', '5-missao-derrota'].includes(scenario)
        ? 12
        : 11,
    })
    card.badOutcome = {
      text: 'Revés T-117',
      steps: [outcomeEffect([{ kind: 'loseGold', amount: 5 }])],
    }
  }
  if (scenario === '3-apenas-ias')
    Object.assign(enemy.modifiers, { attack: 0, celerity: 10 })
  if (scenario.startsWith('3-recalculo')) {
    Object.assign(enemy.modifiers, { attack: 0, celerity: 11 })
    enemy.health = 10
  }
  if (
    [
      '4-fuga-e-derrota',
      '4-limite-com-nocaute',
      '5-missao-derrota',
      '6-sem-vitoria',
    ].includes(scenario)
  )
    enemy.health = 1000
  if (
    [
      '3-ressurreicao',
      '3-respawn',
      '4-limite-com-nocaute',
      '6-sem-vitoria',
    ].includes(scenario)
  )
    card.noEscape = true
  if (scenario === '4-fuga-falha') {
    card.escapeThreshold = 20
    Object.assign(enemy.modifiers, { attack: 0, accuracy: 100 })
  }
  if (scenario === '4-fuga-total' || scenario === '5-missao-fuga')
    card.escapeThreshold = 0
  if (scenario.includes('reflexao')) enemy.modifiers.reflection = 1
  if (
    [
      '4-fuga-total',
      '5-missao-fuga',
      '5-rodizio-humano',
      '5-reflexao-grupo',
      '6-reflexao',
    ].includes(scenario)
  )
    enemy.modifiers.reflection = 11
  if (
    [
      '5-iniciador-caido',
      '5-rodizio-humano',
      '5-reflexao-solo',
      '5-reflexao-grupo',
      '6-saque-com-respawn',
    ].includes(scenario)
  ) {
    card.goodOutcome = {
      text: 'Saque T-117',
      steps: [
        outcomeEffect([
          { kind: 'gainGold', amount: 7 },
          { kind: 'restoreVigor', amount: 2 },
        ]),
        { type: 'drawRewards', count: scenario.startsWith('6-') ? 1 : 3 },
      ],
    }
  }
}

async function prepareCampaigns(profile) {
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
  if (profile === 'pending')
    assert.equal(dimension.completion.grandPrize.cards.length, 0)
  if (profile === 'successor') {
    await api('/catalog/cards/' + successorId)
    assert.deepEqual(dimension.completion.grandPrize.cards, [
      { cardId: potion, copies: 1 },
    ])
  }
  await db.connect()
  try {
    const profiles =
      profile === 'successor'
        ? pendingProfiles.filter(([scenario]) =>
            ['6-sucessora', '6-premio-pendente'].includes(scenario)
          )
        : profile === 'pending'
          ? pendingProfiles.filter(
              ([scenario]) =>
                !['6-sucessora', '6-premio-pendente'].includes(scenario)
            )
          : profile === 'retry'
            ? [
                ['2-responsavel-incorreto', 1],
                ...rosterProfiles.filter(([scenario]) =>
                  retryFleeProfiles.includes(scenario)
                ),
                ['7-injecao-browser', 1],
              ]
            : rosterProfiles
    for (const [scenario, aiHelperCount] of profiles) {
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
      const pending = profile === 'pending' || profile === 'successor'
      const wrongOwner = scenario === '2-responsavel-incorreto'
      const aiFirst =
        scenario.startsWith('2-') ||
        scenario.startsWith('7-') ||
        scenario === '3-apenas-ias' ||
        scenario === '5-rodizio-humano'
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
      if (profile === 'retry' && retryFleeProfiles.includes(scenario))
        human.player.modifiers.celerity = 12
      if (scenario === '4-limite') state.config.maxCombatCycles = 1
      if (boss) human.player.completionItems = [{ cardId: shard, quantity: 1 }]
      if (scenario === '6-saque-pendente') {
        state.config.inventoryCapacity = 1
        human.player.inventory = [{ cardId: 'fixture.iron-ore', quantity: 1 }]
      }
      if (pending) preparePendingState(scenario, state)
      await db.query('update parties set state = $1 where id = $2', [state, id])
      const loot = scenario.startsWith('5-') || scenario === '6-saque-pendente'
      const limit = scenario === '4-limite'
      const quest =
        pending &&
        (scenario.startsWith('5-missao-') || scenario === '5-reflexao-grupo')
      const roster = pending && !aiFirst
      if ((!pending && (loot || limit)) || roster) {
        await api(path + '/session', {})
        if (boss) await api(path + '/actions', { type: 'completeDimension' })
        else if (quest)
          await api(path + '/actions', {
            type: 'continueQuest',
            questId: state.members[0].player.openZoneQuests[0].questId,
          })
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
        if (pending)
          preparePendingCard(scenario, checkpoint.state.combatRecruitment.card)
        else if (limit) {
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
      const invite = scenario === '5-rodizio-humano'
      if (invite) {
        const session = await api(path + '/session', {})
        const decision = session.pendingCombatDecision
        assert.equal(decision?.type, 'invite')
        const {
          rows: [checkpoint],
        } = await db.query('select state from parties where id = $1', [id])
        const initiator = checkpoint.state.members.find(
          ({ id }) => id === decision.initiatorMemberId
        )
        initiator.player.health = 11
        initiator.player.modifiers.celerity = 12
        initiator.player.automaticEventEscape = true
        checkpoint.state.turnOrder = [
          human.id,
          ...checkpoint.state.turnOrder.filter((id) => id !== human.id),
        ]
        await db.query('update parties set state = $1 where id = $2', [
          checkpoint.state,
          id,
        ])
      }
      if (wrongOwner) {
        const session = await api(path + '/session', {})
        assert.equal(session.pendingCombatDecision?.type, 'invite')
        const {
          rows: [checkpoint],
        } = await db.query('select state from parties where id = $1', [id])
        checkpoint.state.combatRecruitment.decision.memberId =
          session.pendingCombatDecision.initiatorMemberId
        await db.query('update parties set state = $1 where id = $2', [
          checkpoint.state,
          id,
        ])
      }
      const party = await api(path)
      if (!invite) assert.equal(party.turn.memberId, state.turn.memberId)
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
            roster || (!pending && (loot || limit))
              ? 'roster'
              : invite || wrongOwner
                ? 'invite'
                : aiFirst
                  ? 'session'
                  : boss
                    ? 'completeDimension'
                    : 'startEvent',
          turn: party.turn,
          turnOrder: initial.state.turnOrder,
          ...((pending || profile === 'retry') && {
            questId: human.player.openZoneQuests?.[0]?.questId,
            pendingCombatDecision: party.pendingCombatDecision,
            maxCombatCycles: initial.state.config.maxCombatCycles,
          }),
          participants: initial.state.members.map(({ id, player }) => ({
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
const profile = process.argv[3]
if (
  (operation === 'content' && [undefined, 'successor'].includes(profile)) ||
  (operation === 'saves' &&
    [undefined, 'pending', 'successor', 'retry'].includes(profile))
) {
  ;(operation === 'content'
    ? prepareContent(profile === 'successor')
    : prepareCampaigns(profile)
  ).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
} else {
  console.error('Use content [successor] ou saves [pending|successor|retry].')
  process.exitCode = 1
}
