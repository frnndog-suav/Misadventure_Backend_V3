import { parseArgs } from 'node:util'
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { RngState } from '@/core/rng/seeded-rng'
import {
  PartyMember,
  type TPlayerState,
} from '@/domain/campaign/enterprise/entities/party-member'
import type { TPartyProps } from '@/domain/campaign/enterprise/entities/party'
import type { TExecutableEvent } from '@/domain/campaign/enterprise/random-event'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { DrizzlePartyMapper } from '@/infra/database/drizzle/mappers/drizzle-party-mapper'
import { parties } from '@/infra/database/drizzle/schema'
import { makeParty, makePlayerState } from '../factories/make-party'

const strength = 'fixture.strength-basic'
const dexterity = 'fixture.dexterity-basic'
const endurance = 'fixture.endurance-basic'
const potion = 'fixture.healing-potion'
const fish = 'fixture.silver-fish'
const ore = 'fixture.iron-ore'
const fishingRod = 'fixture.fishing-rod'
const traveler = 'fixture.wounded-traveler'
const combat = 'fixture.howling-wolves'

const attrs = {
  id: 'attrs',
  text: 'Entregue duas Forças.',
  kind: 'attributes',
  specific: { strength: 2 },
  any: 0,
} as const
const min = {
  id: 'min-vigor',
  text: 'Mantenha Vigor 5.',
  kind: 'minimum',
  stat: 'vigor',
  value: 5,
} as const
const check = {
  ...min,
  id: 'min-evasion',
  text: 'Mantenha Esquiva 80.',
  stat: 'evasion',
  value: 80,
} as const
const cost = {
  id: 'vigor',
  text: 'Gaste 3 de Vigor.',
  kind: 'spendVigor',
  amount: 3,
} as const
const gold = {
  id: 'gold',
  text: 'Pague 10 moedas.',
  kind: 'payGold',
  amount: 10,
} as const
const discard = {
  id: 'discard',
  text: 'Descarte duas cartas aleatórias.',
  kind: 'discardFromHand',
  requirements: [{ attribute: 'any', count: 2 }],
  excludeAttributes: [],
  constraint: 'none',
  random: true,
} as const

type Scenario = {
  name: string
  requirements?: TExecutableEvent['requirements']
  steps?: TExecutableEvent['goodOutcome']['steps']
  player?: Partial<TPlayerState>
  peak?: number
  vigor?: number
  hand?: string[]
  ap?: number
  roll?: number
  noEscape?: boolean
  inventoryCapacity?: number
  rewardCards?: string[]
  eventCards?: string[]
}

const payment = [
  {
    ...attrs,
    text: 'Entregue Força e Destreza.',
    specific: { strength: 1, dexterity: 1 },
  },
  gold,
  cost,
  min,
] as const
const draw = { type: 'drawRewards', count: 2 } as const
const full = {
  inventoryCapacity: 1,
  player: { inventory: [{ cardId: fish, quantity: 2 }] },
  requirements: [min],
}
const scavenge = {
  ap: 1,
  inventoryCapacity: 1,
  player: { inventory: [{ cardId: fishingRod, quantity: 1 }] },
}
const scenarios: Scenario[] = [
  { name: 'deck-misto', ap: 3, eventCards: [traveler, combat] },
  { name: 'so-combate', ap: 1, eventCards: [combat] },
  {
    name: 'pagamento-vigor-7',
    requirements: payment,
    vigor: 7,
    hand: [strength, dexterity],
    player: { gold: 20 },
  },
  {
    name: 'pagamento-vigor-8',
    requirements: payment,
    vigor: 8,
    hand: [strength, dexterity],
    player: { gold: 20 },
  },
  { name: 'duplicatas-parcial', requirements: [attrs] },
  {
    name: 'duplicatas-recusado',
    requirements: [{ ...attrs, specific: { strength: 1 } }, min],
    vigor: 4,
  },
  {
    name: 'consumivel',
    requirements: [attrs],
    player: {
      health: 10,
      baseHealth: 19,
      inventory: [{ cardId: potion, quantity: 2 }],
    },
  },
  {
    name: 'aleatorio-vigor-4',
    requirements: [discard, min],
    vigor: 4,
    hand: [strength, strength, endurance],
    roll: 11,
  },
  {
    name: 'aleatorio-vigor-5',
    requirements: [discard, min],
    vigor: 5,
    hand: [strength, strength, endurance],
    roll: 11,
  },
  {
    name: 'esquiva-79',
    requirements: [check],
    peak: 0,
    vigor: 0,
    player: { modifiers: { ...makePlayerState().modifiers, evasion: 79 } },
  },
  {
    name: 'esquiva-80',
    requirements: [check],
    peak: 0,
    vigor: 0,
    player: { modifiers: { ...makePlayerState().modifiers, evasion: 80 } },
  },
  { name: 'fuga-10-zero-pa', requirements: [min], vigor: 6, roll: 10 },
  { name: 'fuga-10-um-pa', requirements: [min], vigor: 6, roll: 10, ap: 1 },
  { name: 'fuga-11', requirements: [min], vigor: 6, roll: 11 },
  { name: 'fuga-proibida', requirements: [min], noEscape: true },
  { name: 'fuga-sem-vigor', requirements: [min], vigor: 1 },
  {
    name: 'recompensa-deck-e-reserva',
    ...full,
    steps: [draw],
    rewardCards: [ore],
  },
  {
    name: 'recompensa-deck-deixar',
    ...full,
    steps: [{ ...draw, count: 1 }],
    rewardCards: [ore],
  },
  {
    name: 'recompensa-fixa-deixar',
    ...full,
    steps: [{ type: 'grantReward', cardId: ore, copies: 1 }],
  },
  {
    name: 'recompensa-busca-vazia',
    ...full,
    steps: [{ type: 'searchReward', cardId: ore }],
  },
  { name: 'vasculhar-pendente', ...scavenge, rewardCards: [fish] },
  {
    name: 'vasculhar-empilha',
    ...scavenge,
    inventoryCapacity: 2,
    player: {
      inventory: [
        { cardId: fishingRod, quantity: 1 },
        { cardId: fish, quantity: 1 },
      ],
    },
    rewardCards: [fish],
  },
  { name: 'vasculhar-sem-achado', ...scavenge },
]

