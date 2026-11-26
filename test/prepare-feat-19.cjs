// T-86 — campanhas locais descartáveis para a validação da FEAT-19.
/* global require, process, __dirname, console, fetch, URL */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { cp, mkdir, mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { config } = require('dotenv')
const { Client } = require('pg')

const dimensionId = 'fixture.test-dimension'
const successorId = 'fixture-next.next-dimension'
const shardId = 'fixture.shard'
const prizeId = 'fixture.blade-of-dusk'
const harborId = 'fixture.gray-harbor'
const mineId = 'fixture.old-mine'
const mountId = 'fixture.war-pony'
const strengthId = 'fixture.strength-basic'
const profiles = {
  base: [
    'congelar',
    'passagem',
    'sem-espaco',
    'dois-fragmentos',
    'porto',
    'zero-pa',
  ],
  chefe: ['vitoria', 'sem-vitoria'],
  montaria: ['slot-vazio', 'slot-ocupado'],
}

async function prepareContent(profile) {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-feat-19-'))
  await cp(join(__dirname, 'fixtures', 'content'), root, { recursive: true })
  const fixture = join(root, 'fixture')
  const read = async (name) =>
    JSON.parse(await readFile(join(fixture, name + '.json'), 'utf8'))
  const write = (directory, name, value) =>
    writeFile(
      join(directory, name + '.json'),
      JSON.stringify(value, null, 2) + '\n'
    )
  const [dimension] = await read('dimension')
  const items = await read('item')
  const potion = items.find(({ id }) => id === 'fixture.healing-potion')
  items.push({
    ...potion,
    id: shardId,
    name: 'Fragmento',
    effects: [],
    stockPrice: null,
    completionItem: true,
  })
  await write(fixture, 'item', items)
  const [wolves] = await read('combatEvent')
  dimension.completion = {
    zoneTitle: 'Mina Velha',
    requirement: [{ cardId: shardId, count: 3 }],
    grandPrize: {
      cards:
        profile === 'montaria'
          ? [{ cardId: mountId, copies: 2 }]
          : [{ cardId: prizeId, copies: 1 }],
      gold: 100,
    },
    finalBoss:
      profile === 'chefe'
        ? {
            title: 'Guardião da Mina Velha',
            flavorText: null,
            noEscape: true,
            enemies: [
              {
                ...wolves.enemies[0],
                name: 'Guardião',
                count: 1,
                enemyCategory: 'boss',
                health: 1,
              },
            ],
          }
        : null,
  }
  await write(fixture, 'dimension', [dimension])

  const next = join(root, 'fixture-next')
  await mkdir(next)
  await write(next, 'collection', { name: 'Coleção Sucessora' })
  await write(next, 'zone', [
    {
      id: 'fixture-next.city',
      title: 'Porto da Segunda Dimensão',
      location: 'Costa Nova',
      zoneType: 'urban',
      connectionArrows: 4,
      arrowLayout: null,
      zoneActions: ['startEvent', 'useVault', 'saveRespawnPoint'],
      effects: [],
    },
  ])
  await write(next, 'dimension', [
    {
      id: successorId,
      name: 'Segunda Dimensão',
      flavorText: null,
      releaseOrder: 2,
      arrivalZoneTitle: 'Porto da Segunda Dimensão',
      effects: [],
      status: profile === 'base' ? 'draft' : 'published',
      rewardDecks: [],
    },
  ])
  console.log(root)
}

async function prepareCampaigns(profile) {
  const base = process.env.FEAT19_API_URL ?? 'http://localhost:3333'
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
    const result = await response.json()
    assert(
      response.ok,
      `${path} → ${response.status} ${JSON.stringify(result)}`
    )
    return result
  }

  await api('/health')
  const dimension = await api(`/catalog/cards/${dimensionId}`)
  assert.equal(dimension.completion?.zoneTitle, 'Mina Velha')
  assert.equal(Boolean(dimension.completion.finalBoss), profile === 'chefe')
  assert.equal(
    dimension.completion.grandPrize.cards[0].cardId,
    profile === 'montaria' ? mountId : prizeId
  )
  assert.equal((await api(`/catalog/cards/${shardId}`)).completionItem, true)

  config({ path: '.env.test', quiet: true })
  config({ path: '.env', quiet: true })
  assert(
    process.env.DATABASE_URL,
    'Defina DATABASE_URL com o banco local da API.'
  )
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    for (const scenario of profiles[profile]) {
      const { id } = await api('/parties', {
        name: `T-86 — ${scenario}`,
        characterName: 'Lia',
        playerClass: 'rogue',
      })
      const path = `/parties/${id}`
      await api(`${path}/session`, {})
      const {
        rows: [row],
      } = await db.query('select state from parties where id = $1', [id])
      assert(row, `${id}: a API e o preparador precisam usar o mesmo banco.`)
      const saved = row.state
      const [{ id: memberId, player }] = saved.members
      assert.equal(saved.dimension.dimensionCardId, dimensionId)
      assert(
        saved.dimension.map.zones.some(({ zoneId }) => zoneId === mineId),
        `${id}: a Mina Velha precisa estar no mapa.`
      )
      const zoneId = scenario === 'porto' ? harborId : mineId
      player.zoneId = zoneId
      player.gold = 0
      saved.turn.actionPoints = scenario === 'zero-pa' ? 0 : 3
      saved.rngState = [0, 0, 0, 10]
      if (scenario === 'sem-vitoria') saved.config.maxCombatCycles = 1
      if (scenario === 'sem-espaco') {
        saved.config.inventoryCapacity = 1
        saved.config.tcgFolderCapacity = 1
        saved.config.mountInventorySlots = 1
        saved.config.mountFolderCapacity = 1
        player.inventory = [{ cardId: 'fixture.short-sword', quantity: 1 }]
        player.tcgFolder = [{ cardId: strengthId, copies: 1 }]
      }
      if (scenario === 'sem-espaco' || scenario === 'slot-ocupado') {
        player.mount = {
          cardId: 'fixture.plow-horse',
          inventory:
            scenario === 'sem-espaco'
              ? [{ cardId: 'fixture.short-sword', quantity: 1 }]
              : [],
          tcgFolder:
            scenario === 'sem-espaco'
              ? [{ cardId: strengthId, copies: 1 }]
              : [],
        }
      }
      await db.query('update parties set state = $1 where id = $2', [saved, id])
      const quantity = scenario === 'dois-fragmentos' ? 2 : 3
      await api(`/lab/parties/${id}/members/${memberId}/grants`, {
        type: 'card',
        cardId: shardId,
        quantity,
      })
      const party = await api(path)
      const projected = party.members[0].player
      assert.equal(projected.zoneId, zoneId)
      assert.deepEqual(projected.completionItems, [
        { cardId: shardId, quantity },
      ])
      assert.deepEqual(
        projected.inventory.map(({ cardId, quantity }) => ({
          cardId,
          quantity,
        })),
        player.inventory.map(({ cardId, quantity }) => ({ cardId, quantity }))
      )
      const actions = projected.availableActions
      const eligible =
        zoneId === mineId && quantity === 3 && saved.turn.actionPoints > 0
      assert.equal(actions.includes('completeDimension'), eligible)
      if (eligible)
        assert.equal(
          actions.indexOf('completeDimension') + 1,
          actions.indexOf('endTurn')
        )
      console.log(
        JSON.stringify({
          scenario,
          id,
          memberId,
          url: new URL(path, base).href,
          actions,
        })
      )
    }
  } finally {
    await db.end()
  }
}

async function main() {
  const [, , command, profile = 'base'] = process.argv
  assert(Object.hasOwn(profiles, profile), 'Use base, chefe ou montaria.')
  if (command === 'content') return prepareContent(profile)
  if (command === 'campaigns') return prepareCampaigns(profile)
  throw new Error('Use content ou campaigns, seguido do perfil.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
