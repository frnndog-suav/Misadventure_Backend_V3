/* global require, process, console, fetch, AbortSignal, structuredClone */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { URL } = require('node:url')
const { Client } = require('pg')

const base = 'http://127.0.0.1:3391'

async function request(method, route, expected, body) {
  const response = await fetch(base + route, {
    method,
    headers: body
      ? { 'Content-Type': 'application/json', 'X-T91-Seed': '42' }
      : {},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const result = await response.json()
  assert.equal(response.status, expected, JSON.stringify(result))
  return result
}

async function main() {
  const database = new URL(process.env.DATABASE_URL)
  assert.equal(database.hostname, 'localhost')
  assert.equal(database.pathname, '/misadventures_t91')
  const db = new Client({
    connectionString: database.href,
    statement_timeout: 15000,
  })
  const readState = async (id) => {
    const {
      rows: [{ state }],
    } = await db.query('SELECT state FROM parties WHERE id = $1', [id])
    return state
  }
  await db.connect()
  try {
    for (const purpose of ['controle', 'entrega']) {
      const created = await request('POST', '/parties', 201, {
        name: 'T-91 legado ' + purpose,
        characterName: 'Lia',
        playerClass: 'warrior',
        aiHelperCount: 0,
      })
      assert.equal(created.members.length, 1)
      const initial = await readState(created.id)
      const legacy = structuredClone(initial)
      legacy.schemaVersion = 11
      legacy.members[0].player.gold = 37
      const { rowCount } = await db.query(
        'UPDATE parties SET state = $2 WHERE id = $1',
        [created.id, legacy]
      )
      assert.equal(rowCount, 1)
      const route = '/parties/' + created.id
      const stored = await request('GET', route, 200)
      if (purpose === 'controle') {
        const active = await request('POST', route + '/session', 200)
        assert.equal(active.turn.memberId, initial.hostMemberId)
        assert.deepEqual(
          active.members,
          (await request('GET', route, 200)).members
        )
      }
      assert.equal(stored.members.length, 1)
      const [member] = stored.members
      assert.equal(member.id, initial.hostMemberId)
      assert.equal(member.kind, 'human')
      assert.equal(member.characterName, 'Lia')
      assert.equal(member.player.gold, 37)
      const after = await readState(created.id)
      assert.deepEqual(after.rngState, initial.rngState)
      assert.equal(after.members[0].player.gold, 37)
      console.log(
        JSON.stringify({
          purpose,
          save: created.id,
          seed: 42,
          human: member.id,
          gold: member.player.gold,
          schemaVersionStored: after.schemaVersion,
          turn: stored.turn,
        })
      )
    }
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
