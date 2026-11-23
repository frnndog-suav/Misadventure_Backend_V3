// T-66 — preparador das campanhas da FEAT-16 (padrão da T-60, `prepare-feat-15.cjs`).
//   node test/prepare-feat-16.cjs content              copia as fixtures para uma pasta temporária e acrescenta o conteúdo da T-66
//   node test/prepare-feat-16.cjs campaigns [nomes]    cria as campanhas pela API e grava os pontos de partida no PostgreSQL de teste
//   node test/prepare-feat-16.cjs snapshot <id>        lê a linha da campanha sem passar pela API
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
const outpost = 'fixture.t66-outpost'
const mine = 'fixture.old-mine'
const potion = 'fixture.healing-potion'
const arrows = 'fixture.arrows'
const booster = 'fixture.booster'
const coin = 'fixture.lucky-coin'
const sword = 'fixture.short-sword'
const shield = 'fixture.oak-shield'
const strength = 'fixture.strength-basic'
const endurance = 'fixture.endurance-basic'

async function prepareContent() {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-feat-16-'))
  await cp(join(__dirname, 'fixtures', 'content'), root, { recursive: true })
  await writeT66Content(root)
  console.log(root)
}

/** Acrescenta à cópia das fixtures uma cidade com mercado sem singles. */
async function writeT66Content(root) {
  const file = join(root, 'fixture', 'zone.json')
  const zones = JSON.parse(await readFile(file, 'utf8'))
  const template = zones.find((zone) => zone.id === harbor)
  zones.push({
    ...template,
    id: outpost,
    title: 'Posto da Fronteira',
    zoneActions: ['startEvent', 'useVault', 'visitMarket', 'saveRespawnPoint'],
    market: { stock: [potion, arrows], singles: false },
  })
  await writeFile(file, JSON.stringify(zones, null, 2))
}

// Vitrine fixa do Porto (4 slots, o último vazio) e cópias restantes no mercado.
const showcase = [sword, strength, coin, null]
const harborMarket = {
  zoneId: harbor,
  factorPercent: 100,
  singles: true,
  stock: [
    { cardId: shield, copies: 2 },
    { cardId: endurance, copies: 1 },
  ],
  showcase,
}
const outpostMarket = {
  zoneId: outpost,
  factorPercent: 100,
  singles: false,
  stock: [],
  showcase: [],
}
const pool = [sword, strength, coin, shield, endurance].map((cardId) => ({
  cardId,
  departed: 0,
}))

const stack = (cardId, quantity = 1) => ({ cardId, quantity })
const copies = (cardId, n) => ({ cardId, copies: n })

// `zone`: zona inicial. `inventory`/`vault`/`folder`: conteúdo inicial. `legacy`: save sem mercados sorteados.
const scenarios = [
  { key: 'mercado-singles', zone: harbor, gold: 300 },
  { key: 'mercado-sem-singles', zone: outpost, gold: 100 },
  {
    key: 'venda',
    zone: harbor,
    gold: 0,
    inventory: [stack(coin), stack(sword), stack(arrows, 20)],
    folder: [copies(strength, 2)],
  },
  { key: 'ouro-perdido', zone: harbor, gold: 290, inventory: [stack(coin)] },
  { key: 'expansoes', zone: harbor, gold: 300 },
  { key: 'booster-inventario', zone: harbor, inventory: [stack(booster)] },
  {
    key: 'booster-pasta-cheia',
    zone: harbor,
    inventory: [stack(booster)],
    folder: [copies(strength, 23)],
  },
  {
    key: 'booster-pendente',
    zone: harbor,
    inventoryCapacity: 1,
    inventory: [stack(booster)],
  },
  { key: 'booster-cofre', zone: harbor, vault: [stack(booster)] },
  { key: 'fora-do-mercado', zone: mine, gold: 100 },
  { key: 'legado', zone: harbor, gold: 100, legacy: true },
]

function seed(state, scenario) {
  const { player } = state.members[0]
  if (scenario.inventoryCapacity)
    state.config.inventoryCapacity = scenario.inventoryCapacity
  state.rngState = [0, 0, 0, 10]
  state.turn.round = 6
  state.turn.actionPoints = 3
  state.dimension.map = {
    zones: [
      {
        zoneId: harbor,
        x: 0,
        y: 0,
        arrows: ['north', 'east', 'south', 'west'],
      },
      { zoneId: outpost, x: -1, y: 0, arrows: ['east'] },
      { zoneId: mine, x: 1, y: 0, arrows: ['west'] },
    ],
    crossings: [{ zoneIds: [harbor, outpost] }, { zoneIds: [harbor, mine] }],
  }
  if (scenario.legacy) {
    delete state.markets
    delete state.marketPool
  } else {
    state.markets = [
      { ...harborMarket, stock: harborMarket.stock.map((s) => ({ ...s })) },
      { ...outpostMarket },
    ].map((market) => ({ ...market, showcase: [...market.showcase] }))
    state.marketPool = pool.map((entry) => ({ ...entry }))
  }
  Object.assign(player, {
    zoneId: scenario.zone,
    respawnZoneId: harbor,
    gold: scenario.gold ?? 0,
    inventory: scenario.inventory ?? [],
    vault: { slots: scenario.vault ?? [], decks: [], gold: 0 },
    tcgFolder: scenario.folder ?? [],
  })
}

function assertProjection(party, scenario) {
  const [{ player }] = party.members
  assert.equal(party.turn.round, 6, 'rodada inicial')
  assert.equal(party.turn.actionPoints, 3, 'PA inicial')
  assert.equal(player.zoneId, scenario.zone)
  assert.equal(player.gold, scenario.gold ?? 0)
  assert.equal(player.lastMarketVisit, null)
  assert.equal(player.lastBoosterOpening, null)
  if (scenario.zone === mine) {
    assert.equal(player.market, null)
    return
  }
  assert(player.market, 'market presente na cidade')
  if (scenario.legacy) {
    assert.equal(player.market.factorPercent, 100)
    assert.equal(player.market.showcase, null)
  } else if (scenario.zone === outpost) {
    assert.equal(player.market.showcase, null)
  } else {
    assert.equal(player.market.factorPercent, 100)
    assert.deepEqual(
      player.market.showcase.map((slot) => slot.offer?.cardId ?? null),
      showcase
    )
  }
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
  const base = process.env.FEAT16_API_URL ?? 'http://localhost:3333'
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
  for (const card of [outpost, arrows, booster])
    await api(`/catalog/cards/${card}`)

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    for (const scenario of selected) {
      const { id } = await api('/parties', {
        name: `T-66 — ${scenario.key}`,
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
            gold: player.gold,
            showcase:
              player.market?.showcase?.map((slot) =>
                slot.offer ? `${slot.offer.cardId}@${slot.offer.price}` : null
              ) ?? null,
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
    const { rngState, markets, marketPool, boosterQueue, members } = row.state
    const { gold, inventory, vault, tcgFolder, expansions } = members[0].player
    console.log(
      JSON.stringify({
        savedAt: row.saved_at,
        rngState,
        markets,
        marketPool,
        boosterQueue,
        gold,
        inventory,
        vault,
        tcgFolder,
        expansions,
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

module.exports = { writeT66Content, scenarios, seed }

if (require.main === module)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
