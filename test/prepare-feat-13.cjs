// Dados locais da T-67. Use uma instância de desenvolvimento com banco de teste.
const { cp, mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { config } = require('dotenv')
const { Client } = require('pg')
const { createHash } = require('node:crypto')

const wolves = 'fixture.howling-wolves'
const escapeCombat = 'fixture.t67-failed-escape'
const noEscapeCombat = 'fixture.t67-no-escape'
const defeat = 'fixture.t67-defeat'
const immediateCombat = 'fixture.t67-immediate-combat'
const supportCombat = 'fixture.t67-support-combat'
const channelWeapon = 'fixture.t67-channel-weapon'
const channelAbility = 'fixture.t67-channel'
const damageCombat = 'fixture.t67-damage-combat'
const damageWeapon = 'fixture.t67-damage-weapon'
const zeroAccuracyStrike = 'fixture.t67-zero-accuracy-strike'
const waterArea = 'fixture.t67-water-area'
const ambush = 'fixture.fire-ambush'
const blade = 'fixture.blade-of-dusk'
const traveler = 'fixture.wounded-traveler'
const reserveEvent = 'fixture.t67-traveler-reserve'
const initiative = 'fixture.t67-initiative'
const haste = 'fixture.t67-haste'
const paidStrike = 'fixture.t67-paid-strike'
const fieldAid = 'fixture.t67-field-aid'
const triggerAbility = 'fixture.t67-trigger-ability'
const triggerWeapon = 'fixture.t67-trigger-weapon'
const mixedTriggerWeapon = 'fixture.t67-mixed-trigger-weapon'
const paymentEvent = 'fixture.t67-payment-event'
const batchPayment = 'fixture.t67-batch-payment'
const batchResources = ['fixture.iron-ore', 'fixture.silver-fish']
const legacyCombat = 'fixture.t67-legacy-combat'
const catalogCombat = 'fixture.t67-catalog-combat'
const classWeapon = 'fixture.t67-class-weapon'
const restrictedAbility = 'fixture.t67-rogue-ability'
const unrestrictedAbility = 'fixture.t67-open-ability'
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
  const catalogCard = {
    ...card,
    id: catalogCombat,
    title: 'Lobos Uivantes — Limiar ausente',
    enemies: [{ ...enemy, count: 1, health: 1, modifiers }],
    goodOutcome: empty,
    badOutcome: empty,
  }
  await writeFile(
    combatPath,
    JSON.stringify([
      {
        ...card,
        id: legacyCombat,
        title: 'Lobos Uivantes — Catálogo legado',
        enemies: [{
          ...enemy,
          abilities: [{ name: 'Uivo', text: 'A matilha uiva.' }],
        }],
      },
      catalogCard,
      {
        ...catalogCard,
        id: escapeCombat,
        title: 'Lobo da Fuga',
        escapeThreshold: 20,
        enemies: [{
          ...enemy,
          count: 1,
          health: 20,
          modifiers: { ...modifiers, attack: 4, accuracy: 100, celerity: 1 },
        }],
      },
      {
        ...catalogCard,
        id: noEscapeCombat,
        title: 'Lobo sem Fuga',
        noEscape: true,
        enemies: [{
          ...enemy,
          count: 1,
          health: 20,
          modifiers: { ...modifiers, attack: 4, accuracy: 0, celerity: 1 },
        }],
        goodOutcome: {
          text: 'Compre uma recompensa.',
          steps: [{ type: 'drawRewards', count: 1 }],
        },
        badOutcome: {
          text: 'Perca 5 de ouro.',
          steps: [{
            type: 'effect',
            effect: {
              text: 'Perca 5 de ouro.',
              activation: [{ kind: 'loseGold', amount: 5 }],
              duration: { kind: 'immediate' },
              mark: null,
            },
          }],
        },
      },
      {
        ...catalogCard,
        id: damageCombat,
        title: 'Lobos Elementais',
        enemies: [
          {
            ...enemy, name: 'Lobo de Fogo', count: 1, health: 20, element: 'fire',
            modifiers: { ...modifiers, accuracy: 0, reflection: 2 },
          },
          {
            ...enemy, name: 'Lobo de Gelo', count: 1, health: 20, element: 'frost',
            modifiers: { ...modifiers, accuracy: 0, reflection: 3 },
          },
        ],
      },
      { ...catalogCard, id: `${catalogCombat}-null`, title: 'Lobos Uivantes — Limiar nulo', escapeThreshold: null },
      { ...catalogCard, id: `${catalogCombat}-zero`, title: 'Lobos Uivantes — Limiar zero', escapeThreshold: 0 },
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
        id: immediateCombat,
        title: 'Lobo da Revelação',
        enemies: [{
          ...enemy,
          count: 1,
          health: 1,
          modifiers: { ...modifiers, attack: 20, accuracy: 100, celerity: 100 },
        }],
        goodOutcome: empty,
        badOutcome: empty,
      },
      {
        ...card,
        id: defeat,
        title: 'Lobos Uivantes — Derrota',
        enemies: [{
          ...enemy,
          count: 1,
          modifiers: { ...modifiers, attack: 20, accuracy: 100, celerity: 0 },
        }],
        goodOutcome: empty,
        badOutcome: {
          text: 'Perca 5 de ouro.',
          steps: [{
            type: 'effect',
            effect: {
              text: 'Perca 5 de ouro.',
              activation: [{ kind: 'loseGold', amount: 5 }],
              duration: { kind: 'immediate' },
              mark: null,
            },
          }],
        },
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
  const combatCards = JSON.parse(await readFile(combatPath, 'utf8'))
  combatCards.push({
    ...card,
    id: supportCombat,
    title: 'Dupla de Lobos',
    enemies: [
      {
        ...enemy,
        name: 'Lobo Curandeiro',
        count: 1,
        health: 20,
        behavior: 'support',
        modifiers: { ...modifiers, attack: 5, accuracy: 100, celerity: 10 },
        combatRules: { abilityPriority: ['supportWoundedAlly'] },
        abilities: [{
          ...ability,
          id: 'fixture.t67-wolf-heal',
          name: 'Cura da Matilha',
          power: null,
          element: null,
          target: 'ally',
          effects: [{
            text: 'Recupere 3 PV.',
            trigger: null,
            cost: [],
            activation: [{ kind: 'heal', amount: 3 }],
            duration: { kind: 'immediate' },
            mark: null,
          }],
        }],
      },
      {
        ...enemy,
        name: 'Lobo da Guarda',
        count: 1,
        health: 20,
        modifiers: { ...modifiers, accuracy: 0, celerity: 1 },
      },
    ],
    goodOutcome: empty,
    badOutcome: empty,
  })
  await writeFile(combatPath, JSON.stringify(combatCards, null, 2))
  const equipmentPath = join(root, 'fixture', 'equipment.json')
  const equipment = JSON.parse(await readFile(equipmentPath, 'utf8'))
  const weapon = equipment.find(({ id }) => id === blade)
  equipment.push({
    ...weapon,
    id: damageWeapon,
    name: 'Lâmina das Marés',
    modifiers: [],
    abilities: [
      { ...ability, id: zeroAccuracyStrike, name: 'Jato de Água', element: 'water' },
      { ...ability, id: waterArea, name: 'Onda de Água', element: 'water', form: 'area', target: 'allOpponents' },
    ],
  })
  equipment.push({
    ...weapon,
    id: classWeapon,
    name: 'Lâmina de Classe',
    abilities: [
      { ...ability, id: restrictedAbility, name: 'Golpe do Ladino', classRestriction: ['rogue'] },
      { ...ability, id: unrestrictedAbility, name: 'Golpe Livre' },
    ],
  })
  equipment.push({
    ...weapon,
    id: channelWeapon,
    name: 'Lamina Canalizadora',
    modifiers: [],
    abilities: [{
      ...ability,
      id: channelAbility,
      name: 'Chama Canalizada',
      form: 'channeled',
      channel: { chargesRequired: 2, releaseForm: 'targeted' },
    }],
  })
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
  const discard = (attribute, random) => ({
    kind: 'discardFromHand',
    requirements: [{ attribute, count: 1 }],
    excludeAttributes: [],
    constraint: 'none',
    random,
  })
  const offerItem = {
    kind: 'offerResources',
    requirements: [{ resource: 'item', count: 1 }],
    constraint: 'none',
    exclude: [],
  }
  for (const scenarioAbility of [
    {
      ...ability,
      id: batchPayment,
      name: 'Pagamento em Lote',
      text: 'Pague o lote para recuperar 1 PV.',
      target: 'self',
      element: null,
      power: null,
      cost: [
        { kind: 'payGold', amount: 2 },
        discard('dexterity', true),
        discard('strength', false),
        discard('strength', false),
        { kind: 'abandonEquipment', count: 1, slots: ['head'], excludeSlots: [], random: false },
        offerItem,
        offerItem,
      ],
      effects: [{
        text: 'Recupere 1 PV.',
        trigger: null,
        cost: [],
        activation: [{ kind: 'heal', amount: 1 }],
        duration: { kind: 'immediate' },
        mark: null,
      }],
    },
    {
      ...ability,
      id: paidStrike,
      name: 'Golpe Pago',
      text: 'Pague 2 de ouro e descarte 1 carta da mão para atacar.',
      cooldown: 2,
      usesPerTurn: 2,
      cost: [
        { kind: 'payGold', amount: 2 },
        {
          kind: 'discardFromHand',
          requirements: [{ attribute: 'any', count: 1 }],
          excludeAttributes: [],
          constraint: 'none',
          random: false,
        },
      ],
    },
    {
      ...ability,
      id: fieldAid,
      name: 'Socorro de Campo',
      text: 'Pague 1 de ouro para recuperar 1 PV.',
      timing: 'both',
      target: 'self',
      element: null,
      power: null,
      cooldown: 2,
      cost: [{ kind: 'payGold', amount: 1 }],
      effects: [{
        text: 'Recupere 1 PV.',
        trigger: null,
        cost: [],
        activation: [{ kind: 'heal', amount: 1 }],
        duration: { kind: 'immediate' },
        mark: null,
      }],
    },
  ]) {
    equipment.push({
      ...weapon,
      id: `${scenarioAbility.id}-weapon`,
      name: scenarioAbility.name,
      abilities: [scenarioAbility],
    })
  }
  const trigger = {
    kind: 'onAbilityUsed', slots: ['weapon'], excludeSlots: [], tags: [], cardId: null,
  }
  const immediate = { trigger, duration: { kind: 'immediate' }, mark: null }
  for (const [id, cost] of [[triggerWeapon, 1], [mixedTriggerWeapon, 11]]) {
    const effects = [{
      ...immediate,
      text: `Pague ${cost} de ouro para recuperar 2 PV.`,
      cost: [{ kind: 'payGold', amount: cost }],
      activation: [{ kind: 'heal', amount: 2 }],
    }]
    if (id === mixedTriggerWeapon) {
      effects.push({
        ...immediate,
        text: 'Ganhe 2 de ouro.',
        cost: [],
        activation: [{ kind: 'gainGold', amount: 2 }],
      })
    }
    const active = {
      ...ability,
      id: triggerAbility,
      name: 'Sinal de Campo',
      text: 'Dispare a passiva da arma.',
      timing: 'outsideCombat',
      target: 'self',
      element: null,
      power: null,
    }
    equipment.push({
      ...weapon,
      id,
      name: id === mixedTriggerWeapon ? 'Lâmina de Dois Gatilhos' : 'Lâmina de Antecipação',
      abilities: [active, {
        ...active,
        id: 'fixture.t67-trigger-passive',
        name: 'Resposta de Campo',
        text: 'Resolva os efeitos ao usar uma habilidade de arma.',
        form: 'passive',
        timing: 'both',
        effects,
      }],
    })
  }
  await writeFile(equipmentPath, JSON.stringify(equipment))
  const randomEventPath = join(root, 'fixture', 'randomEvent.json')
  const randomEvents = JSON.parse(await readFile(randomEventPath, 'utf8'))
  const travelerCard = randomEvents.find(({ id }) => id === traveler)
  randomEvents.push({ ...travelerCard, id: reserveEvent, title: 'Viajante na Reserva' })
  randomEvents.push({
    ...travelerCard,
    id: paymentEvent,
    title: 'Pagamento em Duas Partes',
    requirements: [
      { id: 'gold', text: 'Pague 2 de ouro.', kind: 'payGold', amount: 2 },
      { id: 'vigor', text: 'Gaste 3 de Vigor.', kind: 'spendVigor', amount: 3 },
    ],
  })
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

async function prepareCampaigns(mode, victoryOnly = false) {
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
  if (mode === 'initiative' || mode === 'payments') await api(`/catalog/cards/${initiative}`)
  if (mode === 'outcomes') await api(`/catalog/cards/${defeat}`)
  if (mode === 'escape') {
    await api(`/catalog/cards/${escapeCombat}`)
    await api(`/catalog/cards/${noEscapeCombat}`)
  }
  if (mode === 'support') {
    await api(`/catalog/cards/${supportCombat}`)
    await api(`/catalog/cards/${channelWeapon}`)
  }
  if (mode === 'reveal') await api(`/catalog/cards/${immediateCombat}`)
  if (mode === 'damage') {
    await api(`/catalog/cards/${damageCombat}`)
    await api(`/catalog/cards/${damageWeapon}`)
  }
  if (mode === 'catalog') {
    for (const cardId of [legacyCombat, catalogCombat, `${catalogCombat}-null`, `${catalogCombat}-zero`, classWeapon]) {
      await api(`/catalog/cards/${cardId}`)
    }
  }
  if (mode === 'cooldown') await api(`/catalog/cards/${fieldAid}-weapon`)
  if (mode === 'triggered' || mode === 'triggered-resolve') {
    await api(`/catalog/cards/${triggerWeapon}`)
    await api(`/catalog/cards/${mixedTriggerWeapon}`)
  }
  if (mode === 'payments') await api(`/catalog/cards/${batchPayment}-weapon`)
  if (mode === 'abilities') {
    await api(`/catalog/cards/${paidStrike}-weapon`)
    await api(`/catalog/cards/${fieldAid}-weapon`)
    await api(`/catalog/cards/${paymentEvent}`)
  }
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    if (mode === 'legacy') return await prepareLegacyCampaigns(api, db, url)
    const scenarios = [
      { name: 'T-67 — Efeito disparado', cardId: ambush },
      { name: 'T-67 — Reflexão fatal', cardId: wolves },
    ]
    const mixedTrigger = {
      name: 'T-67 Gatilhos juntos', cardId: wolves, triggerWeapon: mixedTriggerWeapon,
    }
    const selected = mode === 'triggered-resolve'
      ? [mixedTrigger]
      : mode === 'triggered'
      ? [
          { name: 'T-67 Pagar gatilho', cardId: wolves, triggerWeapon },
          { name: 'T-67 Recusar gatilho', cardId: wolves, triggerWeapon },
          mixedTrigger,
        ]
      : mode === 'abilities'
      ? [
          { name: 'T-67 — Golpe Pago', cardId: ambush, abilityId: paidStrike },
          { name: 'T-67 — Socorro de Campo', cardId: paymentEvent, abilityId: fieldAid },
        ]
      : mode === 'initiative'
      ? [
          { name: 'T-67 — Empate de Celeridade', cardId: initiative },
          { name: 'T-67 — Mudança de Celeridade', cardId: initiative, equipHaste: true },
        ]
      : mode === 'cooldown'
      ? [{ name: 'T-67 — Reset de recarga', cardId: wolves, abilityId: fieldAid }]
      : mode === 'payments'
      ? [{ name: 'T-67 — Pagamento em lote', cardId: initiative, abilityId: batchPayment }]
      : mode === 'reveal'
      ? [
          { name: 'T-67 — Vitória na revelação', cardId: immediateCombat, reflection: 20 },
          { name: 'T-67 — Derrota na revelação', cardId: immediateCombat, reflection: 0 },
        ]
      : mode === 'escape'
      ? [
          { name: 'T-67 Fuga falha', cardId: escapeCombat },
          { name: 'T-67 Sem fuga', cardId: noEscapeCombat },
        ]
      : mode === 'support'
      ? [20, 25].map(threshold => ({
          name: `T-67 Suporte ${threshold}%`,
          cardId: supportCombat,
          threshold,
        }))
      : mode === 'damage'
      ? [{ name: 'T-67 — Lobos Elementais', cardId: damageCombat }]
      : mode === 'outcomes'
      ? [
          { name: 'T-67 — Turno atual', cardId: wolves },
          { name: 'T-67 — Manter recompensa', cardId: wolves },
          { name: 'T-67 — Deixar recompensa', cardId: wolves },
          { name: 'T-67 — Derrota', cardId: defeat },
        ]
      : mode === 'catalog'
      ? [
          { name: 'T-67 — Limiar ausente', cardId: catalogCombat, threshold: 13 },
          { name: 'T-67 — Limiar nulo', cardId: `${catalogCombat}-null`, threshold: 13 },
          { name: 'T-67 — Limiar zero', cardId: `${catalogCombat}-zero`, threshold: 0 },
        ]
      : mode === 'stale' ? [scenarios[1]] : scenarios
    for (const scenario of selected) {
      if (victoryOnly && scenario.reflection === 0) continue
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
      if (scenario.triggerWeapon) {
        state.turn.actionPoints = 1
        Object.assign(player, { peak: 0, health: player.baseHealth - 5, gold: 10, statuses: [] })
        for (const slot of Object.keys(player.equipment)) player.equipment[slot] = null
        player.equipment.weapon = scenario.triggerWeapon
      } else if (mode === 'escape') {
        const noEscape = scenario.cardId === noEscapeCombat
        Object.assign(player, { peak: 10, vigor: noEscape ? 6 : 10, health: 20, gold: 10, statuses: [] })
        for (const slot of Object.keys(player.equipment)) player.equipment[slot] = null
        Object.assign(player.modifiers, { defense: 0, evasion: 0, celerity: 100, reflection: 0 })
        Object.assign(state.config, {
          maxCombatCycles: noEscape ? 1 : 20,
          escapeVigorPercent: 20,
          combatEscapePeakLoss: 2,
        })
        state.rewardDecks = [{ zoneType: 'urban', cards: ['fixture.iron-ore'] }]
      } else if (mode === 'support') {
        Object.assign(player, { peak: 0, vigor: 10, health: 20, statuses: [] })
        for (const slot of Object.keys(player.equipment)) player.equipment[slot] = null
        player.equipment.weapon = channelWeapon
        Object.assign(player.modifiers, {
          attack: 6, defense: 0, accuracy: 100, evasion: 0, celerity: 100,
          piercing: 0, reflection: 0,
        })
        state.config.channelInterruptDamagePercent = scenario.threshold
      } else if (mode === 'damage') {
        Object.assign(player, { peak: 0, vigor: 10, health: player.baseHealth, statuses: [] })
        for (const slot of Object.keys(player.equipment)) player.equipment[slot] = null
        player.equipment.weapon = damageWeapon
        Object.assign(player.modifiers, { attack: 20, accuracy: 0, celerity: 100 })
        Object.assign(state.config, {
          areaDamagePercent: 50,
          elementAdvantageBonusPercent: 25,
          elementDisadvantagePenaltyPercent: 25,
        })
      } else if (mode === 'reveal') {
        const vigor = scenario.reflection > 0 ? 1 : 0
        Object.assign(player, { peak: vigor, vigor, health: 1 })
        for (const slot of Object.keys(player.equipment)) player.equipment[slot] = null
        player.statuses = []
        Object.assign(player.modifiers, {
          defense: 0, evasion: 0, celerity: 0, reflection: scenario.reflection,
        })
      } else if (mode === 'catalog') {
        state.config.combatEscapeThreshold = 13
        Object.assign(player, { peak: 0, vigor: 10 })
        player.equipment.weapon = classWeapon
        Object.assign(player.modifiers, { accuracy: 100, celerity: 100 })
      } else if (scenario.abilityId) {
        state.turn.actionPoints = 1
        Object.assign(player, { peak: 0, health: 10, gold: 10, vigor: 10, inventory: [] })
        for (const slot of Object.keys(player.equipment)) player.equipment[slot] = null
        player.equipment.weapon = `${scenario.abilityId}-weapon`
        Object.assign(player.modifiers, { celerity: 100, accuracy: 100, attack: 0, defense: 100 })
        if (mode === 'cooldown') player.health = Math.max(1, player.baseHealth - 1)
        if (mode === 'payments') {
          player.health = Math.max(1, player.baseHealth - 1)
          player.equipment.head = 'fixture.iron-helm'
          player.hand = [
            'fixture.strength-basic', 'fixture.strength-basic',
            'fixture.dexterity-basic', 'fixture.dexterity-basic',
          ]
          delete player.handCopies
          player.inventory = batchResources.map(cardId => ({ cardId, quantity: 1 }))
        }
        if (scenario.abilityId === paidStrike) {
          player.hand = [...player.hand, 'fixture.dexterity-basic']
          delete player.handCopies
        }
      } else if (scenario.cardId === initiative) {
        player.peak = 0
        Object.assign(player.modifiers, { celerity: tiedCelerity, evasion: 100 })
        for (const slot of Object.keys(player.equipment)) player.equipment[slot] = null
        if (scenario.equipHaste) player.equipment.weapon = blade
      } else if (scenario.cardId === defeat) {
        Object.assign(player, { peak: 0, health: 1, gold: 10 })
        for (const slot of Object.keys(player.equipment)) player.equipment[slot] = null
        Object.assign(player.modifiers, { defense: 0, evasion: 0, celerity: 100 })
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
      if (scenario.triggerWeapon) {
        await api(`/parties/${id}/actions`, { type: 'startEvent' })
        await api(`/parties/${id}/actions`, {
          type: 'prepare',
          operation: 'useAbility',
          equipmentSlot: 'weapon',
          abilityId: triggerAbility,
        })
        const party = await api(`/parties/${id}`)
        const choice = party.triggeredEffectChoice
        const playerState = party.members[0].player
        const mixed = scenario.triggerWeapon === mixedTriggerWeapon
        const optional = choice?.effects.find(({ mode }) => mode === 'optional')
        const automatic = choice?.effects.find(({ mode }) => mode === 'automatic')
        if (
          party.randomEventEncounter?.phase !== 'anticipation' ||
          choice?.decisionDeadlineAt !== null ||
          choice.effects.length !== (mixed ? 2 : 1) ||
          optional?.canPay !== !mixed ||
          Boolean(automatic) !== mixed ||
          playerState.gold !== 10 ||
          playerState.health !== player.health ||
          playerState.availableActions.join() !== 'resolveTriggeredEffect'
        ) {
          throw new Error(`Campanha ${id} sem a escolha de gatilho esperada.`)
        }
        console.log(JSON.stringify({
          scenario: scenario.name,
          id,
          url: new URL(`/parties/${id}`, url).href,
          health: playerState.health,
          gold: playerState.gold,
          choice,
        }))
        continue
      }
      if (mode === 'escape' || mode === 'support' || mode === 'damage') {
        const started = await api(`/parties/${id}/actions`, { type: 'startEvent' })
        await api(`/parties/${id}/actions`, {
          type: 'revealEvent',
          encounterId: started.randomEventEncounter.id,
        })
        const { combat, members } = await api(`/parties/${id}`)
        if (mode === 'escape') {
          const noEscape = scenario.cardId === noEscapeCombat
          const { player: active } = members[0]
          if (
            combat?.card.id !== scenario.cardId ||
            combat.turn.actorId !== combat.memberId ||
            combat.turn.phase !== 'prepare' ||
            combat.cycle !== 1 ||
            combat.maxCycles !== (noEscape ? 1 : 20) ||
            combat.escape.unavailableReason !== (noEscape ? 'escapeForbidden' : null) ||
            combat.escape.vigorCost !== 2 ||
            (!noEscape && (combat.escape.threshold !== 20 || combat.escape.automatic)) ||
            active.peak !== 10 || active.vigor !== (noEscape ? 6 : 10) ||
            active.health !== 20 || active.gold !== 10
          ) {
            throw new Error(`Campanha ${id} sem o estado inicial esperado para Fuga.`)
          }
          console.log(JSON.stringify({
            id,
            url: new URL(`/parties/${id}`, url).href,
            action: {
              type: noEscape ? 'endCombatTurn' : 'escapeCombat',
              combatId: combat.id,
              turnId: combat.turn.id,
            },
          }))
          continue
        }
        if (mode === 'support') {
          const option = combat?.abilities.find(({ abilityId }) => abilityId === channelAbility)
          if (
            combat?.card.id !== supportCombat ||
            combat.turn.phase !== 'prepare' ||
            combat.turn.actorId !== combat.memberId ||
            combat.enemies.length !== 2 ||
            combat.enemies.some(({ health }) => health !== 20) ||
            !option?.canPay || (option.charges ?? 0) !== 0 ||
            members[0].player.health !== 20
          ) {
            throw new Error(`Campanha ${id} sem o estado inicial esperado para Suporte.`)
          }
          console.log(JSON.stringify({
            id,
            url: new URL(`/parties/${id}`, url).href,
            threshold: scenario.threshold,
            combatId: combat.id,
            turnId: combat.turn.id,
            supportId: combat.enemies[0].id,
            guardId: combat.enemies[1].id,
            abilityId: channelAbility,
          }))
          continue
        }
        if (
          combat?.card.id !== damageCombat ||
          combat.turn.phase !== 'prepare' ||
          combat.turn.actorId !== combat.memberId ||
          combat.enemies.length !== 2 ||
          combat.enemies.some(({ health }) => health !== 20) ||
          ![zeroAccuracyStrike, waterArea].every(id =>
            combat.abilities.some(({ abilityId, canPay }) => abilityId === id && canPay)
          ) ||
          members[0].player.health <= 5
        ) {
          throw new Error(`Campanha ${id} sem o estado inicial esperado para a matriz de dano.`)
        }
        console.log(JSON.stringify({
          id,
          combatId: combat.id,
          turnId: combat.turn.id,
          enemyIds: combat.enemies.map(({ id }) => id),
          playerHealth: members[0].player.health,
        }))
      } else if (mode === 'reveal') {
        await api(`/parties/${id}/actions`, { type: 'startEvent' })
        const party = await api(`/parties/${id}`)
        if (
          party.randomEventEncounter?.phase !== 'anticipation' ||
          party.combat !== null ||
          party.lastCombatResult !== null ||
          party.members[0].player.health !== 1 ||
          !party.members[0].player.availableActions.includes('revealEvent')
        ) {
          throw new Error(`Campanha ${id} sem a antecipação esperada para a revelação.`)
        }
      } else if (mode === 'catalog') {
        const started = await api(`/parties/${id}/actions`, { type: 'startEvent' })
        await api(`/parties/${id}/actions`, {
          type: 'revealEvent',
          encounterId: started.randomEventEncounter.id,
        })
        const party = await api(`/parties/${id}`)
        const options = party.combat?.abilities ?? []
        if (
          party.combat?.card.id !== scenario.cardId ||
          party.combat.escape.threshold !== scenario.threshold ||
          party.members[0].player.equipment.weapon !== classWeapon ||
          !options.some(({ abilityId }) => abilityId === unrestrictedAbility) ||
          options.some(({ abilityId }) => abilityId === restrictedAbility)
        ) {
          throw new Error(`Campanha ${id} sem o limiar ou as opções de habilidade esperadas.`)
        }
      } else if (mode === 'cooldown') {
        await api(`/parties/${id}/actions`, { type: 'startEvent' })
        const party = await api(`/parties/${id}`)
        const playerState = party.members[0].player
        if (
          party.randomEventEncounter?.phase !== 'anticipation' ||
          !playerState.usableAbilities?.some(({ abilityId }) => abilityId === fieldAid) ||
          !playerState.availableActions.includes('prepare') ||
          !playerState.availableActions.includes('revealEvent')
        ) {
          throw new Error(`Campanha ${id} sem Socorro de Campo pagável na antecipação.`)
        }
      } else if (scenario.abilityId) {
        const started = await api(`/parties/${id}/actions`, { type: 'startEvent' })
        await api(`/parties/${id}/actions`, {
          type: 'revealEvent',
          encounterId: started.randomEventEncounter.id,
        })
        const party = await api(`/parties/${id}`)
        const playerState = party.members[0].player
        if (mode === 'payments') {
          const option = party.combat?.abilities.find(({ abilityId }) => abilityId === batchPayment)
          const costs = option?.paymentCosts ?? []
          const strengthIds = playerState.handCopies
            .filter(({ cardId }) => cardId === 'fixture.strength-basic')
            .map(({ copyId }) => copyId)
          const expectedTypes = [
            'automatic', 'automatic', 'handCards', 'handCards', 'equipmentSlots', 'resources', 'resources',
          ]
          if (
            party.combat?.turn.phase !== 'prepare' ||
            party.combat.turn.actorId !== party.combat.memberId ||
            !playerState.availableActions.includes('useAbility') ||
            costs.length !== expectedTypes.length ||
            costs.some((cost, index) => cost.costIndex !== index || cost.type !== expectedTypes[index]) ||
            new Set(strengthIds).size !== 2 ||
            !costs.slice(2, 4).every(cost => cost.count === 1 &&
              cost.eligibleCopyIds.length === 2 && strengthIds.every(id => cost.eligibleCopyIds.includes(id))) ||
            costs[4].count !== 1 || costs[4].eligibleSlots.join() !== 'head' ||
            !costs.slice(5).every(cost => cost.count === 1 && cost.eligibleResources.length === 2 &&
              batchResources.every(id => cost.eligibleResources.some(({ cardId, maxCopies }) => cardId === id && maxCopies === 1)))
          ) {
            throw new Error(`Campanha ${id} sem as opções de pagamento esperadas.`)
          }
          console.log(`${scenario.name}  ${url}/parties/${id}`)
          console.log(JSON.stringify({ combatId: party.combat.id, turnId: party.combat.turn.id, ...option }))
          continue
        }
        const inCombat = scenario.abilityId === paidStrike
        const options = inCombat ? party.combat?.abilities : playerState.usableAbilities
        const action = inCombat ? 'combatAttack' : 'prepare'
        if (
          party.turn.actionPoints !== 0 ||
          !options?.some(({ abilityId }) => abilityId === scenario.abilityId) ||
          !playerState.availableActions.includes(action)
        ) {
          throw new Error(`Campanha ${id} sem a habilidade esperada com 0 PA.`)
        }
      }
      if (mode === 'initiative') await api(`/parties/${id}`)
      if (mode === 'stale' || mode === 'outcomes') {
        const started = await api(`/parties/${id}/actions`, {
          type: 'startEvent',
        })
        const { combat } = await api(`/parties/${id}/actions`, {
          type: 'revealEvent',
          encounterId: started.randomEventEncounter.id,
        })
        console.log(`${scenario.name}  ${url}/parties/${id}`)
        if (scenario.cardId === defeat) {
          const party = await api(`/parties/${id}`)
          const playerState = party.members[0].player
          if (
            playerState.health !== 1 ||
            playerState.gold !== 10 ||
            !playerState.availableActions.includes('endCombatTurn')
          ) {
            throw new Error(`Campanha ${id} sem o turno inicial esperado para a derrota.`)
          }
          continue
        }
        const attack = {
          type: 'combatAttack',
          combatId: combat.id,
          turnId: combat.turn.id,
          targetId: combat.enemies[0].id,
        }
        await api(`/parties/${id}/actions`, attack)
        const current = await api(`/parties/${id}`)
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
      } else {
        console.log(`${scenario.name}  ${url}/parties/${id}`)
      }
    }
  } finally {
    await db.end()
  }
}

async function readSnapshot(id, detail) {
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
    if (detail === 'cooldown') {
      const { state } = JSON.parse(snapshot)
      const player = state.members[0].player
      const key = JSON.stringify(['weapon', `${fieldAid}-weapon`, fieldAid])
      console.log(JSON.stringify({
        phase: state.eventEncounter?.phase ?? null,
        gold: player.gold,
        usage: player.abilityUsage?.[key] ?? null,
      }))
      return
    }
    const { state } = JSON.parse(snapshot)
    console.log(
      JSON.stringify({
        ...fields,
        sha256: createHash('sha256').update(snapshot).digest('hex'),
        ...(detail === 'outcomes' && {
          gold: state.members[0].player.gold,
          urbanEventDiscard: state.eventDecks.find(({ zoneType }) => zoneType === 'urban')?.discard,
          urbanRewards: state.rewardDecks.find(({ zoneType }) => zoneType === 'urban')?.cards,
        }),
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
    case 'outcomes':
      return prepareCampaigns('outcomes')
    case 'catalog':
      return prepareCampaigns('catalog')
    case 'payments':
      return prepareCampaigns('payments')
    case 'triggered':
      return prepareCampaigns('triggered')
    case 'triggered-resolve':
      return prepareCampaigns('triggered-resolve')
    case 'reveal':
      return prepareCampaigns('reveal')
    case 'reveal-win':
      return prepareCampaigns('reveal', true)
    case 'escape':
      return prepareCampaigns('escape')
    case 'support':
      return prepareCampaigns('support')
    case 'damage':
      return prepareCampaigns('damage')
    case 'legacy':
      return prepareCampaigns('legacy')
    case 'initiative':
      return prepareCampaigns('initiative')
    case 'abilities':
      return prepareCampaigns('abilities')
    case 'cooldown':
      return prepareCampaigns('cooldown')
    case 'cooldown-state':
      return readSnapshot(process.argv[3], 'cooldown')
    case 'outcome-state':
      return readSnapshot(process.argv[3], 'outcomes')
    case 'snapshot':
      return readSnapshot(process.argv[3])
    default:
      throw new Error('Use content, campaigns, legacy, initiative, abilities, stale, outcomes, catalog, payments, triggered, triggered-resolve, reveal, reveal-win, damage, support, escape, cooldown, cooldown-state <id>, outcome-state <id> ou snapshot <id>.')
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
