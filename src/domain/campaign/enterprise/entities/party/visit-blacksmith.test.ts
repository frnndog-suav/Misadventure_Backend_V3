import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeEquipmentCard,
  makeItemCard,
  makeUrbanZoneCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'

import { DEFAULT_EQUIPMENT_STATE } from '../../equipment-state'
import type { TBlacksmithOperation } from '../../party-action'
import { PartyMember, type TPlayerState } from '../party-member'
import type { Party } from '.'

const NOW = fixedClock('2026-11-24T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-24T13:00:00.000Z').now()
const POINTS = GAME_CONFIG_DEFAULTS.actionPointsPerTurn

const ORE = makeItemCard({ id: 'fixture.iron-ore', itemCategory: 'material' })
const SWORD = makeEquipmentCard({
  id: 'fixture.short-sword',
  refinement: { maxLevel: 10, materials: [{ cardId: ORE.id, quantity: 1 }] },
})
const CARDS: TCard[] = [ORE, SWORD]
const HARBOR = makeUrbanZoneCard({
  zoneActions: ['useVault', 'visitBlacksmith', 'visitMarket'],
  market: { stock: [], singles: false },
  blacksmith: { enchantments: [] },
})

const at = (refinement: number) => ({ ...DEFAULT_EQUIPMENT_STATE, refinement })

function partyOf(
  player: Partial<TPlayerState> = {},
  status: 'idle' | 'inSession' = 'inSession'
): Party {
  const host = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({
        gold: 100,
        inventory: [
          { cardId: SWORD.id, quantity: 1, equipmentState: at(4) },
          { cardId: ORE.id, quantity: 2 },
        ],
        ...player,
      }),
    },
    new UniqueEntityID('member-1')
  )
  return makeParty({
    status,
    members: [host],
    hostMemberId: host.id,
    config: { ...GAME_CONFIG_DEFAULTS },
    savedAt: NOW,
  })
}

const playerOf = (party: Party) => party.members[0].player
const REFINE: TBlacksmithOperation = {
  operation: 'refine',
  target: { location: 'inventory', inventorySlotIndex: 0 },
}
const run = (
  party: Party,
  operations: TBlacksmithOperation[],
  zone: typeof HARBOR | null = HARBOR
) => party.visitBlacksmith(operations, { zone, cards: CARDS }, LATER)

function expectUntouched(party: Party, before: Party) {
  expect(party.turn.actionPoints).toBe(before.turn.actionPoints)
  expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
  expect(party.rngState).toEqual(before.rngState)
  expect(playerOf(party)).toEqual(playerOf(before))
  expect(party.pullDomainEvents()).toEqual([])
}

describe('Party.visitBlacksmith (REQ-149; D-132)', () => {
  it('REQ-149: aceito → gasta todos os PA, rola 1 D20 do RNG do grupo, grava lastBlacksmithVisit e registra BlacksmithVisited', () => {
    const party = partyOf()
    const rngBefore = party.rngState

    expect(run(party, [REFINE]).isRight()).toBe(true)

    expect(party.turn.actionPoints).toBe(0)
    expect(party.rngState).not.toEqual(rngBefore)
    expect(party.savedAt).toEqual(LATER)
    const visit = playerOf(party).lastBlacksmithVisit
    expect(visit).toMatchObject({
      source: 'blacksmith',
      zoneId: HARBOR.id,
      actionPointsSpent: POINTS,
    })
    expect(visit?.results[0]).toMatchObject({
      operation: 'refine',
      targetLevel: 5,
      threshold: 8,
      gold: -50,
      skipped: false,
    })
    expect(playerOf(party).gold).toBe(50)
    expect(party.pullDomainEvents()).toEqual([
      {
        type: 'BlacksmithVisited',
        memberId: party.members[0].id,
        source: 'blacksmith',
        zoneId: HARBOR.id,
        actionPointsSpent: POINTS,
        results: visit?.results,
        occurredAt: LATER,
        aggregateId: party.id,
      },
    ])
  })

  it('REQ-149: a recusa de uma operação devolve o índice e nada muda (PA, ouro, cartas, RNG, eventos)', () => {
    const party = partyOf({ gold: 999 })
    const before = partyOf({ gold: 999 })

    const refused = run(party, [REFINE, REFINE, REFINE])

    expect(refused.value).toEqual({
      reason: 'materialsMissing',
      operationIndex: 2,
      cardId: SWORD.id,
    })
    expectUntouched(party, before)
  })

  it('REQ-149: ordem das portas: fora de sessão, sem pontos, zona sem ferreiro', () => {
    expect(run(partyOf({}, 'idle'), [REFINE]).value).toBe('sessionNotActive')

    const noPoints = partyOf()
    run(noPoints, [REFINE])
    expect(run(noPoints, [REFINE]).value).toBe('noActionPoints')

    const party = partyOf()
    const before = partyOf()
    expect(
      run(party, [REFINE], makeUrbanZoneCard({ zoneActions: ['visitMarket'] }))
        .value
    ).toBe('zoneActionUnavailable')
    expect(run(party, [REFINE], null).value).toBe('zoneActionUnavailable')
    expectUntouched(party, before)
  })
})