function makeScenario(scenario: Scenario, index: number) {
  const id = `fe120000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  const memberId = new UniqueEntityID('m1')
  const hand = scenario.hand ?? [strength, strength]
  const card: TExecutableEvent | null = scenario.requirements
    ? {
        type: 'randomEvent',
        id: traveler,
        collectionId: 'fixture',
        title: `FEAT-12 — ${scenario.name}`,
        flavorText: null,
        requirements: scenario.requirements,
        goodOutcome: { text: 'Êxito.', steps: scenario.steps ?? [] },
        badOutcome: { text: 'Revés.', steps: [] },
        noEscape: scenario.noEscape ?? false,
        escapeThreshold: 10,
      }
    : null
  const rngState: RngState = [0, 0, 0, (scenario.roll ?? 11) - 1]
  const player = makePlayerState({
    deck: [endurance, dexterity],
    hand,
    handCopies: hand.map((cardId, i) => ({ cardId, copyId: `h${i + 1}` })),
    handCopySequence: hand.length,
    peak: scenario.peak ?? 10,
    vigor: scenario.vigor ?? 7,
    ...scenario.player,
  })
  const props: Partial<TPartyProps> = {
    name: `FEAT-12 — ${scenario.name}`,
    status: 'inSession',
    hostMemberId: memberId,
    turnOrder: [memberId],
    members: [
      PartyMember.create(
        { characterName: 'Lia', kind: 'human', player },
        memberId
      ),
    ],
    turn: { round: 1, memberId, actionPoints: scenario.ap ?? 0 },
    rngState,
    config: {
      ...GAME_CONFIG_DEFAULTS,
      inventoryCapacity:
        scenario.inventoryCapacity ?? GAME_CONFIG_DEFAULTS.inventoryCapacity,
      reserveDeck: [{ type: 'card', cardId: potion, weight: 1 }],
    },
    eventDecks: [
      {
        zoneType: 'urban',
        cards: scenario.eventCards ?? [combat],
        discard: [],
      },
    ],
    rewardDecks: [{ zoneType: 'urban', cards: scenario.rewardCards ?? [] }],
    eventEncounter: card
      ? {
          id: 'e1',
          memberId: 'm1',
          zoneType: 'urban',
          phase: 'encounter',
          card,
          payments: [],
          decisionDeadlineAt: null,
        }
      : null,
  }
  const row = DrizzlePartyMapper.toDrizzle(
    makeParty(props, new UniqueEntityID(id))
  )
  DrizzlePartyMapper.toDomain(row)
  return { name: scenario.name, row }
}

async function main() {
  const { values } = parseArgs({
    options: {
      env: { type: 'string' },
      only: { type: 'string' },
      inspect: { type: 'boolean' },
    },
  })
  const saves = scenarios
    .map(makeScenario)
    .filter(({ name }) => !values.only || name === values.only)
  if (!saves.length) throw new Error('Cenário desconhecido.')
  if (values.inspect && (!values.env || !values.only))
    throw new Error('Use --inspect com --env e --only.')
  if (values.env) {
    const { parsed, error } = config({ path: values.env, quiet: true })
    if (error) throw error
    const url = parsed?.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL ausente no arquivo indicado.')
    const pool = new Pool({ connectionString: url })
    try {
      const db = drizzle(pool)
      if (values.inspect) {
        const [row] = await db
          .select()
          .from(parties)
          .where(eq(parties.id, saves[0].row.id))
        if (!row) throw new Error('Restaure o grupo antes de consultar.')
        const party = DrizzlePartyMapper.toDomain(row)
        console.log(
          JSON.stringify({ savedAt: party.savedAt, rngState: party.rngState })
        )
        return
      }
      await db.transaction(async (tx) => {
        for (const {
          row: { id, ...values },
        } of saves) {
          await tx
            .insert(parties)
            .values({ id, ...values })
            .onConflictDoUpdate({ target: parties.id, set: values })
        }
      })
    } finally {
      await pool.end()
    }
  }
  for (const { name, row } of saves) console.log(`${name}\t${row.id}`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
