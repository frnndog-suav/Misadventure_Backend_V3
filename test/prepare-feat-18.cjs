// T-80 — preparador das campanhas da FEAT-18 (padrão da T-73, `prepare-feat-17.cjs`).
//   node test/prepare-feat-18.cjs content              copia as fixtures para uma pasta temporária (a `fixture` já tem o Estábulo e as montarias)
//   node test/prepare-feat-18.cjs campaigns [nomes]    cria as campanhas pela API e grava os pontos de partida no PostgreSQL
//   node test/prepare-feat-18.cjs snapshot <id>        lê a linha da campanha sem passar pela API
// Script CommonJS do Node: globais e require declarados para o ESLint.
/* global require, module, process, __dirname, console, fetch, URL */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { cp, mkdtemp } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { config } = require('dotenv')
const { Client } = require('pg')

const harbor = 'fixture.gray-harbor'
const mine = 'fixture.old-mine'
const bend = 'fixture.stone-bend'
const grove = 'fixture.whispering-grove'
const horse = 'fixture.plow-horse'
const pony = 'fixture.war-pony'
const potion = 'fixture.healing-potion'
const sword = 'fixture.short-sword'
const strength = 'fixture.strength-basic'

async function prepareContent() {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-feat-18-'))
  await cp(join(__dirname, 'fixtures', 'content'), root, { recursive: true })
  console.log(root)
}

const stack = (cardId, quantity = 1) => ({ cardId, quantity })
const mount = (cardId, inventory = [], tcgFolder = []) => ({
  cardId,
  inventory,
  tcgFolder,
})

// `zone`: zona inicial. `mount`: montaria gravada (`null` = sem). `config`: chaves do laboratório do grupo.
// `folder`: pasta. A Mina Velha (Rural) tem o Estábulo com o Cavalo de Arado.
const scenarios = [
  {
    key: 'estabulo',
    zone: mine,
    gold: 400,
    // D-151 d: a doação de 400 do contrato só cabe com a bolsa acima de 300.
    config: { purseCapacity: 1000 },
    mount: null,
  },
  {
    key: 'montaria-com-conteudo',
    zone: mine,
    gold: 200,
    // Vender (+140) e recomprar (−322) no mesmo lote: 340 precisa caber na bolsa.
    config: { purseCapacity: 1000 },
    mount: mount(horse, [stack(potion, 2)], [{ cardId: strength, copies: 1 }]),
  },
  {
    key: 'inventario-cheio',
    zone: harbor,
    gold: 50,
    config: { inventoryCapacity: 1, mountInventorySlots: 1 },
    inventory: [stack(sword)],
    folder: [{ cardId: strength, copies: 1 }],
    mount: mount(pony),
  },
  {
    key: 'dois-caminhos',
    zone: harbor,
    gold: 0,
    mount: mount(horse),
  },
  {
    key: 'sem-montaria',
    zone: harbor,
    gold: 0,
    mount: null,
  },
]

// Porto (0,0) — Mina (1,0) — Curva (1,1) e Porto — Bosque (0,1) — Curva:
// a Curva fica a 2 travessias do Porto por dois caminhos.
const map = {
  zones: [
    { zoneId: harbor, x: 0, y: 0, arrows: ['east', 'south'] },
    { zoneId: mine, x: 1, y: 0, arrows: ['west', 'south'] },
    { zoneId: grove, x: 0, y: 1, arrows: ['north', 'east'] },
    { zoneId: bend, x: 1, y: 1, arrows: ['north', 'west'] },
  ],
  crossings: [
    { zoneIds: [harbor, mine] },
    { zoneIds: [harbor, grove] },
    { zoneIds: [mine, bend] },
    { zoneIds: [grove, bend] },
  ],
}

function seed(saved, scenario) {
  const { player } = saved.members[0]
  saved.rngState = [0, 0, 0, 10]
  saved.turn.round = 6
  saved.turn.actionPoints = 3
  saved.dimension.map = JSON.parse(JSON.stringify(map))
  Object.assign(saved.config, scenario.config ?? {})
  // Fator fixo, como no cenário do contrato (115%): o preço não depende do sorteio da criação.
  for (const market of saved.markets ?? []) market.factorPercent = 115
  Object.assign(player, {
    zoneId: scenario.zone,
    respawnZoneId: harbor,
    gold: scenario.gold,
    inventory: scenario.inventory ?? [],
    tcgFolder: scenario.folder ?? [],
    vault: { slots: [], decks: [], gold: 0 },
    mount: scenario.mount,
  })
}

function assertProjection(party, scenario) {
  const [{ player }] = party.members
  assert.equal(party.turn.round, 6, 'rodada inicial')
  assert.equal(party.turn.actionPoints, 3, 'PA inicial')
  assert.equal(player.zoneId, scenario.zone)
  assert.equal(player.gold, scenario.gold)
  assert.equal(player.mount?.cardId ?? null, scenario.mount?.cardId ?? null)
  assert.equal(player.moveRoutes.length, player.moveTargets.length)
  assert.equal(player.market?.stable != null, scenario.zone === mine)
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
  const base = process.env.FEAT18_API_URL ?? 'http://localhost:3333'
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
  await api(`/catalog/cards/${pony}`)

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    for (const scenario of selected) {
      const { id } = await api('/parties', {
        name: `T-80 — ${scenario.key}`,
        characterName: 'Lia',
        playerClass: 'rogue',
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
            moveRoutes: player.moveRoutes,
            stable: player.market?.stable ?? null,
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
    const { zoneId, gold, inventory, tcgFolder, mount } = members[0].player
    console.log(
      JSON.stringify({
        savedAt: row.saved_at,
        rngState,
        zoneId,
        gold,
        inventory,
        tcgFolder,
        mount,
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

module.exports = { scenarios, seed }

if (require.main === module)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
