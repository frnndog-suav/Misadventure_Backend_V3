/* global require, process, console, fetch, AbortSignal */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { mkdtemp, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { URL } = require('node:url')
const { Client } = require('pg')
const { SeededRng } = require('../dist/core/rng/seeded-rng')

const base = 'http://127.0.0.1:3391'
const firstDimension = 'base.old-coast'
const nextDimension = 't91-next.aurora'
const nextCity = 't91-next.harbor'
const completion = { type: 'completeDimension' }

async function main() {
  const database = new URL(process.env.DATABASE_URL)
  assert.equal(database.hostname, 'localhost')
  assert.equal(database.pathname, '/misadventures_t91')
  const db = new Client({
    connectionString: database.href,
    statement_timeout: 15000,
  })
  const dir = await mkdtemp(join(tmpdir(), 'misadventures-t91-dimensions-'))
  console.log('Evidências em', dir)

  async function request(label, method, route, expected, body, headers = {}) {
    if (body) headers['Content-Type'] = 'application/json'
    const response = await fetch(base + route, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const result = await response.json()
    await writeFile(
      join(dir, label + '.json'),
      JSON.stringify(
        {
          method,
          route,
          headers,
          body,
          status: response.status,
          response: result,
        },
        null,
        2
      )
    )
    assert.ok(
      [expected].flat().includes(response.status),
      label + ': HTTP ' + response.status + ' ' + JSON.stringify(result)
    )
    return { status: response.status, result }
  }

  const get = (label, party) =>
    request(label, 'GET', '/parties/' + party.id, 200)
  const start = (label, party, status = 200) =>
    request(label, 'POST', '/parties/' + party.id + '/session', status)

  async function prepare(label, transitionSeed) {
    const { result: party } = await request(
      label + '-create',
      'POST',
      '/parties',
      201,
      {
        name: 'T-91 ' + label,
        characterName: 'Lia',
        playerClass: 'warrior',
        aiHelperCount: 3,
      },
      { 'X-T91-Seed': '3' }
    )
    assert.equal(party.dimension.dimensionCardId, firstDimension)
    await start(label + '-session', party)
    await grant(label + '-first-shard', party)
    const { rowCount } = await db.query(
      "UPDATE parties SET state = jsonb_set(state, '{rngState}', $2::jsonb) WHERE id = $1",
      [party.id, JSON.stringify(SeededRng.fromSeed(transitionSeed).state())]
    )
    assert.equal(rowCount, 1)
    const { result } = await get(label + '-ready', party)
    assert.ok(
      result.members[0].player.availableActions.includes('completeDimension')
    )
    return result
  }

  async function grant(label, party) {
    await request(
      label,
      'POST',
      '/lab/parties/' +
        party.id +
        '/members/' +
        party.members[0].id +
        '/grants',
      200,
      { type: 'card', cardId: 'base.t91-shard', quantity: 1 }
    )
  }

  function complete(label, party, expected, cut = false, key = randomUUID()) {
    const headers = { 'Idempotency-Key': key }
    if (cut) headers['X-T91-Cut-After-Ai-Turns'] = '0'
    return request(
      label,
      'POST',
      '/parties/' + party.id + '/actions',
      expected,
      completion,
      headers
    )
  }

  function checkProgress(before, after) {
    for (const [index, member] of after.members.entries()) {
      const previous = before.members[index]
      assert.equal(member.id, previous.id)
      assert.deepEqual(
        member.player.playerClasses,
        previous.player.playerClasses
      )
      assert.equal(member.player.peak, previous.player.peak + 25)
      assert.equal(member.player.gold, previous.player.gold + 10)
    }
  }

  await db.connect()
  try {
    let transitionSeed
    for (let seed = 0; seed < 16; seed++) {
      const label = 'sucessora-controle-' + seed
      const before = await prepare(label, seed)
      const { status } = await complete(
        label + '-complete',
        before,
        [200, 500],
        true
      )
      const { result: checkpoint } = await get(label + '-checkpoint', before)
      assert.equal(checkpoint.dimension.dimensionCardId, nextDimension)
      assert.equal(checkpoint.dimension.startingCityZoneId, nextCity)
      if (status === 200) continue
      assert.equal(checkpoint.turn.memberId, checkpoint.turnOrder[0])
      assert.notEqual(checkpoint.turn.memberId, before.members[0].id)
      assert.equal(checkpoint.turn.round, 1)
      checkProgress(before, checkpoint)
      for (const { player } of checkpoint.members) {
        assert.equal(player.zoneId, nextCity)
        assert.equal(player.respawnZoneId, nextCity)
      }
      const { result: resumed } = await start(label + '-resumed', before)
      assert.equal(resumed.turn.memberId, before.members[0].id)
      assert.deepEqual(resumed.turnOrder, checkpoint.turnOrder)
      assert.deepEqual(resumed, (await get(label + '-stored', before)).result)
      console.log(
        'Sucessora controle',
        before.id,
        'semente de transição',
        seed,
        JSON.stringify({
          antes: before.turn,
          checkpoint: checkpoint.turn,
          ordem: checkpoint.turnOrder,
          depois: resumed.turn,
        })
      )
      transitionSeed = seed
      break
    }
    assert.notEqual(
      transitionSeed,
      undefined,
      'Sem semente com IA em primeiro na sucessora.'
    )

    const successor = await prepare('sucessora-entrega', transitionSeed)
    console.log(
      'Sucessora entrega',
      successor.id,
      'semente de transição',
      transitionSeed
    )

    async function prepareLast(label) {
      const party = await prepare(label, transitionSeed)
      await complete(label + '-enter-last', party, 200)
      await grant(label + '-last-shard', party)
      const { result } = await get(label + '-last-ready', party)
      assert.equal(result.dimension.dimensionCardId, nextDimension)
      assert.equal(result.turn.memberId, party.members[0].id)
      assert.ok(
        result.members[0].player.availableActions.includes('completeDimension')
      )
      return result
    }

    const last = await prepareLast('ultima-controle')
    const key = randomUUID()
    const { result: frozen } = await complete(
      'ultima-complete',
      last,
      200,
      true,
      key
    )
    assert.equal(frozen.status, 'frozen')
    assert.deepEqual(frozen.combatUpdates, [])
    checkProgress(last, frozen)
    assert.equal(
      (await start('ultima-reopen', last, 409)).result.error.code,
      'PARTY_FROZEN'
    )
    assert.deepEqual(
      (await complete('ultima-replay', last, 200, false, key)).result,
      frozen
    )
    console.log(
      'Última dimensão controle',
      last.id,
      'frozen e 409 PARTY_FROZEN'
    )
    const preparedLast = await prepareLast('ultima-entrega')
    console.log('Última dimensão entrega', preparedLast.id)
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
