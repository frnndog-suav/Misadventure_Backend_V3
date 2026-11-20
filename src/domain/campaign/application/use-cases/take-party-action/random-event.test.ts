import { describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng, type RngState } from '@/core/rng/seeded-rng'
import type { TRandomEventRequirement } from '@/domain/catalog/enterprise/value-objects/card'
import { availableActions } from '../../../enterprise/available-actions'
import {
  PartyMember,
  type TPlayerState,
} from '../../../enterprise/entities/party-member'
import {
  makeAttributeCard,
  makeCombatEventCard,
  makeDimensionCard,
  makeEffect,
  makeItemCard,
  makeRandomEventCard,
  makeUrbanZoneCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'
import { TakePartyActionUseCase } from '.'

const strength = makeAttributeCard()
const endurance = makeAttributeCard({
  id: 'fixture.endurance-basic',
  attributes: ['endurance'],
})
const combat = makeCombatEventCard()
const harbor = makeUrbanZoneCard({ zoneActions: ['startEvent'] })
const potion = makeItemCard({
  effects: [makeEffect({ activation: [{ kind: 'heal', amount: 5 }] })],
})
const emptyOutcome = { text: 'Sem efeito.', steps: [] }
const minimum = {
  id: 'min',
  text: 'Vigor mínimo 5.',
  kind: 'minimum',
  stat: 'vigor',
  value: 5,
} as const
const gold = {
  id: 'gold',
  text: 'Pague 10 de ouro.',
  kind: 'payGold',
  amount: 10,
} as const
const vigor = {
  id: 'vigor',
  text: 'Gaste 3 de Vigor.',
  kind: 'spendVigor',
  amount: 3,
} as const
const attrs = {
  id: 'attrs',
  text: 'Entregue duas Forças.',
  kind: 'attributes',
  specific: { strength: 2 },
  any: 0,
} as const
const randomDiscard = {
  id: 'discard',
  text: 'Descarte duas cartas aleatórias.',
  kind: 'discardFromHand',
  requirements: [{ attribute: 'any', count: 2 }],
  excludeAttributes: [],
  constraint: 'none',
  random: true,
} as const

function setup({
  requirements = [minimum],
  player = {},
  actionPoints = 1,
  combatOnly = false,
  noEscape = false,
  rngState = SeededRng.fromSeed(42).state(),
}: {
  requirements?: readonly TRandomEventRequirement[]
  player?: Partial<TPlayerState>
  actionPoints?: number
  combatOnly?: boolean
  noEscape?: boolean
  rngState?: RngState
} = {}) {
  const event = makeRandomEventCard({
    requirements,
    goodOutcome: emptyOutcome,
    badOutcome: emptyOutcome,
    escapeThreshold: 10,
    noEscape,
  })
  const dimension = makeDimensionCard({
    id: 'fixture.test-dimension',
    eventDecks: [
      {
        zoneType: 'urban',
        cards: [
          { cardId: combat.id, copies: 1 },
          ...(combatOnly ? [] : [{ cardId: event.id, copies: 1 }]),
        ],
      },
    ],
  })
  const memberId = new UniqueEntityID('member-1')
  const member = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({ deck: [endurance.id], ...player }),
    },
    memberId
  )
  let party = makeParty({
    status: 'inSession',
    members: [member],
    hostMemberId: memberId,
    turn: { round: 1, memberId, actionPoints },
    rngState,
  })
  const repository = new InMemoryPartiesRepository()
  // O mapper de saves será exercitado na T-43.
  vi.spyOn(repository, 'findById').mockImplementation(async () => party)
  const save = vi
    .spyOn(repository, 'save')
    .mockImplementation(async (updated) => {
      party = updated
    })
  const catalog = new InMemoryCardCatalog()
  catalog.cards = [
    event,
    combat,
    dimension,
    harbor,
    strength,
    endurance,
    potion,
  ]
  const sut = new TakePartyActionUseCase(
    repository,
    fixedClock('2026-11-20T12:00:00Z'),
    catalog,
    sequentialIds()
  )
  const act = (body: unknown) =>
    sut.execute({ partyId: party.id.toString(), body })

  async function accept(body: unknown) {
    const result = await act(body)
    if (result.isLeft())
      throw new Error(`Ação recusada: ${JSON.stringify(result.value)}`)
    return result.value.party
  }

  async function refuse(body: unknown, details: object) {
    const before = party.savedAt
    const rngBefore = [...party.rngState]
    const savesBefore = save.mock.calls.length
    const result = await act(body)
    expect(result.isLeft()).toBe(true)
    expect(result.value).toMatchObject({ code: 'ACTION_NOT_ALLOWED', details })
    expect(save).toHaveBeenCalledTimes(savesBefore)
    expect(party.savedAt).toEqual(before)
    expect(party.rngState).toEqual(rngBefore)
  }

  async function start() {
    const started = await accept({ type: 'startEvent' })
    const encounter = started.randomEventEncounter
    if (!encounter) throw new Error('O encontro deveria estar aberto')
    return encounter.id
  }

  async function reveal() {
    const encounterId = await start()
    await accept({ type: 'revealEvent', encounterId })
    return encounterId
  }

  const playerState = () => party.members[0].player
  const handCopies = () => playerState().handCopies ?? []
  return {
    accept,
    refuse,
    start,
    reveal,
    party: () => party,
    playerState,
    handCopies,
    event,
  }
}

