/* global require, process, console, fetch, AbortSignal */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { mkdtemp, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { URL } = require('node:url')
const { Client } = require('pg')

const base = 'http://127.0.0.1:3391'
const action = { type: 'endTurn' }
const seed = '3'
const uuid = /\b[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\b/gi

function comparable(data, party) {
  const ids = new Map([[party.id, 'save']])
  party.members.forEach(({ id }, index) => ids.set(id, 'member-' + index))
  return JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (key === 'createdAt' || key === 'savedAt') return undefined
      if (typeof value !== 'string') return value
      return value.replace(uuid, (id) => {
        if (!ids.has(id)) ids.set(id, 'generated-' + ids.size)
        return ids.get(id)
      })
    })
  )
}

async function main() {
  const database = new URL(process.env.DATABASE_URL)
  assert.equal(database.hostname, 'localhost')
  assert.equal(database.pathname, '/misadventures_t91')
  const db = new Client({
    connectionString: database.href,
    statement_timeout: 15000,
  })
  const dir = await mkdtemp(join(tmpdir(), 'misadventures-t91-replay-'))
  console.log('Evidências em', dir)
  const evidence = (label, data) =>
    writeFile(join(dir, label + '.json'), JSON.stringify(data, null, 2))

  async function request(label, method, route, expected, body, headers = {}) {
    if (body) headers['Content-Type'] = 'application/json'
    const response = await fetch(base + route, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const result = await response.json()
    await evidence(label, {
      method,
      route,
      body,
      headers,
      status: response.status,
      response: result,
    })
    assert.equal(
      response.status,
      expected,
      label + ': ' + JSON.stringify(result)
    )
    return result
  }

  async function prepare(label) {
    const party = await request(
      label + '-create',
      'POST',
      '/parties',
      201,
      {
        name: 'T-91 replay',
        characterName: 'Lia',
        playerClass: 'warrior',
        aiHelperCount: 3,
      },
      { 'X-T91-Seed': seed }
    )
    const route = '/parties/' + party.id
    const session = await request(
      label + '-session',
      'POST',
      route + '/session',
      200
    )
    assert.equal(session.turn.memberId, party.members[0].id)
    const key = randomUUID()
    return { party, route, key, label }
  }

  async function snapshot(run, label) {
    const {
      rows: [row],
    } = await db.query('SELECT * FROM parties WHERE id = $1', [run.party.id])
    const { rows: receipts } = await db.query(
      'SELECT * FROM party_action_receipts WHERE party_id = $1 ORDER BY key',
      [run.party.id]
    )
    await evidence(run.label + '-' + label, { row, receipts })
    return { row, receipts }
  }

  function send(
    run,
    label,
    status,
    { key = run.key, body = action, cut } = {}
  ) {
    const headers = { 'Idempotency-Key': key }
    if (cut !== undefined) headers['X-T91-Cut-After-Ai-Turns'] = String(cut)
    return request(
      run.label + '-' + label,
      'POST',
      run.route + '/actions',
      status,
      body,
      headers
    )
  }

  await db.connect()
  try {
    const control = await prepare('continuo')
    const response = await send(control, 'acao', 200)
    assert.ok(response.combatUpdates.length > 0)
    const completed = await snapshot(control, 'concluido')
    console.log(
      'Controle',
      control.party.id,
      'combate',
      response.combatUpdates.length
    )

    for (const [cut, resumeBySession] of [
      [0, false],
      [1, true],
    ]) {
      const run = await prepare('corte-' + cut)
      await send(run, 'corte', 500, { cut })
      const checkpoint = await snapshot(run, 'checkpoint')
      assert.equal(checkpoint.receipts.length, 1)
      assert.equal(checkpoint.receipts[0].response, null)
      assert.deepEqual(checkpoint.receipts[0].action, action)
      assert.equal(
        checkpoint.row.state.turn.memberId,
        run.party.turnOrder[2 + cut]
      )

      const pending = await send(run, 'chave-nova', 409, { key: randomUUID() })
      assert.equal(pending.error.code, 'ACTION_ADVANCE_PENDING')
      const conflict = await send(run, 'corpo-diferente', 409, {
        body: { type: 'recover', option: 'shuffleHand' },
      })
      assert.equal(conflict.error.code, 'ACTION_IDEMPOTENCY_CONFLICT')
      assert.deepEqual(await snapshot(run, 'apos-recusa'), checkpoint)

      if (resumeBySession)
        await request(
          run.label + '-retomada',
          'POST',
          run.route + '/session',
          200
        )
      const original = await send(run, 'retomada-ou-replay', 200)
      const resumed = await snapshot(run, 'concluido')
      assert.deepEqual(resumed.receipts[0].response, original)
      assert.deepEqual(
        comparable(resumed.row.state, run.party),
        comparable(completed.row.state, control.party)
      )
      assert.deepEqual(
        comparable(original.combatUpdates, run.party),
        comparable(response.combatUpdates, control.party)
      )

      await send(run, 'acao-posterior', 200, { key: randomUUID() })
      const beforeReplay = await snapshot(run, 'antes-replay')
      const beforeGet = await request(
        run.label + '-get-antes',
        'GET',
        run.route,
        200
      )
      assert.equal(Object.hasOwn(beforeGet, 'combatUpdates'), false)
      const replays = await Promise.all([
        send(run, 'replay-1', 200),
        send(run, 'replay-2', 200),
      ])
      replays.forEach((replay) => assert.deepEqual(replay, original))
      assert.deepEqual(await snapshot(run, 'depois-replay'), beforeReplay)
      assert.deepEqual(
        await request(run.label + '-get-depois', 'GET', run.route, 200),
        beforeGet
      )
      console.log(
        'Corte',
        cut,
        'controle equivalente e replay confirmado',
        run.party.id,
        run.key
      )
    }

    for (const label of [
      'entrega-continuo',
      'entrega-corte-0',
      'entrega-corte-1',
    ]) {
      const run = await prepare(label)
      console.log('Entrega', label, run.party.id, run.key)
    }
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
