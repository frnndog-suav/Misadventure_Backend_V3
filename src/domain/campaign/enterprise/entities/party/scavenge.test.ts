import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TDimensionCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeDimensionCard,
  makeFixtureContent,
  makeItemCard,
  makeUrbanZoneCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'

import { shuffle } from '../../shuffle'
import { PartyMember, type TPlayerState } from '../party-member'
import { Party, type TPartyProps } from '.'

const NOW = fixedClock('2026-11-18T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-18T13:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')

const ROD = makeItemCard({
  id: 'fixture.fishing-rod',
  itemCategory: 'tool',
  toolKind: 'fishing-rod',
  scavengeZoneTypes: ['urban'],
})
const FISH = makeItemCard({
  id: 'fixture.silver-fish',
  itemCategory: 'material',
  scavengeTool: 'fishing-rod',
})
const RELIC = makeItemCard({
  id: 'fixture.lost-relic',
  itemCategory: 'relic',
  scavengeTool: 'fishing-rod',
})
const POTION = makeItemCard({ id: 'fixture.healing-potion' })
const CARDS = [ROD, FISH, RELIC, POTION]

const HARBOR = makeUrbanZoneCard({
  zoneActions: ['startEvent', 'scavenge', 'useVault', 'saveRespawnPoint'],
})
const DIMENSION = makeDimensionCard({
  id: 'fixture.test-dimension',
  rewardDecks: [
    {
      zoneType: 'urban',
      cards: [
        { cardId: FISH.id, copies: 1 },
        { cardId: RELIC.id, copies: 1 },
        { cardId: POTION.id, copies: 1 },
      ],
    },
  ],
})

const slot = (cardId: string, quantity = 1) => ({ cardId, quantity })

function partyOf(
  player: Partial<TPlayerState> = {},
  override: Partial<TPartyProps> = {}
): Party {
  const host = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({ inventory: [slot(ROD.id)], ...player }),
    },
    MEMBER
  )
  return makeParty({
    status: 'inSession',
    members: [host],
    hostMemberId: host.id,
    savedAt: NOW,
    rewardDecks: [{ zoneType: 'urban', cards: [POTION.id, FISH.id, RELIC.id] }],
    ...override,
  })
}
const playerOf = (party: Party) => party.members[0].player

const catalog = (
  zone: TZoneCard | null = HARBOR,
  dimension: TDimensionCard | null = DIMENSION
) => ({ zone, dimension, cards: CARDS })

const run = (party: Party, cardId: string, zone?: TZoneCard | null) =>
  party.scavenge(cardId, catalog(zone), LATER)

function expectUntouched(party: Party, before: Party) {
  expect(party.turn.actionPoints).toBe(before.turn.actionPoints)
  expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
  expect(party.rngState).toEqual(before.rngState)
  expect(party.rewardDecks).toEqual(before.rewardDecks)
  expect(playerOf(party)).toEqual(playerOf(before))
  expect(party.pullDomainEvents()).toEqual([])
}

describe('Party — decks de recompensas na criação (REQ-89)', () => {
  const FIXTURE = makeFixtureContent()
  const createInput = (dimension: TDimensionCard) => ({
    name: 'Os Teimosos',
    characterName: 'Lia',
    playerClass: 'warrior',
    classDefinition: FIXTURE.classes[0],
    attributeCards: FIXTURE.cards.filter((c) => c.type === 'attribute'),
    dimension,
    zones: FIXTURE.cards.filter((c) => c.type === 'zone'),
    config: { ...GAME_CONFIG_DEFAULTS },
    rngState: SeededRng.fromSeed(42).state(),
    now: NOW,
  })
  const fixtureDimension = makeDimensionCard({
    id: 'fixture.test-dimension',
    name: 'Dimensão de Teste',
  })

  it('REQ-89: os decks são embaralhados depois dos sorteios de REQ-31 a REQ-35, que não mudam', () => {
    const without = Party.create(
      createInput(fixtureDimension),
      sequentialIds('p')
    )
    const withDecks = Party.create(
      createInput({
        ...fixtureDimension,
        rewardDecks: DIMENSION.rewardDecks,
      }),
      sequentialIds('p')
    )
    if (!without.isRight() || !withDecks.isRight()) {
      throw new Error('esperava sucesso')
    }

    expect(withDecks.value.dimension).toEqual(without.value.dimension)
    expect(withDecks.value.members[0].player).toEqual(
      without.value.members[0].player
    )
    expect(withDecks.value.turnOrder).toEqual(without.value.turnOrder)

    const rng = SeededRng.fromState(without.value.rngState)
    const urban = shuffle([FISH.id, RELIC.id, POTION.id], rng)
    expect(withDecks.value.rewardDecks).toEqual([
      { zoneType: 'urban', cards: urban },
    ])
    expect(withDecks.value.rngState).toEqual(rng.state())
    expect(without.value.rewardDecks).toEqual([])
  })

  it('REQ-96: lastScavenge é null na criação', () => {
    const created = Party.create(
      createInput(fixtureDimension),
      sequentialIds('p')
    )
    if (!created.isRight()) throw new Error('esperava sucesso')
    expect(created.value.members[0].player.lastScavenge).toBeNull()
  })
})

