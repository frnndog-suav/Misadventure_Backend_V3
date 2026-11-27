import { describe, expect, it } from 'vitest'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type {
  TCard,
  TZoneQuestCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeCombatEventCard,
  makeDimensionCard,
  makeEffect,
  makeEnemy,
  makeItemCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import type { TCombatAction } from '../../party-action'
import { PartyMember, type TPlayerState } from '../party-member'

const now = fixedClock('2026-11-27T12:00:00Z').now()
const zone = makeZoneCard({ id: 'fixture.gray-harbor' })
const card = makeCombatEventCard({
  goodOutcome: { text: '', steps: [] },
  badOutcome: { text: '', steps: [] },
})
const cards = new Map<string, TCard>([
  [card.id, card],
  [zone.id, zone],
])

function member(
  id: string,
  kind: 'human' | 'aiHelper',
  player: Partial<TPlayerState> = {}
) {
  return PartyMember.create(
    {
      characterName: id,
      kind,
      player: makePlayerState({ zoneId: zone.id, ...player }),
    },
    new UniqueEntityID(id)
  )
}

function encounter(
  members: PartyMember[],
  initiator = members[0],
  order = members,
  battleCard = card,
  maxCombatCycles?: number,
  catalog = new Map(cards).set(battleCard.id, battleCard)
) {
  const party = makeParty({
    ...(maxCombatCycles !== undefined && {
      config: { ...makeParty().config, maxCombatCycles },
    }),
    members,
    hostMemberId: members.find(({ kind }) => kind === 'human')!.id,
    turnOrder: order.map(({ id }) => id),
    turn: { memberId: initiator.id, round: 2, actionPoints: 1 },
    eventDecks: [
      { zoneType: zone.zoneType, cards: [battleCard.id], discard: [] },
    ],
  })
  expect(
    party
      .takeEventAction(
        { type: 'startEvent' },
        zone,
        null,
        catalog,
        now,
        undefined
      )
      .isRight()
  ).toBe(true)
  const combatId = party.eventEncounter!.id
  expect(
    party
      .takeEventAction(
        { type: 'revealEvent', encounterId: combatId },
        zone,
        null,
        catalog,
        now,
        undefined
      )
      .isRight()
  ).toBe(true)
  return { party, combatId, catalog }
}

describe('REQ-186 — recrutamento de combate', () => {
  it.each(['quest', 'finalBoss'])(
    'abre o recrutamento e cobra uma vez em %s',
    (source) => {
      const quest: TZoneQuestCard = {
        type: 'zoneQuest',
        id: 'fixture.combat-quest',
        collectionId: 'fixture',
        title: 'Combate de missão',
        summary: '',
        stages: [
          {
            type: 'combatEvent',
            location: { type: 'zoneType', zoneType: zone.zoneType },
            text: '',
            combat: {
              enemies: card.enemies,
              noEscape: card.noEscape,
              goodOutcome: { text: '', steps: [] },
              badOutcome: { text: '', steps: [] },
            },
          },
        ],
        rewards: [],
      }
      const human = member('human', 'human', {
        openZoneQuests: [
          {
            questId: 'quest',
            questCardId: quest.id,
            originZoneId: zone.id,
            stageIndex: 0,
          },
        ],
      })
      const ai = member('ai', 'aiHelper')
      const party = makeParty({
        members: [human, ai],
        hostMemberId: human.id,
        turnOrder: [human.id, ai.id],
        turn: { memberId: human.id, round: 1, actionPoints: 1 },
      })
      const dimension = makeDimensionCard({
        completion: {
          zoneTitle: zone.title,
          requirement: [],
          grandPrize: { cards: [], gold: 0 },
          finalBoss: card,
        },
      })
      const catalog = new Map(cards).set(quest.id, quest)
      const result =
        source === 'quest'
          ? party.takeZoneQuestAction(
              { type: 'continueQuest', questId: 'quest' },
              catalog,
              now,
              sequentialIds(),
              dimension
            )
          : party.completeDimension(
              zone,
              dimension,
              catalog,
              now,
              sequentialIds()
            )
      expect(result.isRight()).toBe(true)
      const decision = party.pendingCombatDecision!
      expect(decision).toMatchObject({
        type: 'roster',
        candidateMemberIds: ['ai'],
      })
      expect(party.turn.actionPoints).toBe(0)
      expect(
        party
          .confirmCombatRoster(
            'human',
            decision.combatId,
            decision.id,
            [],
            catalog,
            now
          )
          .isRight()
      ).toBe(true)
      expect(party.turn.actionPoints).toBe(0)
      expect(party.combat).toMatchObject({
        id: decision.combatId,
        finalBoss: source === 'finalBoss',
      })
      if (source === 'quest')
        expect(party.questAttempt?.encounterId).toBe(decision.combatId)
    }
  )

  it('revalida os candidatos e aplica o limiar de PV com PA zero', () => {
    const { party, combatId } = encounter([
      member('human', 'human'),
      member('half', 'aiHelper', { health: 11 }),
      member('below', 'aiHelper', { health: 10 }),
      member('elsewhere', 'aiHelper', { zoneId: 'fixture.old-mine' }),
      member('down', 'aiHelper', { health: 0 }),
    ])
    const decision = party.pendingCombatDecision!
    expect(decision).toMatchObject({
      type: 'roster',
      combatId,
      memberId: 'human',
      candidateMemberIds: ['half', 'below'],
    })
    expect(party.combat).toBeNull()
    const rng = party.rngState
    const savedAt = party.savedAt
    const confirm = (ids: string[]) =>
      party.confirmCombatRoster('human', combatId, decision.id, ids, cards, now)
    for (const ids of [['half', 'half'], ['elsewhere'], ['down']]) {
      expect(confirm(ids).value).toBe('combatCandidateIneligible')
      expect(party.pendingCombatDecision).toEqual(decision)
      expect(party.turn.actionPoints).toBe(0)
      expect(party.rngState).toEqual(rng)
      expect(party.savedAt).toEqual(savedAt)
      expect(party.combatUpdates).toEqual([])
    }
    expect(confirm(['half', 'below']).isRight()).toBe(true)
    expect(party.pendingCombatDecision).toBeNull()
    expect(
      party.combatUpdates.find(({ type }) => type === 'combatRosterConfirmed')
    ).toEqual({
      type: 'combatRosterConfirmed',
      combatId,
      initiatorMemberId: 'human',
      participantMemberIds: ['human', 'half'],
      declinedMemberIds: ['below'],
    })
    expect(party.turn.actionPoints).toBe(0)
    expect(party.rngState).toEqual(rng)
    expect(confirm([]).value).toBe('combatDecisionExpired')
    expect(
      party.confirmCombatRoster('human', combatId, 'late', [], cards, now).value
    ).toBe('combatRecruitmentClosed')
    expect(party.combat?.participants?.map(({ memberId }) => memberId)).toEqual(
      ['human', 'half']
    )
  })

  it('recusa candidato projetado que mudou de zona antes da confirmação', () => {
    const human = member('human', 'human')
    const helper = member('helper', 'aiHelper')
    const { party, combatId } = encounter([human, helper])
    const restored = makeParty({
      ...party.combatSnapshot(),
      members: [
        human,
        member('helper', 'aiHelper', { zoneId: 'fixture.old-mine' }),
      ],
      hostMemberId: human.id,
      turnOrder: [human.id, helper.id],
      turn: party.turn,
      rngState: party.rngState,
    })
    const decision = restored.pendingCombatDecision!
    expect(decision).toEqual(party.pendingCombatDecision)
    expect(
      restored.confirmCombatRoster(
        'human',
        combatId,
        decision.id,
        ['helper'],
        cards,
        now
      ).value
    ).toBe('combatCandidateIneligible')
    expect(restored.pendingCombatDecision).toEqual(decision)
    expect(restored.combatUpdates).toEqual([])
  })

  it.each(['legacy', 'empty', 'declined'])(
    'usa o combate solo em %s',
    (scenario) => {
      const human = member('human', 'human')
      const { party, combatId } = encounter(
        scenario === 'legacy'
          ? [human]
          : [human, member('below', 'aiHelper', { health: 10 })]
      )
      if (scenario !== 'legacy') {
        expect(
          party
            .confirmCombatRoster(
              'human',
              combatId,
              party.pendingCombatDecision!.id,
              scenario === 'empty' ? [] : ['below'],
              cards,
              now
            )
            .isRight()
        ).toBe(true)
      }
      expect(party.combat?.id).toBe(combatId)
      expect(party.combatUpdates.slice(-3).map(({ type }) => type)).toEqual([
        'combatRosterConfirmed',
        'combatStarted',
        'combatTurnStarted',
      ])
      expect(party.turn.actionPoints).toBe(0)
    }
  )

  it.each([true, false])(
    'aguarda o humano convidado com aceite %s',
    (accept) => {
      const human = member('human', 'human', { health: 1 })
      const ai = member('ai', 'aiHelper')
      const { party, combatId } = encounter([human, ai], ai)
      const decision = party.pendingCombatDecision!
      expect(decision).toMatchObject({
        type: 'invite',
        combatId,
        memberId: 'human',
        initiatorMemberId: 'ai',
        cardTitle: card.title,
      })
      expect(party.combatUpdates.map(({ type }) => type)).toEqual([
        'combatInviteOpened',
      ])
      expect(party.eventActionBlock({ type: 'endTurn' })).toBe(
        'combatDecisionPending'
      )
      expect(
        party.respondCombatInvite('ai', combatId, 'old', accept, cards, now)
          .value
      ).toBe('combatDecisionExpired')
      expect(
        party.respondCombatInvite(
          'ai',
          combatId,
          decision.id,
          accept,
          cards,
          now
        ).value
      ).toBe('combatDecisionNotOwned')
      expect(
        party
          .respondCombatInvite(
            'human',
            combatId,
            decision.id,
            accept,
            cards,
            now
          )
          .isRight()
      ).toBe(true)
      expect(party.turn.memberId).toEqual(ai.id)
      expect(party.turn.round).toBe(2)
      expect(party.turn.actionPoints).toBe(0)
      expect(party.combatUpdates.slice(0, 3)).toMatchObject([
        { type: 'combatInviteOpened' },
        { type: 'combatInviteAnswered', accept },
        {
          type: 'combatRosterConfirmed',
          participantMemberIds: accept ? ['ai', 'human'] : ['ai'],
          declinedMemberIds: accept ? [] : ['human'],
        },
      ])
      expect(party.combat?.id).toBe(combatId)
      expect(
        party.combat?.participants?.map(({ memberId }) => memberId)
      ).toEqual(accept ? ['ai', 'human'] : undefined)
    }
  )

  it('convida todos os elegíveis na ordem fixa das vezes da campanha', () => {
    const ai = member('ai', 'aiHelper')
    const members = [
      member('half', 'aiHelper', { health: 11 }),
      member('human', 'human'),
      ai,
      member('below', 'aiHelper', { health: 10 }),
      member('elsewhere', 'aiHelper', { zoneId: 'fixture.old-mine' }),
    ]
    const { party, combatId } = encounter(members, ai, [...members].reverse())
    expect(
      party.combatUpdates.flatMap((update) =>
        update.type === 'combatInviteOpened' ? [update.inviteeMemberId] : []
      )
    ).toEqual(['below', 'human', 'half'])
    const rng = party.rngState
    expect(
      party
        .respondCombatInvite(
          'human',
          combatId,
          party.pendingCombatDecision!.id,
          true,
          cards,
          now
        )
        .isRight()
    ).toBe(true)
    expect(party.combatUpdates.at(-1)).toMatchObject({
      type: 'combatRosterConfirmed',
      participantMemberIds: ['ai', 'human', 'half'],
      declinedMemberIds: ['below'],
    })
    expect(party.rngState).toEqual(rng)
  })
})

describe('REQ-188 — ciclos de combate em grupo', () => {
  it('aceita a prioridade alternativa antes do ciclo e mantém a vez de exploração', () => {
    const human = member('human', 'human', { automaticEventEscape: true })
    const ai = member('ai', 'aiHelper', { automaticEventEscape: true })
    const { party, combatId } = encounter([human, ai], human, [ai, human])
    const roster = party.pendingCombatDecision!
    expect(
      party
        .confirmCombatRoster('human', combatId, roster.id, ['ai'], cards, now)
        .isRight()
    ).toBe(true)
    const order = party.pendingCombatDecision!
    expect(order).toMatchObject({
      type: 'order',
      defaultMemberIds: ['ai', 'human'],
      alternativeMemberOrders: [['human', 'ai']],
    })
    expect(
      party
        .confirmCombatOrder(
          'human',
          combatId,
          order.id,
          ['human', 'ai'],
          cards,
          now
        )
        .isRight()
    ).toBe(true)
    expect(
      party.combat?.order.filter((id) => id === 'human' || id === 'ai')
    ).toEqual(['human', 'ai'])
    expect(party.turn.memberId.toString()).toBe('human')
  })

  it('encerra como fuga só depois que todos saem individualmente', () => {
    const human = member('human', 'human', { automaticEventEscape: true })
    const ai = member('ai', 'aiHelper', { automaticEventEscape: true })
    const { party, combatId } = encounter([human, ai])
    const roster = party.pendingCombatDecision!
    expect(
      party
        .confirmCombatRoster('human', combatId, roster.id, ['ai'], cards, now)
        .isRight()
    ).toBe(true)
    for (const actorId of ['human', 'ai']) {
      const turn = party.combat!.turn
      expect(turn.actorId).toBe(actorId)
      expect(
        party
          .takeCombatAction(
            { type: 'escapeCombat', combatId, turnId: turn.id },
            cards,
            now
          )
          .isRight()
      ).toBe(true)
    }
    expect(party.lastCombatResult).toMatchObject({
      resolution: 'escaped',
      participants: [
        { memberId: 'human', condition: 'escaped' },
        { memberId: 'ai', condition: 'escaped' },
      ],
    })
  })
})

function combatMember(
  id: string,
  kind: 'human' | 'aiHelper',
  celerity: number,
  player: Partial<TPlayerState> = {}
) {
  return member(id, kind, {
    ...player,
    modifiers: {
      ...makePlayerState().modifiers,
      celerity,
      ...player.modifiers,
    },
  })
}

function recruit(
  { party, combatId, catalog }: ReturnType<typeof encounter>,
  ...invitees: string[]
) {
  const decision = party.pendingCombatDecision!
  expect(
    party
      .confirmCombatRoster(
        'human',
        combatId,
        decision.id,
        invitees,
        catalog,
        now
      )
      .isRight()
  ).toBe(true)
}

function combatAction(
  { party, combatId, catalog }: ReturnType<typeof encounter>,
  action:
    | { type: 'combatAttack'; targetId: string }
    | { type: 'endCombatTurn' | 'escapeCombat' }
) {
  return party.takeCombatAction(
    {
      ...action,
      combatId,
      turnId: party.combat!.turn.id,
    } satisfies TCombatAction,
    catalog,
    now
  )
}

describe('REQ-188 — alvos, nocaute, ressurreição e limite', () => {
  const enemy = makeEnemy()
  const swift = makeEnemy({
    count: 1,
    health: 1,
    modifiers: {
      ...enemy.modifiers,
      attack: 40,
      celerity: 8,
      defense: 0,
      evasion: 0,
    },
  })
  const revive = makeItemCard({
    id: 'fixture.revival',
    effects: [
      makeEffect({ activation: [{ kind: 'reviveAlly', healthPercent: 50 }] }),
    ],
  })
  const setback = makeEffect({
    cost: [],
    activation: [{ kind: 'loseGold', amount: 5 }],
  })
  const trial = makeCombatEventCard({
    enemies: [swift],
    noEscape: true,
    goodOutcome: { text: '', steps: [] },
    badOutcome: { text: '', steps: [{ type: 'effect', effect: setback }] },
  })
  it.each([true, false])(
    'adia o respawn e aplica a condição final na vitória com ressurreição %s',
    (revived) => {
      const human = combatMember('human', 'human', 9, {
        inventory: [{ cardId: revive.id, quantity: 1 }],
      })
      const helperPlayer = makePlayerState()
      const helper = combatMember('ai', 'aiHelper', 8, {
        modifiers: {
          ...helperPlayer.modifiers,
          celerity: 8,
          defense: 0,
          evasion: 0,
        },
        respawnZoneId: 'fixture.respawn',
      })
      const catalog = new Map(cards).set(trial.id, trial).set(revive.id, revive)
      const setup = encounter(
        [human, helper],
        human,
        [human, helper],
        trial,
        3,
        catalog
      )
      recruit(setup, 'ai')
      const { party, combatId } = setup
      const enemyId = party.combat!.enemies[0].id
      expect(party.combat?.order).toEqual(['human', enemyId, 'ai'])
      expect(
        combatAction(setup, { type: 'combatAttack', targetId: 'ai' }).value
      ).toBe('combatTargetUnavailable')
      expect(combatAction(setup, { type: 'endCombatTurn' }).isRight()).toBe(
        true
      )
      expect(party.combat?.turn).toMatchObject({ actorId: 'human' })
      expect(party.combat?.cycle).toBe(2)
      expect(party.combat?.participants?.[1]).toMatchObject({
        condition: 'knockedOut',
        health: 0,
      })
      expect(party.members[1].player).toMatchObject({
        zoneId: zone.id,
        peak: 10,
      })
      if (revived) {
        const option = party.combat!.effects.find(({ targetIds }) =>
          targetIds.includes('ai')
        )!
        expect(option.targetIds).toEqual(['ai'])
        expect(
          party
            .takeCombatAction(
              {
                type: 'activateCombatEffect',
                combatId,
                turnId: party.combat!.turn.id,
                effectId: option.effectId,
                targetId: 'ai',
              },
              catalog,
              now
            )
            .isRight()
        ).toBe(true)
        expect(party.combat?.participants?.[1]).toMatchObject({
          condition: 'standing',
          health: 11,
        })
      }
      expect(
        combatAction(setup, {
          type: 'combatAttack',
          targetId: enemyId,
        }).isRight()
      ).toBe(true)
      expect(party.lastCombatResult).toMatchObject({
        resolution: 'victory',
        participants: [
          { memberId: 'human', condition: 'standing' },
          {
            memberId: 'ai',
            condition: revived ? 'standing' : 'knockedOut',
            knockedOut: true,
            revived,
            respawned: !revived,
            skipsNextTurn: !revived,
          },
        ],
      })
      expect(party.members[1].player).toMatchObject({
        zoneId: revived ? zone.id : 'fixture.respawn',
        gold: 10,
      })
      if (revived) expect(party.members[1].player.peak).toBe(10)
    }
  )

  it('aplica o limite em Sem fuga e só dá revés a quem foi nocauteado', () => {
    const human = combatMember('human', 'human', 9, { vigor: 3 })
    const helper = combatMember('ai', 'aiHelper', 7, {
      modifiers: {
        ...makePlayerState().modifiers,
        celerity: 7,
        defense: 0,
        evasion: 0,
      },
    })
    const setup = encounter([human, helper], human, [human, helper], trial, 1)
    recruit(setup, 'ai')
    expect(combatAction(setup, { type: 'escapeCombat' }).value).toBe(
      'escapeForbidden'
    )
    expect(combatAction(setup, { type: 'endCombatTurn' }).isRight()).toBe(true)
    expect(setup.party.lastCombatResult).toMatchObject({
      resolution: 'defeat',
      cause: 'cycleLimit',
      participants: [
        {
          memberId: 'human',
          condition: 'escaped',
          peakDelta: -setup.party.config.combatEscapePeakLoss,
          vigorDelta: 0,
        },
        { memberId: 'ai', condition: 'knockedOut', respawned: true },
      ],
    })
    expect(setup.party.members.map(({ player }) => player.gold)).toEqual([
      10, 5,
    ])
    expect(setup.party.members[0].player.vigor).toBe(3)
  })
})

describe('REQ-188 — ordem recalculada e ataques inimigos', () => {
  it.each([true, false])(
    'mantém a prioridade %s e reaplica a Celeridade no ciclo seguinte',
    (alternative) => {
      const fast = combatMember('fast', 'aiHelper', 8, {
        statuses: [
          {
            statusId: 'speed',
            sourceCardId: 'fixture.speed',
            effectIndex: 0,
            text: '',
            mark: 'buff',
            activation: [
              {
                kind: 'modifierFlat',
                changes: [{ modifier: 'celerity', amount: 4 }],
              },
            ],
            duration: { kind: 'forCombatCycles', cycles: 1 },
            remaining: 1,
          },
        ],
      })
      const helper = combatMember('ai', 'aiHelper', 8)
      const human = combatMember('human', 'human', 8)
      const setup = encounter([human, fast, helper], human, [
        fast,
        helper,
        human,
      ])
      recruit(setup, 'fast', 'ai')
      const { party, combatId, catalog } = setup
      const decision = party.pendingCombatDecision!
      expect(decision).toMatchObject({
        type: 'order',
        defaultMemberIds: ['fast', 'ai', 'human'],
        alternativeMemberOrders: [['human', 'fast', 'ai']],
      })
      const priority = alternative
        ? ['human', 'fast', 'ai']
        : ['fast', 'ai', 'human']
      const snapshot = party.combatSnapshot()
      const rng = party.rngState
      expect(
        party.confirmCombatOrder(
          'human',
          combatId,
          decision.id,
          ['human', 'ai', 'fast'],
          catalog,
          now
        ).value
      ).toBe('combatOrderInvalid')
      expect(party.combatSnapshot()).toEqual(snapshot)
      expect(party.rngState).toEqual(rng)
      expect(
        party
          .confirmCombatOrder(
            'human',
            combatId,
            decision.id,
            priority,
            catalog,
            now
          )
          .isRight()
      ).toBe(true)
      const first = alternative ? ['fast', 'human', 'ai'] : priority
      for (const actorId of first) {
        expect(party.combat?.turn.actorId).toBe(actorId)
        expect(combatAction(setup, { type: 'endCombatTurn' }).isRight()).toBe(
          true
        )
      }
      expect(party.combat?.cycle).toBe(2)
      expect(party.combat?.order.slice(0, 3)).toEqual(priority)
    }
  )

  it('inicia com a prioridade da campanha quando o humano ficou fora do elenco', () => {
    const first = combatMember('first', 'aiHelper', 8)
    const initiator = combatMember('initiator', 'aiHelper', 8)
    const human = combatMember('human', 'human', 8, { zoneId: 'fixture.away' })
    const { party } = encounter([human, first, initiator], initiator, [
      human,
      first,
      initiator,
    ])
    expect(party.pendingCombatDecision).toBeNull()
    expect(party.combat?.order.slice(0, 2)).toEqual(['first', 'initiator'])
    expect(party.turn.memberId.toString()).toBe('initiator')
  })

  it('cobra a tentativa, concede um ataque livre e reserva o revés para quem cai', () => {
    const human = combatMember('human', 'human', 9, {
      modifiers: { ...makePlayerState().modifiers, celerity: 9, evasion: 0 },
    })
    const helper = combatMember('ai', 'aiHelper', 8, {
      automaticEventEscape: true,
    })
    const enemy = makeEnemy()
    const trial = makeCombatEventCard({
      enemies: [
        makeEnemy({
          count: 1,
          modifiers: { ...enemy.modifiers, attack: 20, celerity: 7 },
        }),
      ],
      escapeThreshold: 20,
      goodOutcome: { text: '', steps: [] },
      badOutcome: {
        text: '',
        steps: [
          {
            type: 'effect',
            effect: makeEffect({
              cost: [],
              activation: [{ kind: 'loseGold', amount: 5 }],
            }),
          },
        ],
      },
    })
    const setup = encounter([human, helper], human, [human, helper], trial)
    recruit(setup, 'ai')
    const { party } = setup
    const enemyId = party.combat!.enemies[0].id
    expect(combatAction(setup, { type: 'escapeCombat' }).isRight()).toBe(true)
    const attempt = party.combatUpdates.find(
      ({ type }) => type === 'combatEscapeAttempted'
    )
    expect(attempt).toMatchObject({ actorId: 'human', succeeded: false })
    expect(attempt?.type).toBe('combatEscapeAttempted')
    if (attempt?.type === 'combatEscapeAttempted')
      expect(party.members[0].player.vigor).toBe(10 - attempt.vigorSpent)
    expect(
      party.combatUpdates.filter(({ type }) => type === 'combatDamageResolved')
    ).toMatchObject([{ actorId: enemyId, targetId: 'human', targetHealth: 7 }])
    expect(party.combat?.turn.actorId).toBe('ai')
    expect(combatAction(setup, { type: 'escapeCombat' }).isRight()).toBe(true)
    expect(
      party.combatUpdates.filter(({ type }) => type === 'combatDamageResolved')
    ).toMatchObject([
      { actorId: enemyId, targetId: 'human', targetHealth: 7 },
      { actorId: enemyId, targetId: 'human', targetHealth: 0 },
    ])
    expect(party.lastCombatResult).toMatchObject({
      resolution: 'defeat',
      cause: 'playerDown',
      participants: [
        { memberId: 'human', condition: 'knockedOut', respawned: true },
        { memberId: 'ai', condition: 'escaped', respawned: false },
      ],
    })
    expect(party.members.map(({ player }) => player.gold)).toEqual([5, 10])
  })

  it('atinge os combatentes de pé com uma única habilidade de área e preserva o ataque básico', () => {
    const human = combatMember('human', 'human', 9)
    const helper = combatMember('ai', 'aiHelper', 8)
    const enemy = makeEnemy()
    const trial = makeCombatEventCard({
      enemies: [
        makeEnemy({
          count: 1,
          modifiers: {
            ...enemy.modifiers,
            attack: 6,
            celerity: 10,
            accuracy: 500,
          },
          abilities: [
            {
              id: 'sweep',
              name: 'Varredura',
              text: '',
              form: 'area',
              target: 'allOpponents',
              element: null,
              cost: [],
              power: 9,
              effects: [],
              cooldown: 0,
              timing: 'combat',
              classRestriction: [],
              usesPerTurn: 1,
              duration: null,
              channel: null,
            },
          ],
        }),
      ],
      goodOutcome: { text: '', steps: [] },
      badOutcome: { text: '', steps: [] },
    })
    const setup = encounter([human, helper], human, [human, helper], trial)
    recruit(setup, 'ai')
    expect(
      setup.party.combatUpdates.filter(
        ({ type }) => type === 'combatAbilityUsed'
      )
    ).toHaveLength(1)
    expect(
      setup.party.combatUpdates.filter(
        ({ type }) => type === 'combatDamageResolved'
      )
    ).toMatchObject([
      { source: 'ability', targetId: 'human', targetHealth: 17 },
      { source: 'ability', targetId: 'ai', targetHealth: 17 },
      { source: 'attack', targetId: 'human' },
    ])
  })
})

describe('REQ-188 — encerramento sem dano e turno de inimigo pulado', () => {
  it('classifica o limite como fuga quando todos seguem de pé', () => {
    const human = combatMember('human', 'human', 8, { vigor: 4 })
    const helper = combatMember('ai', 'aiHelper', 8, { vigor: 3 })
    const enemy = makeEnemy()
    const trial = makeCombatEventCard({
      noEscape: true,
      enemies: [
        makeEnemy({ count: 1, modifiers: { ...enemy.modifiers, accuracy: 0 } }),
      ],
      goodOutcome: { text: '', steps: [] },
      badOutcome: { text: '', steps: [] },
    })
    const setup = encounter([human, helper], human, [human, helper], trial, 1)
    recruit(setup, 'ai')
    const rng = setup.party.rngState
    for (const actorId of ['human', 'ai']) {
      expect(setup.party.combat?.turn.actorId).toBe(actorId)
      expect(combatAction(setup, { type: 'endCombatTurn' }).isRight()).toBe(
        true
      )
    }
    expect(setup.party.lastCombatResult).toMatchObject({
      cause: 'cycleLimit',
      resolution: 'escaped',
      participants: [
        {
          memberId: 'human',
          condition: 'escaped',
          peakDelta: -2,
          vigorDelta: 0,
        },
        { memberId: 'ai', condition: 'escaped', peakDelta: -2, vigorDelta: 0 },
      ],
    })
    expect(
      setup.party.combatUpdates.filter(
        ({ type }) => type === 'combatEscapeAttempted'
      )
    ).toEqual([])
    expect(setup.party.rngState).toEqual(rng)
  })

  it('pula o turno do inimigo afetado antes de passar ao ajudante', () => {
    const item = makeItemCard({
      id: 'fixture.skip-enemy',
      effects: [
        makeEffect({ activation: [{ kind: 'skipEnemyTurn', count: 1 }] }),
      ],
    })
    const human = combatMember('human', 'human', 9, {
      inventory: [{ cardId: item.id, quantity: 1 }],
    })
    const helper = combatMember('ai', 'aiHelper', 4)
    const trial = makeCombatEventCard({
      ...card,
      enemies: [makeEnemy({ count: 1 })],
    })
    const catalog = new Map(cards).set(trial.id, trial).set(item.id, item)
    const setup = encounter(
      [human, helper],
      human,
      [human, helper],
      trial,
      2,
      catalog
    )
    recruit(setup, 'ai')
    const { party, combatId } = setup
    const { turn, effects, enemies } = party.combat!
    const enemyId = enemies[0].id
    expect(effects[0].targetIds).toEqual([enemyId])
    expect(
      party
        .takeCombatAction(
          {
            type: 'activateCombatEffect',
            combatId,
            turnId: turn.id,
            effectId: effects[0].effectId,
            targetId: enemyId,
          },
          catalog,
          now
        )
        .isRight()
    ).toBe(true)
    expect(combatAction(setup, { type: 'endCombatTurn' }).isRight()).toBe(true)
    expect(party.combat?.turn.actorId).toBe('ai')
    expect(
      party.combatUpdates.filter(({ type }) => type === 'combatDamageResolved')
    ).toEqual([])
  })
})
