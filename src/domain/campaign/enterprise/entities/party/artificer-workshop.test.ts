import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeEquipmentCard,
  makeItemCard,
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
const ARTIFICER = [{ playerClass: 'artificer' as const, deckLockMet: true }]

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
        playerClasses: ARTIFICER,
        inventory: [
          {
            cardId: SWORD.id,
            quantity: 1,
            equipmentState: {
              ...DEFAULT_EQUIPMENT_STATE,
              refinement: 4,
              broken: true,
            },
          },
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
const target = { location: 'inventory' as const, inventorySlotIndex: 0 }
const REPAIR: TBlacksmithOperation = { operation: 'repair', target }
const REFINE: TBlacksmithOperation = { operation: 'refine', target }
const run = (party: Party, operations: TBlacksmithOperation[]) =>
  party.artificerWorkshop(operations, { cards: CARDS }, LATER)

describe('Party.artificerWorkshop (REQ-153; D-133)', () => {
  it('REQ-153: aceito → gasta 1 PA, conserto +4 por 7, grava lastBlacksmithVisit com source workshop e registra BlacksmithVisited', () => {
    const party = partyOf()

    expect(run(party, [REPAIR]).isRight()).toBe(true)

    expect(party.turn.actionPoints).toBe(POINTS - 1)
    expect(party.savedAt).toEqual(LATER)
    expect(playerOf(party).gold).toBe(93)
    const visit = playerOf(party).lastBlacksmithVisit
    expect(visit).toEqual({
      source: 'workshop',
      zoneId: playerOf(party).zoneId,
      actionPointsSpent: 1,
      results: [
        {
          operation: 'repair',
          target,
          cardId: SWORD.id,
          gold: -7,
          repairMarks: 1,
          skipped: false,
        },
      ],
    })
    expect(party.pullDomainEvents()).toEqual([
      {
        type: 'BlacksmithVisited',
        memberId: party.members[0].id,
        source: 'workshop',
        zoneId: playerOf(party).zoneId,
        actionPointsSpent: 1,
        results: visit?.results,
        occurredAt: LATER,
        aggregateId: party.id,
      },
    ])
  })

  it('REQ-153: pode ser repetida na mesma vez, 1 PA por uso', () => {
    const party = partyOf()

    expect(run(party, [REPAIR]).isRight()).toBe(true)
    expect(run(party, [REFINE]).isRight()).toBe(true)

    expect(party.turn.actionPoints).toBe(POINTS - 2)
    expect(playerOf(party).lastBlacksmithVisit?.results[0]).toMatchObject({
      operation: 'refine',
      targetLevel: 5,
      d20Bonus: 2,
    })
  })

  it('REQ-153: ordem das portas: fora de sessão, sem pontos, sem Artífice ativo; recusa não muda nada', () => {
    expect(run(partyOf({}, 'idle'), [REPAIR]).value).toBe('sessionNotActive')

    const noPoints = partyOf({
      gold: 999,
      inventory: [
        { cardId: SWORD.id, quantity: 1 },
        { cardId: ORE.id, quantity: 10 },
      ],
    })
    for (let i = 0; i < POINTS; i++)
      expect(run(noPoints, [REFINE]).isRight()).toBe(true)
    expect(run(noPoints, [REPAIR]).value).toBe('noActionPoints')

    const locked = [{ playerClass: 'artificer' as const, deckLockMet: false }]
    const party = partyOf({ playerClasses: locked })
    expect(run(party, [REPAIR]).value).toBe('artificerInactive')
    expect(run(partyOf({ playerClasses: [] }), [REPAIR]).value).toBe(
      'artificerInactive'
    )
    expect(party.turn.actionPoints).toBe(POINTS)
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-153: recusa de operação devolve o índice e nada muda', () => {
    const party = partyOf()
    const before = partyOf()

    expect(
      run(party, [
        REPAIR,
        {
          operation: 'enchant',
          target,
          enchantmentId: 'ember-edge',
        },
      ]).value
    ).toEqual({ reason: 'enchantNotAvailable', operationIndex: 1 })
    expect(party.turn.actionPoints).toBe(POINTS)
    expect(party.rngState).toEqual(before.rngState)
    expect(playerOf(party)).toEqual(playerOf(before))
    expect(party.pullDomainEvents()).toEqual([])
  })
})
