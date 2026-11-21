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
const traveler = 'fixture.wounded-traveler'
const reserveEvent = 'fixture.t67-traveler-reserve'
const initiative = 'fixture.t67-initiative'
const haste = 'fixture.t67-haste'
const tiedCelerity = 10
const hasteDuration = { kind: 'forCombatCycles', cycles: 2 }
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
      {
        ...card,
        id: initiative,
        title: 'Lobos Uivantes — Celeridade',
        enemies: [{
          ...enemy,
          count: 2,
          modifiers: { ...modifiers, accuracy: 0, celerity: tiedCelerity },
        }],
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
    {
      ...ability,
      id: haste,
      name: 'Acelerar',
      text: 'Ganhe 5 de Celeridade por 2 ciclos.',
      form: 'continuous',
      element: null,
      power: null,
      target: 'self',
      duration: hasteDuration,
      effects: [{
        text: 'Ganhe 5 de Celeridade.',
        trigger: null,
        cost: [],
        activation: [{ kind: 'modifierFlat', changes: [{ modifier: 'celerity', amount: 5 }] }],
        duration: hasteDuration,
        mark: 'buff',
      }],
    },
  ]
  await writeFile(equipmentPath, JSON.stringify(equipment))
  const randomEventPath = join(root, 'fixture', 'randomEvent.json')
  const randomEvents = JSON.parse(await readFile(randomEventPath, 'utf8'))
  const travelerCard = randomEvents.find(({ id }) => id === traveler)
  randomEvents.push({ ...travelerCard, id: reserveEvent, title: 'Viajante na Reserva' })
  await writeFile(randomEventPath, JSON.stringify(randomEvents))

  const dimensionPath = join(root, 'fixture', 'dimension.json')
  const dimensions = JSON.parse(await readFile(dimensionPath, 'utf8'))
  const urban = dimensions[0].eventDecks.find(({ zoneType }) => zoneType === 'urban')
  urban.cards.find(({ cardId }) => cardId === wolves).copies = 2
  urban.cards.push({ cardId: reserveEvent, copies: 2 })
  await writeFile(dimensionPath, JSON.stringify(dimensions))
  console.log(root)
}

async function prepareLegacyCampaigns(api, db, url) {
  for (const pile of [[reserveEvent], []]) {
    const name = `T-67 v8 - ${pile.length ? 'deck misto' : 'pilha vazia'}`
    const { id } = await api('/parties', {
      name,
      characterName: 'Lia',
      playerClass: 'warrior',
    })
    await api(`/parties/${id}/session`, {})
    const { rows: [initial] } = await db.query('select state from parties where id = $1', [id])
    initial.state.rngState = [0, 0, 0, 10]
    initial.state.eventDecks = [{ zoneType: 'urban', cards: [traveler], discard: [] }]
    await db.query('update parties set state = $1 where id = $2', [initial.state, id])

    const actionPath = `/parties/${id}/actions`
    const started = await api(actionPath, { type: 'startEvent' })
    await api(actionPath, {
      type: 'revealEvent',
      encounterId: started.randomEventEncounter.id,
    })
    const { rows: [{ state }] } = await db.query('select state from parties where id = $1', [id])
    if (state.eventEncounter?.card?.id !== traveler)
      throw new Error(`A campanha ${id} não abriu o encontro esperado.`)
    state.schemaVersion = 8
    for (const { player } of state.members) {
      delete player.abilityUsage
      delete player.brokenEquipment
    }
    for (const key of ['combat', 'combatZone', 'lastCombatResult', 'combatOutcome',
      'pendingTriggeredEffects', 'triggeredEffectSequence', 'upgradedCombatDecks']) {
      delete state[key]
    }
    state.eventDecks = [{ zoneType: 'urban', cards: pile, discard: [reserveEvent] }]
    await db.query('update parties set state = $1 where id = $2', [state, id])
    const saveUrl = `/parties/${id}`
    await api(saveUrl)
    console.log(JSON.stringify({ name, id, url: new URL(saveUrl, url).href, encounter: traveler, pile, discard: [reserveEvent] }))
  }
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
  if (mode === 'legacy') await api(`/catalog/cards/${reserveEvent}`)
  if (mode === 'initiative') await api(`/catalog/cards/${initiative}`)
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    if (mode === 'legacy') return await prepareLegacyCampaigns(api, db, url)
    const scenarios = [
      { name: 'T-67 — Efeito disparado', cardId: ambush },
      { name: 'T-67 — Reflexão fatal', cardId: wolves },
    ]
    const selected = mode === 'initiative'
      ? [
          { name: 'T-67 — Empate de Celeridade', cardId: initiative },
          { name: 'T-67 — Mudança de Celeridade', cardId: initiative, equipHaste: true },
        ]
      : mode === 'stale' ? [scenarios[1]] : scenarios
    for (const scenario of selected) {
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
      if (scenario.cardId === initiative) {
        player.peak = 0
        Object.assign(player.modifiers, { celerity: tiedCelerity, evasion: 100 })
        for (const slot of Object.keys(player.equipment)) player.equipment[slot] = null
        if (scenario.equipHaste) player.equipment.weapon = blade
      } else if (pause) {
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
      if (mode === 'initiative') await api(`/parties/${id}`)
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
    case 'legacy':
      return prepareCampaigns('legacy')
    case 'initiative':
      return prepareCampaigns('initiative')
    case 'snapshot':
      return readSnapshot(process.argv[3])
    default:
      throw new Error('Use content, campaigns, legacy, initiative, stale ou snapshot <id>.')
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
