// Dados locais da T-67. Use uma instância de desenvolvimento com banco de teste.
const { cp, mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { config } = require('dotenv')
const { Client } = require('pg')
const { createHash } = require('node:crypto')

const wolves = 'fixture.howling-wolves'
const ambush = 'fixture.fire-ambush'
const blade = 'fixture.blade-of-dusk'
const ability = {
  id: 'fixture.fire',
  name: 'Fogo',
  text: 'Habilidade de teste.',
  form: 'targeted',
  element: 'fire',
  cost: [],
  power: 0,
  effects: [],
  cooldown: 0,
  timing: 'combat',
  classRestriction: [],
  usesPerTurn: 1,
  target: 'opponent',
  duration: null,
  channel: null,
}

async function prepareContent() {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-feat-13-'))
  await cp('test/fixtures/content', root, { recursive: true })
  const combatPath = join(root, 'fixture', 'combatEvent.json')
  const [card] = JSON.parse(await readFile(combatPath, 'utf8'))
  const [enemy] = card.enemies
  const modifiers = { ...enemy.modifiers, attack: 0, defense: 0, evasion: 0 }
  const empty = { text: 'Fim do combate.', steps: [] }
  await writeFile(
    combatPath,
    JSON.stringify([
      {
        ...card,
        enemies: [
          { ...enemy, count: 1, health: 1, modifiers },
          {
            ...enemy,
            count: 1,
            health: 1,
            modifiers: { ...modifiers, reflection: 1 },
          },
        ],
        goodOutcome: {
          text: 'Compre uma recompensa.',
          steps: [{ type: 'drawRewards', count: 1 }],
        },
        badOutcome: empty,
      },
      {
        ...card,
        id: ambush,
        title: 'Emboscada de Fogo',
        enemies: [
          {
            ...enemy,
            count: 1,
            health: 30,
            abilities: [ability],
            modifiers: { ...enemy.modifiers, attack: 2, celerity: 12 },
            combatRules: { abilityPriority: ['highestPower'] },
          },
        ],
        goodOutcome: empty,
        badOutcome: empty,
      },
    ])
  )
  const equipmentPath = join(root, 'fixture', 'equipment.json')
  const equipment = JSON.parse(await readFile(equipmentPath, 'utf8'))
  const weapon = equipment.find(({ id }) => id === blade)
  weapon.modifiers = []
  weapon.abilities = [
    {
      ...ability,
      id: 'fixture.fire-reaction',
      name: 'Reação ao Fogo',
      form: 'passive',
      element: null,
      power: null,
      target: 'self',
      effects: [
        {
          text: 'Pague 1 ouro para recuperar 1 PV.',
          trigger: { kind: 'onElementDamageTaken', element: 'fire' },
          cost: [{ kind: 'payGold', amount: 1 }],
          activation: [{ kind: 'heal', amount: 1 }],
          duration: { kind: 'immediate' },
          mark: null,
        },
      ],
    },
  ]
  await writeFile(equipmentPath, JSON.stringify(equipment))
  console.log(root)
}

async function prepareCampaigns(mode) {
  config({ path: ['.env.test', '.env'], quiet: true })
  const url = process.env.FEAT13_API_URL ?? 'http://localhost:3333'
  if (!process.env.DATABASE_URL)
    throw new Error('Informe a DATABASE_URL de teste.')
  async function api(path, body) {
    const response = await fetch(
      new URL(path, url),
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
    )
    if (!response.ok)
      throw new Error(`${path}: ${response.status} ${await response.text()}`)
    return response.json()
  }
  await api('/health')
  const wolfCard = await api(`/catalog/cards/${wolves}`)
  if (!JSON.stringify(wolfCard).includes('Compre uma recompensa.'))
    throw new Error('A API ainda não está usando o catálogo da T-67.')
  if (mode !== 'stale') await api(`/catalog/cards/${ambush}`)
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    const scenarios = [
      { name: 'T-67 — Efeito disparado', cardId: ambush },
      { name: 'T-67 — Reflexão fatal', cardId: wolves },
    ]
    for (const scenario of mode === 'stale' ? [scenarios[1]] : scenarios) {
      const pause = scenario.cardId === ambush
      const { id } = await api('/parties', {
        name: scenario.name,
        characterName: 'Lia',
        playerClass: 'warrior',
      })
      await api(`/parties/${id}/session`, {})
      const {
        rows: [{ state }],
      } = await db.query('select state from parties where id = $1', [id])
      const player = state.members[0].player
      state.rngState = [0, 0, 0, 10]
      state.eventDecks = [
        { zoneType: 'urban', cards: [scenario.cardId], discard: [] },
      ]
      if (pause) {
        Object.assign(player, { peak: 0, health: 20, gold: 10, vigor: 0 })
        player.equipment.weapon = blade
        Object.assign(player.modifiers, { defense: 0, evasion: 0, celerity: 8 })
      } else {
        state.config.inventoryCapacity = 1
        state.rewardDecks = [{ zoneType: 'urban', cards: ['fixture.iron-ore'] }]
        player.health = 1
        player.inventory = [{ cardId: 'fixture.silver-fish', quantity: 1 }]
        Object.assign(player.modifiers, { accuracy: 100, defense: 100 })
      }
      await db.query('update parties set state = $1 where id = $2', [state, id])
      console.log(`${scenario.name}  ${url}/parties/${id}`)
      if (mode === 'stale') {
        const started = await api(`/parties/${id}/actions`, {
          type: 'startEvent',
        })
        const { combat } = await api(`/parties/${id}/actions`, {
          type: 'revealEvent',
          encounterId: started.randomEventEncounter.id,
        })
        const attack = {
          type: 'combatAttack',
          combatId: combat.id,
          turnId: combat.turn.id,
          targetId: combat.enemies[0].id,
        }
        const current = await api(`/parties/${id}/actions`, attack)
        if (
          current.combat?.enemies[0].health !== 0 ||
          current.combat.turn.id === attack.turnId ||
          current.combat.attackTargetIds.length !== 1
        ) {
          throw new Error('O save não chegou ao turno esperado.')
        }
        console.log(
          JSON.stringify({
            attack,
            currentTurnId: current.combat.turn.id,
            targetIds: current.combat.attackTargetIds,
          })
        )
      }
    }
  } finally {
    await db.end()
  }
}

async function readSnapshot(id) {
  if (!id) throw new Error('Informe o ID da campanha.')
  config({ path: ['.env.test', '.env'], quiet: true })
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    const {
      rows: [entry],
    } = await db.query(
      'select to_jsonb(p)::text as snapshot, state->\'rngState\' as rng, saved_at as "savedAt" from parties p where id = $1',
      [id]
    )
    if (!entry) throw new Error('Campanha não encontrada.')
    const { snapshot, ...fields } = entry
    console.log(
      JSON.stringify({
        ...fields,
        sha256: createHash('sha256').update(snapshot).digest('hex'),
      })
    )
  } finally {
    await db.end()
  }
}

async function main() {
  switch (process.argv[2]) {
    case 'content':
      return prepareContent()
    case 'campaigns':
      return prepareCampaigns()
    case 'stale':
      return prepareCampaigns('stale')
    case 'snapshot':
      return readSnapshot(process.argv[3])
    default:
      throw new Error('Use content, campaigns, stale ou snapshot <id>.')
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
