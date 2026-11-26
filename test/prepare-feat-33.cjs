// Campanhas descartáveis da T-99. Execute com um banco local de desenvolvimento.
/* global require, process, __dirname, console, fetch, URL */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { cp, mkdir, mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { config } = require('dotenv')
const { Client } = require('pg')

const releases = ['fixture', 'reprint', 'archive', 'current', 'next']
const scenarios = [
  'boosters',
  'atomic',
  'single',
  'prepare',
  'useVault',
  'legacy',
  'transition',
  'persistence',
]
const dimensionId = (id) =>
  id === 'fixture' ? 'fixture.test-dimension' : id + '.dimension'
const zoneId = (id) => (id === 'fixture' ? 'fixture.gray-harbor' : id + '.city')
const stack = (cardId) => ({ cardId, quantity: 1 })

async function prepareContent() {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-feat-33-'))
  await cp(join(__dirname, 'fixtures', 'content'), root, { recursive: true })
  const read = async (type) =>
    JSON.parse(await readFile(join(root, 'fixture', type + '.json'), 'utf8'))
  const write = (id, type, value) =>
    writeFile(
      join(root, id, type + '.json'),
      JSON.stringify(value, null, 2) + '\n'
    )
  const [fixture] = await read('dimension')
  const items = await read('item')
  const [attribute] = await read('attribute')
  const potion = items.find(({ id }) => id === 'fixture.healing-potion')
  const booster = items.find(({ id }) => id === 'fixture.booster')
  const completionItem = (id) => ({
    ...potion,
    id: id + '.pass',
    name: 'Passe',
    effects: [],
    stockPrice: null,
    completionItem: true,
  })
  const completion = (id, zoneTitle) => ({
    zoneTitle,
    requirement: [{ cardId: id + '.pass', count: 1 }],
    grandPrize: { cards: [], gold: 0 },
    finalBoss: null,
  })
  await write('fixture', 'item', [...items, completionItem('fixture')])
  await write('fixture', 'dimension', [
    { ...fixture, completion: completion('fixture', 'Porto Cinzento') },
  ])
  for (const [index, id] of releases.entries()) {
    if (index === 0) continue
    await mkdir(join(root, id))
    const title = 'Porto ' + id
    await write(id, 'collection', { name: 'T-99 ' + id })
    await write(id, 'zone', [
      {
        id: zoneId(id),
        title,
        location: 'Costa ' + id,
        zoneType: 'urban',
        connectionArrows: 4,
        arrowLayout: null,
        effects: [],
        zoneActions: [
          'startEvent',
          'useVault',
          'visitMarket',
          'saveRespawnPoint',
        ],
        market: { stock: ['fixture.arrows'], singles: true, mounts: [] },
      },
    ])
    await write(id, 'attribute', [
      {
        ...attribute,
        id: id + '.single',
        rarity: 'common',
        attributeKind: 'basic',
      },
    ])
    await write(id, 'item', [
      { ...booster, id: id + '.booster', boosterCollectionId: id },
      {
        ...items.find(({ id }) => id === 'fixture.ember-shard'),
        id: id + '.rare',
      },
      completionItem(id),
    ])
    await write(id, 'dimension', [
      {
        id: dimensionId(id),
        name: 'Dimensão ' + id,
        flavorText: null,
        releaseOrder: index + 1,
        arrivalZoneTitle: title,
        effects: [],
        rewardDecks: [],
        completion: completion(id, title),
        extendedCollectionIds: id === 'current' ? ['fixture'] : [],
        reprintCollectionIds:
          id === 'current' ? ['reprint'] : id === 'next' ? ['archive'] : [],
      },
    ])
  }
  console.log(root)
}

async function campaigns(mode) {
  config({ path: '.env', quiet: true })
  const base = process.env.FEAT33_API_URL ?? 'http://localhost:3333'
  assert(
    process.env.DATABASE_URL,
    'Defina DATABASE_URL com o banco local da API.'
  )
  async function api(path, body, status = 200, method = 'POST') {
    const response = await fetch(
      new URL(path, base),
      body === undefined
        ? undefined
        : {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
    )
    const result = await response.json()
    assert.equal(response.status, status, path + ' ' + JSON.stringify(result))
    return result
  }
  await api('/health')
  const card = (id) => api('/catalog/cards/' + id)
  const current = await card(dimensionId('current'))
  assert.deepEqual(current.extendedCollectionIds, ['fixture'])
  assert.deepEqual(current.reprintCollectionIds, ['reprint'])
  if (mode === 'verify') {
    const legacy = await card(dimensionId('fixture'))
    const editor = await api('/lab/content/cards/' + current.id)
    const legacyEditor = await api('/lab/content/cards/' + legacy.id)
    assert.deepEqual(legacy.extendedCollectionIds, [])
    assert.deepEqual(legacy.reprintCollectionIds, [])
    assert.deepEqual(legacyEditor.card.extendedCollectionIds, [])
    assert.deepEqual(legacyEditor.card.reprintCollectionIds, [])
    assert.deepEqual(editor.card.extendedCollectionIds, ['fixture'])
    assert.deepEqual(editor.card.reprintCollectionIds, ['reprint'])
    const exported = await api('/lab/content/collections/current/export')
    const index = exported.cards.findIndex(
      ({ card }) => card.type === 'dimension'
    )
    assert(index >= 0)
    const scenarios = [
      [['missing'], [], 'extendedCollectionIds.0'],
      [['next'], [], 'extendedCollectionIds.0'],
      [['current'], [], 'extendedCollectionIds.0'],
      [['fixture', 'fixture'], [], 'extendedCollectionIds.1'],
      [['fixture'], ['fixture'], 'reprintCollectionIds.0'],
    ]
    const errors = []
    for (const [
      extendedCollectionIds,
      reprintCollectionIds,
      field,
    ] of scenarios) {
      const body = structuredClone(exported)
      const dimension = body.cards[index].card
      Object.assign(dimension, { extendedCollectionIds, reprintCollectionIds })
      const result = await api('/lab/content/import?replace=true', body, 400)
      assert.equal(result.error.code, 'CONTENT_INVALID')
      assert(
        result.error.details.fields.some(
          ({ path }) => path === 'cards.' + index + '.card.' + field
        )
      )
      errors.push({
        extendedCollectionIds,
        reprintCollectionIds,
        field,
        result,
      })
    }
    console.log(
      JSON.stringify({
        api: base,
        scenario: 'editor',
        legacy,
        current,
        editor,
        legacyEditor,
        errors,
      })
    )
  }
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  const read = async (id) => {
    const {
      rows: [row],
    } = await db.query('select state from parties where id = $1', [id])
    assert(row, 'O preparador e a API precisam usar o mesmo banco.')
    return row.state
  }
  const save = (id, state) =>
    db.query('update parties set state = $1 where id = $2', [state, id])
  const advance = async (id, from, to) => {
    const state = await read(id)
    assert.equal(state.dimension.dimensionCardId, dimensionId(from))
    state.members[0].player.zoneId = zoneId(from)
    state.members[0].player.completionItems = [stack(from + '.pass')]
    state.turn.actionPoints = 3
    await save(id, state)
    const result = await api('/parties/' + id + '/actions', {
      type: 'completeDimension',
    })
    assert.equal(result.dimension.dimensionCardId, dimensionId(to))
    return result
  }
  const internal = ({ marketPool, markets, rngState }) => ({
    pool: marketPool,
    stocks: markets.map(({ zoneId, stock }) => ({ zoneId, stock })),
    rng: rngState,
  })
  try {
    for (const scenario of scenarios) {
      const { id } = await api(
        '/parties',
        {
          name: 'T99 ' + mode + ' ' + scenario,
          characterName: 'Lia',
          playerClass: 'rogue',
        },
        201
      )
      const path = '/parties/' + id
      await api(path + '/session', {})
      for (let i = 0; i < 3; i++)
        await advance(id, releases[i], releases[i + 1])
      const state = await read(id)
      assert.deepEqual(state.dimension.commercialCollectionIds, [
        'current',
        'fixture',
        'reprint',
      ])
      const generated = internal(state)
      const [{ id: memberId, player }] = state.members
      if (scenario === 'legacy' || scenario === 'transition')
        player.completionItems = [stack('current.pass')]
      player.gold = 150
      player.inventory =
        scenario === 'prepare' ? [stack('reprint.booster')] : []
      player.vault = {
        slots: scenario === 'useVault' ? [stack('archive.booster')] : [],
        decks: [],
        gold: 0,
      }
      player.tcgFolder = []
      state.turn.actionPoints = 3
      state.rngState = [0, 0, 0, 10]
      const singles = ['reprint.single', 'fixture.strength-basic']
      state.marketPool = singles.map((cardId) => ({ cardId, departed: 0 }))
      state.markets = [
        {
          zoneId: zoneId('current'),
          factorPercent: 100,
          singles: true,
          stock: singles.map((cardId) => ({ cardId, copies: 1 })),
          showcase: [singles[0], null, null, null],
        },
      ]
      if (scenario === 'legacy') delete state.dimension.commercialCollectionIds
      await save(id, state)
      const before = await api(path)
      const { market } = before.members[0].player
      const action = (body, status) => api(path + '/actions', body, status)
      const visit = (operations, status) =>
        action({ type: 'visitMarket', operations }, status)
      const buyBooster = (cardId) => ({
        operation: 'buyBooster',
        cardId,
        quantity: 1,
      })
      const buySingle = { operation: 'buySingle', slotIndex: 0 }
      const offer =
        scenario === 'legacy'
          ? ['current.booster']
          : ['current.booster', 'fixture.booster', 'reprint.booster']
      assert.deepEqual(
        market.boosters.map(({ cardId }) => cardId),
        offer
      )
      let observed = null
      if (mode === 'verify') {
        if (scenario === 'atomic') {
          const savedBefore = internal(await read(id))
          const result = await visit(
            [buySingle, buyBooster('archive.booster')],
            409
          )
          assert.equal(result.error.code, 'ACTION_NOT_ALLOWED')
          assert.equal(result.error.details.reason, 'notMarketBooster')
          assert.equal(result.error.details.operationIndex, 1)
          const savedAfter = internal(await read(id))
          assert.deepEqual(savedAfter, savedBefore)
          assert.deepEqual(await api(path), before)
          observed = { result, before: savedBefore, after: savedAfter }
        } else if (scenario === 'legacy' || scenario === 'transition') {
          const after = await advance(id, 'current', 'next')
          const saved = await read(id)
          assert.deepEqual(saved.dimension.commercialCollectionIds, [
            'next',
            'archive',
          ])
          assert.deepEqual(
            saved.dimension.map.zones.map(({ zoneId }) => zoneId),
            ['next.city']
          )
          assert(saved.marketPool.length > 0)
          assert(
            saved.marketPool.every(({ cardId }) =>
              /^(next|archive)\./.test(cardId)
            )
          )
          assert.deepEqual(
            after.members[0].player.market.boosters.map(({ cardId }) => cardId),
            ['archive.booster', 'next.booster']
          )
          observed = {
            dimension: after.dimension,
            market: after.members[0].player.market,
            ...internal(saved),
          }
        } else if (scenario === 'persistence') {
          const { id: currentId, collectionId, ...input } = current
          assert.equal(collectionId, 'current')
          const editorPath = '/lab/content/cards/' + currentId
          const original = { ...input, slug: 'dimension' }
          const edited = {
            ...original,
            extendedCollectionIds: [],
            reprintCollectionIds: ['archive'],
          }
          await api(editorPath, edited, 200, 'PUT')
          try {
            const saved = await read(id)
            saved.config.singlesDecayMax = 20
            saved.marketPool = [{ cardId: singles[0], departed: 0 }]
            saved.markets[0].stock = [{ cardId: singles[0], copies: 1 }]
            await save(id, saved)
            const reopened = await api(path)
            assert.deepEqual(
              reopened.members[0].player.market.boosters.map(
                ({ cardId }) => cardId
              ),
              offer
            )
            const after = await action({ type: 'endTurn' })
            const renewed = await read(id)
            assert(
              renewed.marketPool.some(
                ({ cardId }) => cardId === 'reprint.single'
              )
            )
            assert(
              renewed.marketPool.every(({ cardId }) =>
                /^(fixture|current|reprint)\./.test(cardId)
              )
            )
            observed = {
              market: after.members[0].player.market,
              ...internal(renewed),
            }
          } finally {
            await api(editorPath, original, 200, 'PUT')
          }
        } else {
          const result =
            scenario === 'boosters'
              ? await visit(offer.map(buyBooster))
              : scenario === 'single'
                ? await visit([buySingle, { ...buySingle, slotIndex: 0 }])
                : scenario === 'prepare'
                  ? await action({
                      type: 'prepare',
                      operation: 'openBooster',
                      cardId: 'reprint.booster',
                    })
                  : await action({
                      type: 'useVault',
                      operations: [
                        { operation: 'openBooster', cardId: 'archive.booster' },
                      ],
                    })
          const resultPlayer = result.members[0].player
          const opening = resultPlayer.lastBoosterOpening
          observed = {
            purchase: resultPlayer.lastMarketVisit,
            opening,
            ...internal(await read(id)),
            rarities: opening
              ? await Promise.all(
                  opening.cards.map(async ({ cardId }) => ({
                    cardId,
                    rarity: (await card(cardId)).rarity,
                  }))
                )
              : [],
          }
        }
      }
      console.log(
        JSON.stringify({
          api: base,
          scenario,
          partyId: id,
          memberId,
          url: new URL(path, base).href,
          dimensionId: dimensionId('current'),
          zoneId: zoneId('current'),
          publishedCollections: ['current', 'fixture', 'reprint'],
          initial: {
            actionPoints: 3,
            gold: 150,
            inventory: player.inventory,
          completionItems: player.completionItems,
            vault: player.vault,
            market,
            ...internal(state),
          },
          cards: await Promise.all(
            [...new Set([...offer, ...singles, 'archive.booster'])].map(
              async (id) => {
                const { id: cardId, collectionId, rarity } = await card(id)
                return { cardId, collectionId, rarity }
              }
            )
          ),
          generated,
          observed,
        })
      )
    }
  } finally {
    await db.end()
  }
}

async function main() {
  const [, , command] = process.argv
  if (command === 'content') return prepareContent()
  if (command === 'campaigns' || command === 'verify') return campaigns(command)
  throw new Error('Use content, campaigns ou verify.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
