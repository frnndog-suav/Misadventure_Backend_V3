const assert = require('node:assert/strict')
const { cp, mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { config } = require('dotenv')
const { Client } = require('pg')

const harbor = 'fixture.gray-harbor'
const town = 'fixture.respawn-town'
const mine = 'fixture.old-mine'
const payment = 'fixture.t68-fatal-payment'
const healing = 'fixture.t68-healing-after-fall'
const defeat = 'fixture.t68-defeat'
const reflection = 'fixture.t68-reflection'
const weapon = 'fixture.t68-field-weapon'
const donate = 'fixture.t68-donate'
const aid = 'fixture.t68-field-aid'
const strength = 'fixture.strength-basic'
const replacement = 'fixture.dexterity-basic'
const potion = 'fixture.healing-potion'
const defaults = {
  knockoutHealthPercent: 10,
  knockoutPeakLossPercent: 10,
  knockoutVigorCapPercent: 50,
  soloKnockoutGoldLossPercent: 10,
  soloKnockoutWaitRounds: 1,
}
const empty = { text: 'Fim do encontro.', steps: [] }
const effect = (kind, amount, text) => ({
  text,
  activation: [{ kind, amount }],
  duration: { kind: 'immediate' },
  mark: null,
})
const step = (...args) => ({ type: 'effect', effect: effect(...args) })
const loseGold = {
  text: 'Perca 5 de ouro.',
  steps: [step('loseGold', 5, 'Perca 5 de ouro.')],
}
const grant = { type: 'grantReward', cardId: 'fixture.pickaxe', copies: 1 }

async function prepareContent() {
  const root = await mkdtemp(join(tmpdir(), 'misadventures-feat-14-'))
  await cp(join(__dirname, 'fixtures', 'content'), root, { recursive: true })
  async function edit(file, update) {
    const path = join(root, 'fixture', file + '.json')
    const cards = JSON.parse(await readFile(path, 'utf8'))
    update(cards)
    await writeFile(path, JSON.stringify(cards, null, 2))
  }
  await edit('zone', (zones) => {
    const city = zones.find((card) => card.id === harbor)
    city.zoneActions = ['startEvent', 'useVault', 'saveRespawnPoint']
    zones.push({ ...city, id: town, title: 'Vila do Retorno' })
  })
  await edit('randomEvent', (cards) => {
    const [traveler] = cards
    const gold = {
      id: 'gold',
      kind: 'payGold',
      amount: 1,
      text: 'Pague 1 de ouro.',
    }
    cards.push(
      {
        ...traveler,
        id: payment,
        title: 'Pedágio de Sangue',
        requirements: [
          {
            id: 'attrs',
            kind: 'attributes',
            specific: { strength: 1 },
            any: 0,
            text: 'Entregue uma Força.',
          },
          { id: 'life', kind: 'donateLife', amount: 2, text: 'Doe 2 PV.' },
          gold,
        ],
        goodOutcome: empty,
        badOutcome: loseGold,
      },
      {
        ...traveler,
        id: healing,
        title: 'Socorro Tardio',
        requirements: [gold],
        goodOutcome: empty,
        badOutcome: {
          text: 'Sofra o golpe, receba socorro e decida sobre a picareta.',
          steps: [
            step('loseLife', 2, 'Perca 2 PV.'),
            step('heal', 5, 'Cure 5 PV.'),
            grant,
            step('heal', 5, 'Cure 5 PV.'),
          ],
        },
      }
    )
  })
  await edit('combatEvent', (cards) => {
    const [card] = cards
    const [enemy] = card.enemies
    const modifiers = {
      ...enemy.modifiers,
      attack: 30,
      accuracy: 100,
      defense: 0,
      evasion: 0,
      celerity: 0,
    }
    const single = { ...enemy, count: 1, health: 1, abilities: [], modifiers }
    cards.push(
      {
        ...card,
        id: defeat,
        title: 'Lobo do Revés',
        enemies: [single],
        goodOutcome: empty,
        badOutcome: loseGold,
      },
      {
        ...card,
        id: reflection,
        title: 'Lobo Espelhado',
        enemies: [{ ...single, modifiers: { ...modifiers, reflection: 2 } }],
        goodOutcome: { text: 'Receba a picareta.', steps: [grant] },
        badOutcome: empty,
      }
    )
  })
  await edit('equipment', (cards) => {
    const template = cards.find((card) => card.id === 'fixture.blade-of-dusk')
    const ability = {
      id: donate,
      name: 'Doação Fatal',
      text: 'Doe 2 PV.',
      form: 'targeted',
      element: null,
      cost: [{ kind: 'donateLife', amount: 2 }],
      power: null,
      effects: [
        { ...effect('heal', 5, 'Cure 5 PV.'), cost: [], trigger: null },
      ],
      cooldown: 0,
      timing: 'outsideCombat',
      classRestriction: [],
      usesPerTurn: 1,
      target: 'self',
      duration: null,
      channel: null,
    }
    cards.push({
      ...template,
      id: weapon,
      name: 'Lâmina do Socorro',
      effects: [],
      abilities: [
        ability,
        {
          ...ability,
          id: aid,
          name: 'Socorro de Campo',
          text: 'Cure 1 PV.',
          cost: [],
          cooldown: 2,
          effects: [
            { ...effect('heal', 1, 'Cure 1 PV.'), cost: [], trigger: null },
          ],
        },
      ],
    })
  })
  await edit('dimension', ([dimension]) => {
    dimension.eventDecks.push({
      zoneType: 'forest',
      cards: [payment, healing, defeat, reflection].map((cardId) => ({
        cardId,
        copies: 1,
      })),
    })
  })
  console.log(root)
}

const scenarios = [
  { key: 'salvar', zone: harbor },
  { key: 'recusa-floresta' },
  { key: 'doacao-tempo', ability: true },
  { key: 'doacao-encontro', card: payment },
  { key: 'cura-com-escolha', card: healing, full: true },
  { key: 'derrota', card: defeat },
  { key: 'reflexao-automatica', card: reflection },
  { key: 'reflexao-com-escolha', card: reflection, full: true },
  { key: 'legado-vitoria', card: reflection, full: true, legacy: 'choice' },
  { key: 'legado-derrota-salvo', legacy: 'saved' },
  { key: 'legado-derrota-ausente', legacy: 'missing' },
  { key: 'legado-derrota-invalido', legacy: 'invalid' },
  { key: 'espera-zero', ability: true, wait: 0 },
]

function seed(state, scenario) {
  const { player } = state.members[0]
  Object.assign(state.config, defaults, {
    actionPointsPerTurn: 3,
    inventoryCapacity: 1,
  })
  if (scenario.wait !== undefined)
    state.config.soloKnockoutWaitRounds = scenario.wait
  state.rngState = [0, 0, 0, 10]
  state.turn.round = 6
  state.turn.actionPoints = scenario.zone || scenario.card ? 3 : 2
  state.dimension.map = {
    zones: [
      {
        zoneId: harbor,
        x: 0,
        y: 0,
        arrows: ['north', 'east', 'south', 'west'],
      },
      { zoneId: town, x: 1, y: 0, arrows: ['north', 'east', 'south', 'west'] },
      { zoneId: mine, x: 2, y: 0, arrows: ['west'] },
    ],
    crossings: [{ zoneIds: [harbor, town] }, { zoneIds: [town, mine] }],
  }
  state.eventDecks = [
    { zoneType: 'urban', cards: [], discard: [] },
    {
      zoneType: 'forest',
      cards: scenario.card ? [scenario.card] : [],
      discard: [],
    },
  ]
  state.upgradedCombatDecks = ['urban', 'forest']
  Object.assign(player, {
    zoneId: scenario.zone ?? mine,
    respawnZoneId: scenario.zone ? harbor : town,
    baseHealth: 20,
    health: scenario.zone ? 22 : 2,
    peak: 10,
    vigor: 9,
    gold: 37,
    statuses: [],
    inventory: scenario.full ? [{ cardId: potion, quantity: 1 }] : [],
    vault: { slots: [], decks: [], gold: 80 },
  })
  for (const slot of Object.keys(player.equipment))
    player.equipment[slot] = null
  for (const modifier of Object.keys(player.modifiers))
    player.modifiers[modifier] = 0
  Object.assign(player.modifiers, { attack: 20, accuracy: 100, celerity: 100 })
  if (scenario.ability) {
    player.equipment.weapon = weapon
    player.abilityUsage = {
      [JSON.stringify(['weapon', weapon, aid])]: { uses: 0, cooldown: 2 },
    }
    player.statuses.push({
      statusId: 't68-temporary-status',
      sourceCardId: weapon,
      effectIndex: 0,
      text: 'Bônus temporário de defesa.',
      mark: 'buff',
      activation: [
        { kind: 'modifierFlat', changes: [{ modifier: 'defense', amount: 1 }] },
      ],
      duration: { kind: 'forRounds', rounds: 2 },
      remaining: 2,
    })
  }
  if (scenario.card === payment) {
    player.hand = [strength]
    player.deck = [replacement]
    player.discard = []
    delete player.handCopies
    delete player.handCopySequence
  }
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
  config({ path: '.env.test', quiet: true })
  const base = process.env.FEAT14_API_URL ?? 'http://localhost:3333'
  assert(process.env.DATABASE_URL, 'Informe a DATABASE_URL de teste.')
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
  await api('/lab/config')
  for (const card of [town, weapon, payment, healing, defeat, reflection])
    await api(`/catalog/cards/${card}`)

  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    for (const scenario of selected) {
      const { id } = await api('/parties', {
        name: `T-68 — ${scenario.key}`,
        characterName: 'Lia',
        playerClass: 'warrior',
      })
      const path = `/parties/${id}`
      const url = new URL(path, base).href
      async function readState() {
        const {
          rows: [row],
        } = await db.query('select state from parties where id = $1', [id])
        assert(
          row,
          'A API e o preparador precisam usar o mesmo banco de teste.'
        )
        return row.state
      }
      async function saveState(state) {
        await db.query('update parties set state = $1 where id = $2', [
          state,
          id,
        ])
      }
      async function action(body) {
        return api(`${path}/actions`, body)
      }
      try {
        await api(`${path}/session`, {})
        const legacyDefeat = scenario.legacy && scenario.legacy !== 'choice'
        if (legacyDefeat) await api(`${path}/session/end`, {})
        const state = await readState()
        seed(state, scenario)
        if (legacyDefeat) {
          const member = state.members[0]
          state.lastCombatResult = {
            combatId: 'legacy-combat',
            cardId: defeat,
            memberId: member.id,
            resolution: 'defeat',
            cause: 'playerDown',
            playerDown: true,
            peakDelta: 0,
          }
          Object.assign(member.player, {
            health: 0,
            down: true,
            gold: 32,
            lastKnockout: undefined,
            skipNextTurn: undefined,
            respawnZoneId: {
              saved: town,
              missing: undefined,
              invalid: 'missing-zone',
            }[scenario.legacy],
          })
          state.eventDecks[1].discard.push(defeat)
          state.turn.actionPoints = 0
          if (scenario.legacy === 'missing')
            for (const key of Object.keys(defaults)) delete state.config[key]
        }
        await saveState(state)
        if (legacyDefeat) {
          // GET também conclui o respawn. Deixe a primeira leitura para o frontend.
          console.log(
            JSON.stringify({
              scenario: scenario.key,
              id,
              url,
              memberId: state.members[0].id,
            })
          )
          continue
        }

        if (scenario.card) {
          const started = await action({ type: 'startEvent' })
          const encounterId = started.randomEventEncounter.id
          await action({ type: 'revealEvent', encounterId })
          if (scenario.card === payment) {
            const revealed = await api(path)
            const [{ copyId }] = revealed.members[0].player.handCopies
            await action({
              type: 'payEventRequirement',
              encounterId,
              requirementId: 'attrs',
              payment: { handCards: [copyId] },
            })
          }
        }
        let party = await api(path)
        if (scenario.legacy === 'choice') {
          const { combat } = party
          party = await action({
            type: 'combatAttack',
            combatId: combat.id,
            turnId: combat.turn.id,
            targetId: combat.attackTargetIds[0],
          })
          assert.equal(party.members[0].player.down, true)
          assert.equal(party.lastCombatResult.resolution, 'victory')
          assert.equal(party.pendingRewards.length, 1)
          const legacy = await readState()
          delete legacy.members[0].player.lastKnockout
          delete legacy.members[0].player.skipNextTurn
          legacy.turn.actionPoints = 0
          await saveState(legacy)
          party = await api(path)
        }

        const [{ id: memberId, player }] = party.members
        const encounter = party.randomEventEncounter
        const combat = party.combat
        const [reward] = party.pendingRewards
        assert.equal(party.turn.round, 6)
        assert.equal(
          party.turn.actionPoints,
          scenario.zone ? 3 : reward ? 0 : 2
        )
        assert.equal(player.zoneId, scenario.zone ?? mine)
        assert.equal(player.health, scenario.zone ? 22 : reward ? 0 : 2)
        assert.equal(player.gold, 37)
        assert.equal(player.respawnZoneId, scenario.zone ? harbor : town)
        if (scenario.ability) {
          assert(
            player.usableAbilities.some((option) => option.abilityId === donate)
          )
          assert(
            !player.usableAbilities.some((option) => option.abilityId === aid)
          )
        }
        if (scenario.card === payment) {
          assert.deepEqual(
            encounter.payments.map((receipt) => receipt.requirementId),
            ['attrs']
          )
          assert(player.availableActions.includes('payEventRequirement'))
        }
        if (scenario.card === healing)
          assert(player.availableActions.includes('giveUpEvent'))
        if (scenario.card === defeat)
          assert(player.availableActions.includes('endCombatTurn'))
        if (scenario.card === reflection && !reward)
          assert.equal(combat.attackTargetIds.length, 1)
        if (reward) assert.deepEqual(player.availableActions, ['resolveReward'])
        console.log(
          JSON.stringify({
            scenario: scenario.key,
            id,
            url,
            memberId,
            actions: player.availableActions,
            encounterId: encounter?.id,
            combatId: combat?.id ?? party.lastCombatResult?.combatId,
            turnId: combat?.turn.id,
            targetId: combat?.attackTargetIds[0],
            rewardId: reward?.id,
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
  config({ path: '.env.test', quiet: true })
  assert(process.env.DATABASE_URL, 'Informe a DATABASE_URL de teste.')
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    const {
      rows: [row],
    } = await db.query('select state, saved_at from parties where id = $1', [
      id,
    ])
    assert(row, 'Campanha não encontrada.')
    const { config, rngState, eventDecks, members } = row.state
    const { deck, discard, abilityUsage } = members[0].player
    console.log(
      JSON.stringify({
        savedAt: row.saved_at,
        rngState,
        eventDecks,
        deck,
        discard,
        abilityUsage,
        knockoutConfig: Object.fromEntries(
          Object.keys(defaults).map((key) => [key, config[key]])
        ),
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

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
