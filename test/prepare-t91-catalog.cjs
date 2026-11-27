/* global require, process, console, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
const { cp, mkdir, mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { loadContent } = require('../dist/infra/content/load-content')

const firstCity = 'Vila do Porto'
const nextCity = 'Porto da Aurora'
const nextName = 'Costa da Aurora'
const shard = 'base.t91-shard'

function completion(zoneTitle) {
  return {
    zoneTitle,
    requirement: [{ cardId: shard, count: 1 }],
    grandPrize: { cards: [], gold: 10 },
    finalBoss: null,
  }
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-t91-content-'))
  await cp(join(__dirname, '..', 'content'), root, { recursive: true })
  const read = async (file) =>
    JSON.parse(await readFile(join(root, file), 'utf8'))
  const write = (file, data) =>
    writeFile(join(root, file), JSON.stringify(data, null, 2) + '\n')

  const dimensions = await read('base/dimension.json')
  const first = dimensions.find(
    (dimension) => dimension.id === 'base.old-coast'
  )
  if (!first) throw new Error('Dimensão base ausente.')
  first.completion = completion(firstCity)
  await write('base/dimension.json', dimensions)

  const items = await read('base/item.json')
  items.push({
    id: shard,
    name: 'Fragmento da T-91',
    flavorText: null,
    rarity: 'common',
    itemCategory: 'consumable',
    completionItem: true,
    tags: [],
    effects: [],
    toolKind: null,
    scavengeZoneTypes: [],
    scavengeTool: null,
  })
  await write('base/item.json', items)

  await mkdir(join(root, 't91-next'))
  await write('t91-next/collection.json', { name: 'Sucessora da T-91' })
  await write('t91-next/dimension.json', [
    {
      id: 't91-next.aurora',
      name: nextName,
      flavorText: null,
      releaseOrder: first.releaseOrder + 1,
      arrivalZoneTitle: nextCity,
      completion: completion(nextCity),
      effects: [],
      rewardDecks: [],
    },
  ])
  await write('t91-next/zone.json', [
    {
      id: 't91-next.harbor',
      title: nextCity,
      zoneType: 'urban',
      location: nextName,
      connectionArrows: 4,
      arrowLayout: null,
      zoneActions: ['startEvent', 'useVault', 'saveRespawnPoint'],
      effects: [],
    },
  ])

  const validation = await loadContent(root)
  if (!validation.ok) throw new Error(JSON.stringify(validation.problems))
  console.log(root)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
