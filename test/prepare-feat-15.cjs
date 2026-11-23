// T-60 — preparador das campanhas da FEAT-15 (padrão do devlog 064, `prepare-feat-14.cjs`).
//   node test/prepare-feat-15.cjs content              copia as fixtures para uma pasta temporária e acrescenta o conteúdo da T-60
//   node test/prepare-feat-15.cjs campaigns [nomes]    cria as campanhas pela API e grava os pontos de partida no PostgreSQL de teste
//   node test/prepare-feat-15.cjs snapshot <id>        lê a linha da campanha sem passar pela API
// Script CommonJS do Node: globais e require declarados para o ESLint.
/* global require, module, process, __dirname, console, fetch, URL */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { cp, mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { config } = require('dotenv')
const { Client } = require('pg')

const harbor = 'fixture.gray-harbor'
const mine = 'fixture.old-mine'
const potion = 'fixture.healing-potion'
const pickaxe = 'fixture.pickaxe'
const strength = 'fixture.strength-basic'
const dexterity = 'fixture.dexterity-basic'
const wisdom = 'fixture.wisdom-basic'
const toll = 'fixture.t60-toll'
const harborLocation = { type: 'zoneTitle', title: 'Porto Cinzento' }
const forestLocation = { type: 'zoneType', zoneType: 'forest' }
const urbanLocation = { type: 'zoneType', zoneType: 'urban' }
const [A, B, C, D, E] = [
  'clue',
  'delivery',
  'escort',
  'herbs',
  'lost-tool',
].map((slug) => `fixture.t60-${slug}`)
const objectivesQuest = 'fixture.t60-objectives'
const reflectionQuest = 'fixture.t60-hunt-reflection'
const defeatQuest = 'fixture.t60-hunt-defeat'
const winQuest = 'fixture.t60-hunt-win'
const sequenceQuest = 'fixture.t60-sequence'

const questDefaults = {
  questBoardSize: 3,
  maxOpenQuests: 3,
  trialMinPeak: 30,
  mentorBaseGoldCost: 150,
  trialRandomEventTarget: 3,
  trialCombatTarget: 3,
  mentorRandomEventTarget: 5,
  mentorCombatTarget: 5,
  lockSpecializationAdditional: 6,
  lockSpecializationReinforcement: 4,
  zoneQuestPeakGain: 3,
  genericQuestPeakGain: 5,
}
const empty = { text: 'Fim.', steps: [] }
const effect = (kind, amount, text) => ({
  text,
  activation: [{ kind, amount }],
  duration: { kind: 'immediate' },
  mark: null,
})
const step = (...args) => ({ type: 'effect', effect: effect(...args) })
const grant = { type: 'grantReward', cardId: pickaxe, copies: 1 }

async function prepareContent() {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-feat-15-'))
  await cp(join(__dirname, 'fixtures', 'content'), root, { recursive: true })
  await writeT60Content(root)
  console.log(root)
}

/** Acrescenta o conteúdo da T-60 a uma cópia das fixtures (também usado pelo e2e). */
async function writeT60Content(root) {
  const file = (name) => join(root, 'fixture', name + '.json')
  async function edit(name, update) {
    const cards = JSON.parse(
      await readFile(file(name), 'utf8').catch(() => '[]')
    )
    update(cards)
    await writeFile(file(name), JSON.stringify(cards, null, 2))
  }
  await edit('attribute', (cards) => {
    const template = cards.find((card) => card.id === dexterity)
    cards.push({
      ...template,
      id: wisdom,
      name: 'Sabedoria Básica',
      attributes: ['wisdom'],
    })
  })
  await edit('class', (classes) => {
    const warrior = classes.find((card) => card.playerClass === 'warrior')
    const option = (id, name, additionalAttributes, reinforcedAttributes) => ({
      id,
      name,
      additionalAttributes,
      reinforcedAttributes,
      effects: [],
    })
    warrior.specializations = [
      option('knight', 'Cavaleiro', ['wisdom'], ['endurance']),
      option('guardian', 'Guardião', [], ['endurance']),
      option('berserker', 'Berserker', [], ['strength']),
      option('duelist', 'Duelista', ['dexterity'], []),
    ]
    classes.push({
      playerClass: 'mage',
      name: 'Mago',
      essentialAttributes: ['wisdom'],
      baseModifiers: {
        attack: 3,
        defense: 2,
        accuracy: 40,
        evasion: 18,
        celerity: 10,
        piercing: 0,
        reflection: 0,
      },
      starterDeck: [
        { cardId: wisdom, copies: 40 },
        { cardId: strength, copies: 20 },
      ],
      specializations: [],
    })
  })
  await edit('zone', (zones) => {
    zones.find((card) => card.id === mine).questDeck = [A, B, C, D, E]
  })
  await edit('randomEvent', (cards) => {
    const [traveler] = cards
    cards.push({
      ...traveler,
      id: toll,
      title: 'Pedágio da Ponte',
      requirements: [
        { id: 'gold', kind: 'payGold', amount: 1, text: 'Pague 1 de ouro.' },
      ],
      goodOutcome: { text: 'Receba a picareta.', steps: [grant] },
      badOutcome: empty,
    })
  })
  const enemyOf = async (modifiers) => {
    const [card] = JSON.parse(await readFile(file('combatEvent'), 'utf8'))
    const [enemy] = card.enemies
    return {
      ...enemy,
      count: 1,
      health: 1,
      abilities: [],
      modifiers: {
        ...enemy.modifiers,
        attack: 20,
        accuracy: 100,
        defense: 0,
        evasion: 0,
        celerity: 0,
        ...modifiers,
      },
    }
  }
  const weak = await enemyOf({ attack: 0 })
  const reflective = await enemyOf({ attack: 0, reflection: 2 })
  const lethal = await enemyOf({ attack: 30 })
  const combat = (enemy) => ({
    enemies: [enemy],
    goodOutcome: empty,
    badOutcome: empty,
    noEscape: false,
  })
  const interaction = (text, location = harborLocation) => ({
    type: 'interaction',
    text,
    location,
  })
  const quest = (id, title, stages, rewards = []) => ({
    id,
    title,
    summary: `Resumo de ${title}.`,
    stages,
    rewards,
  })
  await writeFile(
    file('zoneQuest'),
    JSON.stringify(
      [
        quest(A, 'Pista no Porto', [interaction('Leia a pista.')]),
        quest(B, 'Entrega', [interaction('Entregue a mensagem')], [grant]),
        quest(C, 'Escolta', [interaction('Acompanhe o mercador.')]),
        quest(D, 'Ervas', [interaction('Entregue as ervas.')]),
        quest(E, 'Ferramenta Perdida', [interaction('Devolva a ferramenta.')]),
        quest(objectivesQuest, 'Serviços da Cidade', [
          {
            type: 'objectives',
            text: 'Cumpra as metas.',
            location: urbanLocation,
            randomEventSuccesses: 3,
            combatVictories: 3,
          },
        ]),
        quest(reflectionQuest, 'Caça Espelhada', [
          {
            type: 'combatEvent',
            text: 'Enfrente o lobo.',
            location: forestLocation,
            combat: combat(reflective),
          },
        ]),
        quest(defeatQuest, 'Caça Perigosa', [
          {
            type: 'combatEvent',
            text: 'Enfrente o lobo.',
            location: forestLocation,
            combat: combat(lethal),
          },
        ]),
        quest(winQuest, 'Caça Simples', [
          {
            type: 'combatEvent',
            text: 'Enfrente o lobo.',
            location: forestLocation,
            combat: combat(weak),
          },
        ]),
        quest(
          sequenceQuest,
          'Ponte e Lobo',
          [
            {
              type: 'randomEvent',
              text: 'Pague o pedágio.',
              location: forestLocation,
              eventCardId: toll,
            },
            {
              type: 'combatEvent',
              text: 'Enfrente o lobo.',
              location: forestLocation,
              combat: combat(weak),
            },
          ],
          [step('gainGold', 5, 'Receba 5 de ouro.')]
        ),
      ],
      null,
      2
    )
  )
  await edit('dimension', ([dimension]) => {
    dimension.eventDecks.push({
      zoneType: 'forest',
      cards: [{ cardId: toll, copies: 1 }],
    })
  })
}

const knight = { playerClass: 'warrior', specializationId: 'knight' }
const open = (questId, questCardId, extra = {}) => ({
  questId,
  questCardId,
  originZoneId: mine,
  stageIndex: 0,
  status: 'ready',
  ...extra,
})
const trial = (questId, randomEventSuccesses, combatVictories) => ({
  questId,
  type: 'trialQuest',
  classId: 'warrior',
  specializationId: 'knight',
  randomEventSuccesses,
  combatVictories,
})

// `zone`: zona inicial. `board`: [questBoard, questDrawPile] da Mina Velha (omitido, usa o deck do catálogo).
const scenarios = [
  {
    key: 'quadro',
    zone: mine,
    board: [
      [A, B, C],
      [D, E],
    ],
    full: true,
  },
  {
    key: 'abandono-cheio',
    zone: mine,
    ap: 0,
    board: [[A, D, C], [E]],
    zoneQuests: [open('t60-abandon-full', B)],
  },
  {
    key: 'abandono-vazio',
    zone: mine,
    ap: 0,
    board: [[A, null, C], []],
    zoneQuests: [open('t60-abandon-empty', B)],
  },
  {
    key: 'provacao',
    zone: harbor,
    peak: 30,
    full: true,
    event: toll,
    zoneQuests: [
      open('t60-objectives', objectivesQuest, {
        originZoneId: harbor,
        randomEventSuccesses: 0,
        combatVictories: 0,
      }),
    ],
  },
  {
    key: 'limite',
    zone: harbor,
    peak: 30,
    zoneQuests: [
      open('t60-limit-a', A, { originZoneId: harbor }),
      open('t60-limit-c', C, { originZoneId: harbor }),
      open('t60-limit-d', D, { originZoneId: harbor }),
    ],
  },
  {
    key: 'vitoria-reflexao',
    zone: mine,
    health: 2,
    zoneQuests: [open('t60-reflection', reflectionQuest)],
    generic: [trial('t60-trial', 0, 1)],
  },
  {
    key: 'vitoria-de-pe',
    zone: mine,
    zoneQuests: [open('t60-win', winQuest)],
    generic: [trial('t60-trial', 0, 1)],
  },
  {
    key: 'derrota',
    zone: mine,
    health: 2,
    zoneQuests: [open('t60-defeat', defeatQuest)],
    generic: [trial('t60-trial', 0, 1)],
  },
  {
    key: 'sequencia',
    zone: mine,
    full: true,
    board: [[], []],
    zoneQuests: [open('q1', sequenceQuest)],
  },
  {
    key: 'concessoes',
    zone: harbor,
    peak: 30,
    generic: [trial('t60-trial', 3, 3)],
    folder: [
      { cardId: strength, copies: 10 },
      { cardId: wisdom, copies: 20 },
    ],
  },
  {
    key: 'mentor-aceite',
    zone: harbor,
    ap: 2,
    peak: 30,
    gold: 200,
    specializations: [{ ...knight, deckLockMet: true }],
  },
  {
    key: 'mentor-concessao',
    zone: harbor,
    ap: 2,
    peak: 30,
    specializations: [{ ...knight, deckLockMet: true }],
    generic: [
      {
        questId: 't60-mentor',
        type: 'mentorQuest',
        classId: 'mage',
        randomEventSuccesses: 5,
        combatVictories: 5,
      },
    ],
    folder: [
      { cardId: wisdom, copies: 20 },
      { cardId: dexterity, copies: 10 },
    ],
  },
  { key: 'legado', zone: harbor, legacy: true },
]

function seed(state, scenario) {
  const { player } = state.members[0]
  if (scenario.legacy)
    for (const key of Object.keys(questDefaults)) delete state.config[key]
  else Object.assign(state.config, questDefaults)
  Object.assign(state.config, { actionPointsPerTurn: 3, inventoryCapacity: 1 })
  state.rngState = [0, 0, 0, 10]
  state.turn.round = 6
  state.turn.actionPoints = scenario.ap ?? 3
  state.dimension.map = {
    zones: [
      {
        zoneId: harbor,
        x: 0,
        y: 0,
        arrows: ['north', 'east', 'south', 'west'],
      },
      {
        zoneId: mine,
        x: 1,
        y: 0,
        arrows: ['west'],
        ...(scenario.board &&
          !scenario.legacy && {
            questBoard: scenario.board[0],
            questDrawPile: scenario.board[1],
          }),
        ...(!scenario.board &&
          !scenario.legacy && { questDeck: [A, B, C, D, E] }),
      },
    ],
    crossings: [{ zoneIds: [harbor, mine] }],
  }
  state.eventDecks = [
    {
      zoneType: 'urban',
      cards: scenario.event ? [scenario.event] : [],
      discard: [],
    },
    { zoneType: 'forest', cards: [], discard: [] },
  ]
  state.upgradedCombatDecks = ['urban', 'forest']
  Object.assign(player, {
    zoneId: scenario.zone,
    respawnZoneId: harbor,
    baseHealth: 20,
    health: scenario.health ?? 22,
    peak: scenario.peak ?? 10,
    vigor: 9,
    gold: scenario.gold ?? 37,
    statuses: [],
    inventory: scenario.full ? [{ cardId: potion, quantity: 1 }] : [],
    vault: { slots: [], decks: [], gold: 0 },
    tcgFolder: scenario.folder ?? [],
  })
  for (const slot of Object.keys(player.equipment))
    player.equipment[slot] = null
  for (const modifier of Object.keys(player.modifiers))
    player.modifiers[modifier] = 0
  Object.assign(player.modifiers, { attack: 20, accuracy: 100, celerity: 100 })
  if (scenario.legacy) {
    for (const key of [
      'openZoneQuests',
      'openGenericQuests',
      'questOrder',
      'specializations',
      'completedZoneQuests',
    ])
      delete player[key]
    return
  }
  const zoneQuests = scenario.zoneQuests ?? []
  const generic = scenario.generic ?? []
  player.openZoneQuests = zoneQuests
  player.openGenericQuests = generic
  player.questOrder = [...zoneQuests, ...generic].map((entry) => entry.questId)
  player.specializations = (scenario.specializations ?? []).map((entry) => ({
    ...entry,
  }))
}

function assertProjection(party, scenario) {
  const [{ player }] = party.members
  assert.equal(party.turn.round, 6, 'rodada inicial')
  assert.equal(party.turn.actionPoints, scenario.ap ?? 3, 'PA inicial')
  assert.equal(player.zoneId, scenario.zone)
  if (scenario.legacy) {
    assert.deepEqual(player.questBoard, [])
    assert.deepEqual(player.openQuests, [])
    assert.deepEqual(player.questChoices, [])
    assert.deepEqual(player.specializations, [])
    return
  }
  assert.equal(
    player.openQuests.length,
    (scenario.zoneQuests?.length ?? 0) + (scenario.generic?.length ?? 0)
  )
  if (scenario.board)
    assert.deepEqual(
      player.questBoard.map((offer) => offer.questCardId),
      scenario.board[0].filter(Boolean)
    )
  else if (scenario.zone === mine)
    assert.deepEqual(
      player.questBoard.map((offer) => offer.questCardId),
      [A, B, C]
    )
  else assert.deepEqual(player.questBoard, [])
}

// O preparador precisa gravar no mesmo banco do backend em execução.
// Ordem: DATABASE_URL do ambiente, depois `.env.test`, depois `.env`.
function loadDatabaseUrl() {
  config({ path: '.env.test', quiet: true })
  config({ path: '.env', quiet: true })
  assert(
    process.env.DATABASE_URL,
    'DATABASE_URL ausente: defina no ambiente, no .env.test ou no .env.'
  )
  const { host, pathname } = new URL(process.env.DATABASE_URL)
  console.error(`Banco usado: ${host}${pathname}`)
}

async function prepareCampaigns(keys) {
  for (const key of keys)
    assert(
      scenarios.some((scenario) => scenario.key === key),
      `Campanha desconhecida: ${key}`
    )
  const selected = keys.length
    ? scenarios.filter((scenario) => keys.includes(scenario.key))
    : scenarios
  loadDatabaseUrl()
  const base = process.env.FEAT15_API_URL ?? 'http://localhost:3333'
  async function api(path, body) {
    const response = await fetch(
      new URL(path, base),
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
    )
    if (!response.ok)
      throw new Error(
        `${path}: ${response.status} ${(await response.text()).slice(0, 500)}`
      )
    return response.json()
  }
  await api('/health')
  const { values } = await api('/lab/config')
  for (const key of Object.keys(questDefaults))
    assert(key in values, `O laboratório não tem ${key}.`)
  for (const card of [B, sequenceQuest, toll, wisdom])
    await api(`/catalog/cards/${card}`)
  const classes = await api('/catalog/classes')
  assert(
    classes.some((entry) => entry.playerClass === 'mage'),
    'A classe mage não está publicada.'
  )
  assert.equal(
    classes.find((entry) => entry.playerClass === 'warrior').specializations
      .length,
    4,
    'O Guerreiro precisa de quatro especializações.'
  )

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    for (const scenario of selected) {
      const { id } = await api('/parties', {
        name: `T-60 — ${scenario.key}`,
        characterName: 'Lia',
        playerClass: 'warrior',
      })
      const path = `/parties/${id}`
      const url = new URL(path, base).href
      try {
        await api(`${path}/session`, {})
        const {
          rows: [row],
        } = await db.query('select state from parties where id = $1', [id])
        assert(
          row,
          'A API e o preparador precisam usar o mesmo banco de teste.'
        )
        seed(row.state, scenario)
        await db.query('update parties set state = $1 where id = $2', [
          row.state,
          id,
        ])
        const party = await (await fetch(new URL(path, base))).json()
        assertProjection(party, scenario)
        const [{ id: memberId, player }] = party.members
        console.log(
          JSON.stringify({
            scenario: scenario.key,
            id,
            url,
            memberId,
            actions: player.availableActions,
            board: player.questBoard.map((offer) => offer.questCardId),
            open: player.openQuests.map((quest) => quest.questId),
            choices: player.questChoices.map((choice) => choice.type),
          })
        )
      } catch (error) {
        throw new Error(`${scenario.key} (${url}): ${error.message}`)
      }
    }
  } finally {
    await db.end()
  }
}