describe('Party.scavenge (REQ-91, REQ-92, REQ-96)', () => {
  it('REQ-91: achou → a cópia mais perto do topo vai ao inventário, 1 ponto, deck embaralhado, Scavenged found true', () => {
    const party = partyOf()
    const rng = SeededRng.fromState(party.rngState)

    const result = run(party, FISH.id)

    expect(result.isRight()).toBe(true)
    expect(party.turn.actionPoints).toBe(
      GAME_CONFIG_DEFAULTS.actionPointsPerTurn - 1
    )
    expect(playerOf(party).inventory).toEqual([slot(ROD.id), slot(FISH.id)])
    const reshuffled = shuffle([POTION.id, RELIC.id], rng)
    expect(party.rewardDecks).toEqual([
      { zoneType: 'urban', cards: reshuffled },
    ])
    expect(party.rngState).toEqual(rng.state())
    expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    expect(party.pullDomainEvents()).toEqual([
      {
        type: 'Scavenged',
        memberId: MEMBER,
        zoneId: 'fixture.gray-harbor',
        cardId: FISH.id,
        found: true,
        occurredAt: LATER,
        aggregateId: party.id,
      },
    ])
  })

  it('REQ-91/REQ-96: deck com 1 cópia → 1º acha, 2º gasta o ponto e não acha; lastScavenge acompanha', () => {
    const party = partyOf()

    run(party, FISH.id)
    expect(playerOf(party).lastScavenge).toEqual({
      cardId: FISH.id,
      found: true,
      delivery: 'inventory',
    })
    party.pullDomainEvents()
    const rng = SeededRng.fromState(party.rngState)
    const deck = party.rewardDecks[0].cards

    const second = run(party, FISH.id)

    expect(second.isRight()).toBe(true)
    expect(party.turn.actionPoints).toBe(
      GAME_CONFIG_DEFAULTS.actionPointsPerTurn - 2
    )
    expect(playerOf(party).inventory).toEqual([slot(ROD.id), slot(FISH.id)])
    expect(party.rewardDecks[0].cards).toEqual(shuffle(deck, rng))
    expect(party.rngState).toEqual(rng.state())
    expect(playerOf(party).lastScavenge).toEqual({
      cardId: FISH.id,
      found: false,
      delivery: 'none',
    })
    expect(party.pullDomainEvents()).toMatchObject([
      { type: 'Scavenged', cardId: FISH.id, found: false },
    ])
  })

  it('REQ-159: inventário cheio com montaria → o achado vai ao inventário extra; delivery e space mountInventory', () => {
    const party = partyOf(
      {
        mount: {
          cardId: 'fixture.plow-horse',
          inventory: [],
          tcgFolder: [],
        },
      },
      {
        config: {
          ...GAME_CONFIG_DEFAULTS,
          inventoryCapacity: 1,
          mountInventorySlots: 1,
        },
      }
    )
    expect(run(party, FISH.id).isRight()).toBe(true)
    const player = playerOf(party)
    expect(player.inventory).toEqual([slot(ROD.id)])
    expect(player.mount?.inventory).toEqual([slot(FISH.id)])
    expect(player.lastScavenge?.delivery).toBe('mountInventory')
    expect(player.lastRewardDelivery?.space).toBe('mountInventory')
  })

  it('REQ-91: carta que empilha e já tem slot → soma no slot (REQ-70)', () => {
    const party = partyOf({ inventory: [slot(ROD.id), slot(FISH.id, 2)] })

    run(party, FISH.id)

    expect(playerOf(party).inventory).toEqual([slot(ROD.id), slot(FISH.id, 3)])
  })

  it('REQ-91: sem deck para o tipo da zona (save antigo) → gasta o ponto, found false, RNG intacto', () => {
    const party = partyOf({}, { rewardDecks: [] })
    const before = [...party.rngState]

    const result = run(party, FISH.id)

    expect(result.isRight()).toBe(true)
    expect(party.turn.actionPoints).toBe(
      GAME_CONFIG_DEFAULTS.actionPointsPerTurn - 1
    )
    expect([...party.rngState]).toEqual(before)
    expect(playerOf(party).lastScavenge).toEqual({
      cardId: FISH.id,
      found: false,
      delivery: 'none',
    })
  })

  it('REQ-92: grupo idle → sessionNotActive', () => {
    const party = partyOf({}, { status: 'idle' })
    const before = partyOf({}, { status: 'idle' })
    expect(run(party, FISH.id).value).toBe('sessionNotActive')
    expectUntouched(party, before)
  })

  it('REQ-92: 0 pontos → noActionPoints (antes da zona)', () => {
    const turn = { round: 1, memberId: MEMBER, actionPoints: 0 }
    const party = partyOf({}, { turn })
    const before = partyOf({}, { turn })
    expect(run(party, FISH.id, makeUrbanZoneCard()).value).toBe(
      'noActionPoints'
    )
    expectUntouched(party, before)
  })

  it('REQ-92: zona sem scavenge (ou que o catálogo não tem) → zoneActionUnavailable', () => {
    const party = partyOf()
    const before = partyOf()
    expect(run(party, FISH.id, makeUrbanZoneCard()).value).toBe(
      'zoneActionUnavailable'
    )
    expect(run(party, FISH.id, null).value).toBe('zoneActionUnavailable')
    expectUntouched(party, before)
  })

  it('REQ-92: carta fora de scavengeTargets → notScavengeable', () => {
    const party = partyOf()
    const before = partyOf()
    expect(run(party, POTION.id).value).toBe('notScavengeable')
    expect(run(partyOf({ inventory: [] }), FISH.id).value).toBe(
      'notScavengeable'
    )
    expectUntouched(party, before)
  })

  it('REQ-92/D-88: enquanto a FEAT-12 estiver desabilitada, inventário cheio retorna inventoryFull', () => {
    const full = [
      slot(ROD.id),
      ...Array.from(
        { length: GAME_CONFIG_DEFAULTS.inventoryCapacity - 1 },
        () => slot(POTION.id, 1)
      ),
    ]
    const party = partyOf({ inventory: full })
    const before = partyOf({ inventory: full })
    expect(
      party.scavenge(RELIC.id, catalog(), LATER, undefined, false).value
    ).toBe('inventoryFull')
    expectUntouched(party, before)
  })

  it('REQ-92: inventário cheio mas a carta empilha em slot existente → aceito', () => {
    const full = [
      slot(ROD.id),
      slot(FISH.id),
      ...Array.from(
        { length: GAME_CONFIG_DEFAULTS.inventoryCapacity - 2 },
        () => slot(POTION.id, 1)
      ),
    ]
    const party = partyOf({ inventory: full })
    expect(run(party, FISH.id).isRight()).toBe(true)
    expect(playerOf(party).inventory[1]).toEqual(slot(FISH.id, 2))
  })

  it('REQ-96: Vasculhar recusado não muda lastScavenge', () => {
    const party = partyOf()
    run(party, FISH.id)
    expect(run(party, POTION.id).value).toBe('notScavengeable')
    expect(playerOf(party).lastScavenge).toEqual({
      cardId: FISH.id,
      found: true,
      delivery: 'inventory',
    })
  })

  it('REQ-96: outra ação aceita não muda lastScavenge', () => {
    const party = partyOf()
    run(party, FISH.id)
    party.recover('drawToHand', LATER)
    party.endTurn(LATER)
    expect(playerOf(party).lastScavenge).toEqual({
      cardId: FISH.id,
      found: true,
      delivery: 'inventory',
    })
  })
})

describe('Party.contentInUse — decks de recompensas (REQ-94)', () => {
  it('REQ-94: as cartas dos decks de recompensas do grupo estão em uso', () => {
    const party = partyOf({ inventory: [] })
    expect(party.contentInUse().cardIds).toEqual(
      expect.arrayContaining([FISH.id, RELIC.id, POTION.id])
    )
  })
})