describe('TakePartyActionUseCase — encontro aleatório (T-41)', () => {
  it('REQ-111: gasta 1 PA, oculta a carta, bloqueia o fim da vez e recicla só o evento aleatório', async () => {
    const game = setup()
    const encounterId = await game.start()
    expect(game.party()).toMatchObject({
      turn: { actionPoints: 0 },
      randomEventEncounter: {
        phase: 'anticipation',
        card: null,
        requirements: [],
        escape: null,
        decisionDeadlineAt: null,
      },
    })
    expect(
      availableActions(game.party(), game.party().turn.memberId, new Set())
    ).toEqual(['revealEvent'])
    await game.refuse({ type: 'endTurn' }, { reason: 'choicePending' })
    const revealed = await game.accept({ type: 'revealEvent', encounterId })
    expect(revealed).toMatchObject({
      randomEventEncounter: { phase: 'encounter', card: { id: game.event.id } },
    })
    expect(
      availableActions(revealed, revealed.turn.memberId, new Set())
    ).toEqual(['giveUpEvent', 'resolveEvent', 'escapeEvent'])
    await game.accept({ type: 'resolveEvent', encounterId })
    await game.accept({ type: 'endTurn' })
    const recycledId = await game.reveal()
    expect(recycledId).not.toBe(encounterId)
    expect(game.party()).toMatchObject({
      randomEventEncounter: { card: { id: game.event.id } },
    })
    expect(game.party().eventDecks).toEqual([
      { zoneType: 'urban', cards: [combat.id], discard: [] },
    ])
  })

  it('REQ-111: recusa iniciar quando o deck contém apenas combate', async () => {
    const game = setup({ combatOnly: true })
    await game.refuse({ type: 'startEvent' }, { reason: 'eventDeckEmpty' })
    expect(game.party().turn.actionPoints).toBe(1)
  })

  it('REQ-112: escolhe a segunda cópia e conserva a primeira com o mesmo cardId', async () => {
    const game = setup({
      requirements: [attrs],
      player: { hand: [strength.id, strength.id] },
    })
    const encounterId = await game.reveal()
    const [first, second] = game.handCopies()
    expect(first.copyId).not.toBe(second.copyId)
    const paid = await game.accept({
      type: 'payEventRequirement',
      encounterId,
      requirementId: 'attrs',
      payment: { handCards: [second.copyId] },
    })
    expect(game.handCopies()).toEqual([first])
    expect(paid).toMatchObject({
      randomEventEncounter: {
        payments: [{ requirementId: 'attrs', handCards: [second] }],
        requirements: [
          {
            requirementId: 'attrs',
            status: 'partial',
            handCardSelection: 'choose',
            remaining: { specific: { strength: 1 }, any: 0 },
            eligibleHandCopyIds: [first.copyId],
          },
        ],
      },
    })
  })

  it('REQ-112: ativa consumível com 0 PA antes da primeira parte e recusa depois', async () => {
    const game = setup({
      requirements: [gold, vigor],
      player: { health: 10, inventory: [{ cardId: potion.id, quantity: 2 }] },
    })
    const encounterId = await game.reveal()
    const activate = {
      type: 'prepare',
      operation: 'activate',
      cardId: potion.id,
      effectIndex: 0,
    }
    const activated = await game.accept(activate)
    expect(activated).toMatchObject({
      turn: { actionPoints: 0 },
      randomEventEncounter: { phase: 'encounter', payments: [] },
    })
    expect(game.playerState()).toMatchObject({
      health: 15,
      inventory: [{ cardId: potion.id, quantity: 1 }],
    })
    await game.accept({
      type: 'payEventRequirement',
      encounterId,
      requirementId: 'gold',
    })
    await game.refuse(activate, { reason: 'eventPaymentStarted' })
    await game.refuse(
      { type: 'escapeEvent', encounterId },
      { reason: 'eventPaymentStarted' }
    )
    expect(game.playerState()).toMatchObject({
      health: 15,
      gold: 0,
      inventory: [{ cardId: potion.id, quantity: 1 }],
    })
  })

  it('REQ-112/REQ-113: sorteia uma cópia por envio e reverte a última parte e o RNG ao falhar o mínimo', async () => {
    const game = setup({
      requirements: [randomDiscard, minimum],
      player: { vigor: 4, hand: [strength.id, strength.id, endurance.id] },
    })
    const encounterId = await game.reveal()
    const action = {
      type: 'payEventRequirement',
      encounterId,
      requirementId: 'discard',
    }
    const copies = game.handCopies()
    await game.refuse(
      { ...action, payment: { handCards: [copies[0].copyId] } },
      { reason: 'paymentInvalid' }
    )

    const rng = SeededRng.fromState(game.party().rngState)
    const index = rng.nextInt(0, copies.length - 1)
    const receipt = { requirementId: 'discard', handCards: [copies[index]] }
    const remaining = copies.filter((_, position) => position !== index)
    const partial = await game.accept(action)
    expect(partial.rngState).toEqual(rng.state())
    expect(game.handCopies()).toEqual(remaining)
    expect(partial).toMatchObject({
      randomEventEncounter: {
        payments: [receipt],
        requirements: expect.arrayContaining([
          expect.objectContaining({
            requirementId: 'discard',
            status: 'partial',
            handCardSelection: 'random',
            remaining: { copies: 1 },
            eligibleHandCopyIds: [],
          }),
        ]),
      },
    })
    const refusal = {
      reason: 'eventMinimumNotMet',
      checks: [{ requirementId: 'min', stat: 'vigor', minimum: 5, actual: 4 }],
    }
    await game.refuse(action, refusal)
    await game.refuse(action, refusal)
    expect(game.handCopies()).toEqual(remaining)
    expect(game.party()).toMatchObject({
      randomEventEncounter: { phase: 'encounter', payments: [receipt] },
    })
    await game.accept({ type: 'giveUpEvent', encounterId })
    expect(game.playerState()).toMatchObject({
      lastRandomEvent: {
        resolution: 'setback',
        cause: 'gaveUp',
        payments: [receipt],
        peakDelta: -1,
        replacement: { requested: 1, drawn: 1 },
      },
    })
  })

  it.each([7, 8])(
    'REQ-113: verifica o mínimo depois do último custo com Vigor inicial %i',
    async (initialVigor) => {
      const game = setup({
        requirements: [gold, vigor, minimum],
        player: { gold: 20, vigor: initialVigor },
      })
      const encounterId = await game.reveal()
      await game.accept({
        type: 'payEventRequirement',
        encounterId,
        requirementId: 'gold',
      })
      const last = {
        type: 'payEventRequirement',
        encounterId,
        requirementId: 'vigor',
      }
      const goldReceipt = { requirementId: 'gold', gold: 10 }
      if (initialVigor === 7) {
        await game.refuse(last, {
          reason: 'eventMinimumNotMet',
          checks: [
            { requirementId: 'min', stat: 'vigor', minimum: 5, actual: 4 },
          ],
        })
        expect(game.playerState()).toMatchObject({ gold: 10, vigor: 7 })
        expect(game.party()).toMatchObject({
          randomEventEncounter: { phase: 'encounter', payments: [goldReceipt] },
        })
        return
      }
      const resolved = await game.accept(last)
      expect(resolved).toMatchObject({ randomEventEncounter: null })
      expect(game.playerState()).toMatchObject({
        gold: 10,
        vigor: 5,
        lastRandomEvent: {
          resolution: 'success',
          cause: 'requirementsMet',
          peakDelta: 1,
          payments: [goldReceipt, { requirementId: 'vigor', vigor: 3 }],
        },
      })
    }
  )

  it('REQ-113: resolveEvent verifica o mínimo mesmo sem partes pagáveis', async () => {
    const game = setup({ player: { vigor: 4 } })
    const encounterId = await game.reveal()
    await game.refuse(
      { type: 'resolveEvent', encounterId },
      {
        reason: 'eventMinimumNotMet',
        checks: [
          { requirementId: 'min', stat: 'vigor', minimum: 5, actual: 4 },
        ],
      }
    )
  })

  it.each([
    { roll: 10, actionPoints: 1, lost: 0, debt: 1, resolution: 'setback' },
    { roll: 10, actionPoints: 2, lost: 1, debt: 0, resolution: 'setback' },
    { roll: 11, actionPoints: 1, lost: 0, debt: 0, resolution: 'escaped' },
  ])(
    'REQ-114: fuga com rolagem $roll e $actionPoints PA antes de iniciar',
    async ({ roll, actionPoints, lost, debt, resolution }) => {
      const game = setup({
        player: { peak: 10, vigor: 6 },
        actionPoints,
        rngState: [0, 0, 0, roll - 1],
      })
      const encounterId = await game.reveal()
      const escaped = await game.accept({ type: 'escapeEvent', encounterId })
      expect(escaped).toMatchObject({
        randomEventEncounter: null,
        turn: { actionPoints: 0 },
      })
      expect(game.playerState()).toMatchObject({
        vigor: 4,
        nextTurnActionPointDebt: debt,
        lastRandomEvent: {
          resolution,
          peakDelta: resolution === 'escaped' ? 0 : -1,
          replacement: { requested: 0, drawn: 0 },
          escape: {
            vigorSpent: 2,
            naturalRoll: roll,
            total: roll,
            threshold: 10,
            succeeded: resolution === 'escaped',
            actionPointsLost: lost,
            nextTurnActionPointDebtAdded: debt,
          },
        },
      })
      const next = await game.accept({ type: 'endTurn' })
      expect(next.turn.actionPoints).toBe(
        next.config.actionPointsPerTurn - debt
      )
      expect(game.playerState()).toMatchObject({ nextTurnActionPointDebt: 0 })
    }
  )

  it.each([
    { noEscape: true, availableVigor: 6, reason: 'escapeForbidden' },
    { noEscape: false, availableVigor: 1, reason: 'notEnoughVigor' },
  ])(
    'REQ-114: recusa fuga com $reason sem cobrar ou rolar',
    async ({ noEscape, availableVigor, reason }) => {
      const game = setup({
        noEscape,
        player: { peak: 10, vigor: availableVigor },
      })
      const encounterId = await game.reveal()
      await game.refuse({ type: 'escapeEvent', encounterId }, { reason })
      expect(game.playerState().vigor).toBe(availableVigor)
    }
  )

  it('REQ-114: fuga automática dispensa Vigor e RNG, mas respeita Sem fuga', async () => {
    const player = { peak: 0, vigor: 0, automaticEventEscape: true }
    const game = setup({ player })
    const encounterId = await game.reveal()
    const rngBefore = [...game.party().rngState]
    await game.accept({ type: 'escapeEvent', encounterId })
    expect(game.party().rngState).toEqual(rngBefore)
    expect(game.playerState()).toMatchObject({
      vigor: 0,
      lastRandomEvent: {
        resolution: 'escaped',
        peakDelta: 0,
        escape: {
          vigorSpent: 0,
          naturalRoll: null,
          total: null,
          threshold: 10,
          succeeded: true,
          actionPointsLost: 0,
          nextTurnActionPointDebtAdded: 0,
        },
      },
    })
    const blocked = setup({ player, noEscape: true })
    const blockedId = await blocked.reveal()
    await blocked.refuse(
      { type: 'escapeEvent', encounterId: blockedId },
      { reason: 'escapeForbidden' }
    )
  })
})