async function readSnapshot(id) {
  assert(id, 'Informe o ID da campanha.')
  loadDatabaseUrl()
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    const {
      rows: [row],
    } = await db.query('select state, saved_at from parties where id = $1', [
      id,
    ])
    assert(row, 'Campanha não encontrada.')
    const { rngState, eventDecks, dimension, members } = row.state
    const {
      openZoneQuests,
      openGenericQuests,
      questOrder,
      specializations,
      completedZoneQuests,
      playerClasses,
      peak,
      gold,
    } = members[0].player
    console.log(
      JSON.stringify({
        savedAt: row.saved_at,
        rngState,
        eventDecks,
        zones: dimension.map.zones.map(
          ({ zoneId, questBoard, questDrawPile, questDeck }) => ({
            zoneId,
            questBoard,
            questDrawPile,
            questDeck,
          })
        ),
        openZoneQuests,
        openGenericQuests,
        questOrder,
        specializations,
        completedZoneQuests,
        playerClasses,
        peak,
        gold,
      })
    )
  } finally {
    await db.end()
  }
}

async function main() {
  if (process.argv[2] === 'content') return prepareContent()
  if (process.argv[2] === 'campaigns')
    return prepareCampaigns(process.argv.slice(3))
  if (process.argv[2] === 'snapshot') return readSnapshot(process.argv[3])
  throw new Error('Use content, campaigns ou snapshot <id>.')
}

module.exports = { writeT60Content, scenarios, seed }

if (require.main === module)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
