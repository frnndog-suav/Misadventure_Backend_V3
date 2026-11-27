/* global require, process, console, fetch, AbortSignal, URL, Buffer, performance */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { Client } = require('pg')
const { SeededRng } = require('../dist/core/rng/seeded-rng')

const base = 'http://127.0.0.1:3391'
const endTurn = { type: 'endTurn' }
const completeDimension = { type: 'completeDimension' }

async function call(method, route, expected, { body, key, seed } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (key) headers['Idempotency-Key'] = key
  if (seed !== undefined) headers['X-T91-Seed'] = String(seed)
  const start = performance.now()
  const response = await fetch(base + route, {
    method,
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const raw = await response.text()
  const elapsedMs = Math.round(performance.now() - start)
  assert.equal(response.status, expected, raw)
  return { body: JSON.parse(raw), elapsedMs, bytes: Buffer.byteLength(raw) }
}

const session = (id, key = randomUUID()) =>
  call('POST', '/parties/' + id + '/session', 200, { key })
const action = (id, body, key = randomUUID()) =>
  call('POST', '/parties/' + id + '/actions', 200, { body, key })

async function prepare(db) {
  async function create(label, aiHelperCount, configure = () => {}) {
    const { body: party } = await call('POST', '/parties', 201, {
      seed: 3,
      body: {
        name: 'T-108 ' + label,
        characterName: 'Lia',
        playerClass: 'warrior',
        aiHelperCount,
      },
    })
    const {
      rows: [{ state }],
    } = await db.query('SELECT state FROM parties WHERE id = $1', [party.id])
    configure(state)
    await db.query('UPDATE parties SET state = $2 WHERE id = $1', [
      party.id,
      state,
    ])
    console.log(
      JSON.stringify({
        label,
        save: party.id,
        human: party.members.find(({ isHost }) => isHost).id,
        openingMember: state.turn.memberId,
        order: state.turnOrder,
      })
    )
    return party.id
  }

  function order(state, indices) {
    state.turnOrder = indices.map((index) => state.members[index].id)
    state.turn.memberId = state.turnOrder[0]
  }

  function deck(state, cards) {
    state.eventDecks = [{ zoneType: 'urban', cards, discard: [] }]
    state.upgradedCombatDecks = ['urban']
  }

  function canComplete(state, member, moveFirst = false) {
    const player = state.members[member].player
    player.completionItems = [{ cardId: 'base.t91-shard', quantity: 1 }]
    state.rngState = SeededRng.fromSeed(0).state()
    if (moveFirst) {
      const city = state.dimension.startingCityZoneId
      const crossing = state.dimension.map.crossings.find(({ zoneIds }) =>
        zoneIds.includes(city)
      )
      assert.ok(crossing, 'Cidade inicial sem travessia')
      player.zoneId = crossing.zoneIds.find((id) => id !== city)
    }
  }

  await create('1-legado', 0, (state) => {
    state.schemaVersion = 11
    state.members[0].player.gold = 37
  })
  await create('1-humano', 2, (state) => order(state, [0, 1, 2]))
  await create('2-evento', 1, (state) => {
    order(state, [1, 0])
    deck(state, ['base.abandoned-cart'])
  })
  await create('2-combate', 1, (state) => {
    order(state, [1, 0])
    deck(state, ['base.goblin-ambush'])
    Object.assign(state.members[1].player.modifiers, {
      attack: 100,
      accuracy: 100,
      defense: 100,
    })
  })
  await create('2-combate-prefixo', 1, (state) => {
    order(state, [0, 1])
    deck(state, ['base.goblin-ambush'])
    state.rngState = [0, 0, 0, 10]
    state.members[0].player.health = 1
    Object.assign(state.members[0].player.modifiers, {
      defense: 0,
      evasion: 0,
      celerity: 0,
    })
    Object.assign(state.members[1].player.modifiers, {
      attack: 100,
      accuracy: 100,
      defense: 100,
    })
  })
  for (const label of [
    '3-virada',
    '4-acao',
    '4-sessao-retoma-acao',
    '5-replay',
  ]) {
    const id = await create(label, 3, (state) => order(state, [3, 0, 1, 2]))
    await session(id)
  }
  for (const label of ['4-abertura-corte', '4-abertura-resposta-perdida'])
    await create(label, 3, (state) => order(state, [1, 2, 3, 0]))

  const historical = await create('5-recibo-legado', 1, (state) =>
    order(state, [0, 1])
  )
  await session(historical)
  const historicalKey = randomUUID()
  await action(historical, endTurn, historicalKey)
  await db.query(
    "UPDATE party_action_receipts SET response = response - 'revision' - 'domainEvents' WHERE party_id = $1 AND route = 'action' AND key = $2",
    [historical, historicalKey]
  )
  console.log(
    JSON.stringify({
      label: '5-chave-do-recibo-legado',
      save: historical,
      key: historicalKey,
      body: endTurn,
    })
  )

  await create('6-sucessora-com-movimento', 3, (state) => {
    order(state, [1, 2, 3, 0])
    canComplete(state, 1, true)
  })
  const last = await create('6-ultima-preparo', 3, (state) => {
    order(state, [0, 1, 2, 3])
    canComplete(state, 0)
  })
  await session(last)
  const { body: successor } = await action(last, completeDimension)
  assert.equal(successor.dimension.dimensionCardId, 't91-next.aurora')
  await call('POST', '/parties/' + last + '/session/end', 200)
  const {
    rows: [{ state }],
  } = await db.query('SELECT state FROM parties WHERE id = $1', [last])
  order(state, [1, 2, 3, 0])
  canComplete(state, 1)
  await db.query('UPDATE parties SET state = $2 WHERE id = $1', [last, state])
  console.log(
    JSON.stringify({
      label: '6-ultima',
      save: last,
      human: state.hostMemberId,
      openingMember: state.turn.memberId,
      order: state.turnOrder,
    })
  )

  await create('medicao-cinco-ajudantes', 5, (state) =>
    order(state, [1, 2, 3, 4, 5, 0])
  )
}

function report(operation, response) {
  const { body, bytes, elapsedMs } = response
  const turns = body.domainEvents.filter(({ type }) => type === 'turnStarted')
  assert.equal(turns.length, 5)
  assert.equal(new Set(turns.map(({ memberId }) => memberId)).size, 5)
  assert.equal(body.turn.memberId, body.members.find(({ isHost }) => isHost).id)
  console.log(
    JSON.stringify({
      operation,
      save: body.id,
      revision: body.revision,
      elapsedMs,
      bytes,
      domainEvents: body.domainEvents.length,
      domainEventBytes: Buffer.byteLength(JSON.stringify(body.domainEvents)),
      combatUpdates: body.combatUpdates?.length,
    })
  )
}

async function main() {
  const { body: health } = await call('GET', '/health', 200)
  assert.equal(health.contractVersion, '1.13')
  const [mode, save] = process.argv.slice(2)
  if (mode === 'measure') {
    assert.ok(save, 'Informe o save medicao-cinco-ajudantes ainda em idle.')
    report('session', await session(save))
    const result = await action(save, endTurn)
    report('endTurn', result)
    const { body: current } = await call('GET', '/parties/' + save, 200)
    assert.equal(current.revision, result.body.revision)
    assert.deepEqual(current.turn, result.body.turn)
    return
  }
  assert.equal(
    mode,
    undefined,
    'Use prepare-t108.cjs ou prepare-t108.cjs measure UUID.'
  )
  const database = new URL(process.env.DATABASE_URL)
  assert.equal(database.hostname, 'localhost')
  assert.equal(database.pathname, '/misadventures_t91')
  const db = new Client({
    connectionString: database.href,
    statement_timeout: 15_000,
  })
  await db.connect()
  try {
    await prepare(db)
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
