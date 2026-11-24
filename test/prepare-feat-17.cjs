// T-73 — preparador das campanhas da FEAT-17 (padrão da T-66, `prepare-feat-16.cjs`).
//   node test/prepare-feat-17.cjs content              copia as fixtures para uma pasta temporária e acrescenta o conteúdo da T-73
//   node test/prepare-feat-17.cjs campaigns [nomes]    cria as campanhas pela API e grava os pontos de partida no PostgreSQL
//   node test/prepare-feat-17.cjs snapshot <id>        lê a linha da campanha sem passar pela API
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
const sword = 'fixture.short-sword'
const runeblade = 'fixture.t73-runeblade'
const ore = 'fixture.iron-ore'
const shard = 'fixture.ember-shard'
const blueprint = 'fixture.sword-blueprint'

// Encantamentos do Porto Cinzento na cópia (o `ember-edge` já vem da fixture).
const emberEdge = {
  id: 'ember-edge',
  name: 'Fio de Brasa',
  kind: 'element',
  element: 'fire',
  bonusPercent: 10,
  materials: [{ cardId: shard, quantity: 1 }],
}
const frostEdge = {
  id: 'frost-edge',
  name: 'Fio de Gelo',
  kind: 'element',
  element: 'water',
  bonusPercent: 15,
  materials: [{ cardId: shard, quantity: 1 }],
}
const guardRune = {
  id: 'guard-rune',
  name: 'Runa da Guarda',
  kind: 'effect',
  effects: [
    {
      text: '+20% de Defesa enquanto estiver em uso.',
      trigger: null,
      cost: [],
      activation: [
        {
          kind: 'modifierPercent',
          changes: [{ modifier: 'defense', percent: 20 }],
        },
      ],
      duration: { kind: 'whileSourceActive' },
      mark: 'buff',
    },
  ],
  abilities: [],
  materials: [{ cardId: ore, quantity: 2 }],
}

async function prepareContent() {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-feat-17-'))
  await cp(join(__dirname, 'fixtures', 'content'), root, { recursive: true })
  await writeT73Content(root)
  console.log(root)
}

async function editJson(root, name, edit) {
  const file = join(root, 'fixture', name)
  await writeFile(
    file,
    JSON.stringify(edit(JSON.parse(await readFile(file, 'utf8'))), null, 2)
  )
}

/**
 * Acrescenta à cópia das fixtures: o Artífice (o Guerreiro renomeado, como no
 * e2e da T-71, com a especialização Ferreiro Arcano), a Lâmina Rúnica (slot de
 * elemento sem requisito e slot de efeito em +3) e dois encantamentos no Porto.
 */
async function writeT73Content(root) {
  await editJson(root, 'class.json', (classes) =>
    classes.map((c) =>
      c.playerClass === 'warrior'
        ? {
            ...c,
            playerClass: 'artificer',
            name: 'Artífice',
            // O conteúdo pede quatro opções ou nenhuma; só o Ferreiro Arcano tem regra (D-134).
            specializations: [
              ['arcaneSmith', 'Ferreiro Arcano'],
              ['tinkerer', 'Engenhoqueiro'],
              ['inventor', 'Inventor'],
              ['builder', 'Construtor'],
            ].map(([id, name]) => ({
              id,
              name,
              additionalAttributes: [],
              reinforcedAttributes: [],
              effects: [],
            })),
          }
        : c
    )
  )
  await editJson(root, 'equipment.json', (cards) => {
    const template = cards.find((card) => card.id === sword)
    return [
      ...cards,
      {
        ...template,
        id: runeblade,
        name: 'Lâmina Rúnica',
        rarity: 'uncommon',
        enchantment: {
          slots: [
            { kind: 'element', minRefinement: 0 },
            { kind: 'effect', minRefinement: 3 },
          ],
        },
      },
    ]
  })
  await editJson(root, 'zone.json', (zones) =>
    zones.map((zone) =>
      zone.id === harbor
        ? {
            ...zone,
            blacksmith: { enchantments: [emberEdge, frostEdge, guardRune] },
          }
        : zone
    )
  )
}

const stack = (cardId, quantity = 1, equipmentState) => ({
  cardId,
  quantity,
  ...(equipmentState && { equipmentState }),
})
const state = (refinement = 0, extra = {}) => ({
  refinement,
  enchantments: [],
  repairMarks: 0,
  broken: false,
  ...extra,
})
const applied = (enchantment, slotIndex) => ({
  enchantment,
  zoneId: harbor,
  slotIndex,
})

