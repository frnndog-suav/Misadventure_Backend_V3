import { describe, expect, it } from 'vitest'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type {
  TCard,
  TZoneQuestCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeCombatEventCard,
  makeDimensionCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
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
  order = members
) {
  const party = makeParty({
    members,
    hostMemberId: members.find(({ kind }) => kind === 'human')!.id,
    turnOrder: order.map(({ id }) => id),
    turn: { memberId: initiator.id, round: 2, actionPoints: 1 },
    eventDecks: [{ zoneType: zone.zoneType, cards: [card.id], discard: [] }],
  })
  expect(
    party
      .takeEventAction(
        { type: 'startEvent' },
        zone,
        null,
        cards,
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
        cards,
        now,
        undefined
      )
      .isRight()
  ).toBe(true)
  return { party, combatId }
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
    expect(party.combatUpdates.at(-1)).toEqual({
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
    expect(party.combatSnapshot().combatRecruitment).toMatchObject({
      phase: 'confirmed',
      participantMemberIds: ['human', 'half'],
    })
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
      expect(party.combat?.id ?? null).toBe(accept ? null : combatId)
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