// `zone`: zona inicial. `playerClass`: classe ao criar. `weapon`: estado da arma em uso (Espada Curta).
// `arcaneSmith`: concede o Ferreiro Arcano com a trava cumprida. `legacy`: sem mercados sorteados (fator 100).
// `seed`: último número do estado do RNG (padrão 10).
const scenarios = [
  {
    key: 'ferreiro',
    zone: harbor,
    gold: 300,
    weapon: state(0),
    inventory: [stack(runeblade, 1, state(0)), stack(ore, 8), stack(shard, 2)],
  },
  {
    key: 'quebra-mais-6',
    zone: harbor,
    gold: 300,
    weapon: state(6),
    inventory: [stack(ore, 3)],
  },
  {
    key: 'substituir',
    zone: harbor,
    gold: 300,
    inventory: [
      stack(runeblade, 1, state(3, { enchantments: [applied(emberEdge, 0)] })),
      stack(shard, 1),
    ],
  },
  {
    key: 'conserto-receita',
    zone: harbor,
    gold: 100,
    weapon: state(4, { broken: true }),
    inventory: [stack(blueprint), stack(ore, 2)],
  },
  {
    key: 'oficina',
    zone: mine,
    playerClass: 'artificer',
    gold: 100,
    inventory: [
      stack(sword, 1, state(4, { broken: true })),
      stack(sword, 1, state(6)),
      stack(ore, 3),
    ],
  },
  {
    key: 'ferreiro-arcano',
    zone: harbor,
    playerClass: 'artificer',
    arcaneSmith: true,
    gold: 300,
    weapon: state(0),
    inventory: [stack(shard, 2), stack(ore, 2)],
    // 1º D20 = 15: passa no limiar 13 da Runa da Guarda (retorno do FE na T-73).
    seed: 14,
  },
  {
    key: 'venda',
    zone: harbor,
    gold: 0,
    legacy: true,
    inventory: [
      stack(sword, 1, state(3, { enchantments: [applied(emberEdge, 0)] })),
      stack(sword, 1, state(2, { broken: true })),
      stack(sword, 1, state(0, { repairMarks: 2 })),
      stack(sword, 1, state(0)),
    ],
  },
]

function seed(saved, scenario) {
  const { player } = saved.members[0]
  saved.rngState = [0, 0, 0, scenario.seed ?? 10]
  saved.turn.round = 6
  saved.turn.actionPoints = 3
  saved.dimension.map = {
    zones: [
      {
        zoneId: harbor,
        x: 0,
        y: 0,
        arrows: ['north', 'east', 'south', 'west'],
      },
      { zoneId: mine, x: 1, y: 0, arrows: ['west'] },
    ],
    crossings: [{ zoneIds: [harbor, mine] }],
  }
  if (scenario.legacy) {
    delete saved.markets
    delete saved.marketPool
  }
  Object.assign(player, {
    zoneId: scenario.zone,
    respawnZoneId: harbor,
    gold: scenario.gold,
    inventory: scenario.inventory,
    vault: { slots: [], decks: [], gold: 0 },
    equipment: { ...player.equipment, weapon: scenario.weapon ? sword : null },
  })
  delete player.equipmentStates
  if (scenario.weapon) player.equipmentStates = { weapon: scenario.weapon }
  if (scenario.arcaneSmith)
    player.specializations = [
      {
        playerClass: 'artificer',
        specializationId: 'arcaneSmith',
        deckLockMet: true,
      },
    ]
}

function assertProjection(party, scenario) {
  const [{ player }] = party.members
  assert.equal(party.turn.round, 6, 'rodada inicial')
  assert.equal(party.turn.actionPoints, 3, 'PA inicial')
  assert.equal(player.zoneId, scenario.zone)
  assert.equal(player.gold, scenario.gold)
  assert.equal(player.lastBlacksmithVisit, null)
  assert.equal(player.equipment.weapon, scenario.weapon ? sword : null)
  const artificer = scenario.playerClass === 'artificer'
  assert.equal(player.availableActions.includes('artificerWorkshop'), artificer)
  assert.equal(
    player.availableActions.includes('visitBlacksmith'),
    scenario.zone === harbor
  )
  assert(player.blacksmith, 'blacksmith presente')
  assert.equal(player.blacksmith.workshop !== null, artificer)
  assert.equal(player.blacksmith.blacksmith !== null, scenario.zone === harbor)
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
  const base = process.env.FEAT17_API_URL ?? 'http://localhost:3333'
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
  await api(`/catalog/cards/${runeblade}`)

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    for (const scenario of selected) {
      const { id } = await api('/parties', {
        name: `T-73 — ${scenario.key}`,
        characterName: 'Lia',
        playerClass: scenario.playerClass ?? 'rogue',
      })
      const path = `/parties/${id}`
      const url = new URL(path, base).href
      try {
        await api(`${path}/session`, {})
        const {
          rows: [row],
        } = await db.query('select state from parties where id = $1', [id])
        assert(row, 'A API e o preparador precisam usar o mesmo banco.')
        seed(row.state, scenario)
        await db.query('update parties set state = $1 where id = $2', [
          row.state,
          id,
        ])
        const response = await fetch(new URL(path, base))
        const party = await response.json()
        assert(response.ok, JSON.stringify(party).slice(0, 500))
        assertProjection(party, scenario)
        const [{ id: memberId, player }] = party.members
        console.log(
          JSON.stringify({
            scenario: scenario.key,
            id,
            url,
            memberId,
            actions: player.availableActions,
            gold: player.gold,
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
    const { rngState, members } = row.state
    const { gold, inventory, equipment, equipmentStates, specializations } =
      members[0].player
    console.log(
      JSON.stringify({
        savedAt: row.saved_at,
        rngState,
        gold,
        inventory,
        equipment,
        equipmentStates,
        specializations,
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

module.exports = { writeT73Content, scenarios, seed }

if (require.main === module)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
