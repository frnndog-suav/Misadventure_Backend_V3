import { describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type {
  TCard,
  TExecutableAbility,
} from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  PartyMember,
  type TPlayerState,
} from '../../../enterprise/entities/party-member'
import {
  makeAttributeCard,
  makeCombatEventCard,
  makeDimensionCard,
  makeEnemy,
  makeMountCard,
  makeUrbanZoneCard,
  makeWarPonyCard,
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

// T-75: habilidade da montaria na Preparar e no combate (REQ-157; D-148, D-150 b).

const strength = makeAttributeCard()
const endurance = makeAttributeCard({
  id: 'fixture.endurance-basic',
  attributes: ['endurance'],
})
const harbor = makeUrbanZoneCard({ zoneActions: ['startEvent'] })
const PONY = makeWarPonyCard()
const emptyOutcome = { text: 'Sem efeito.', steps: [] }

const charge: TExecutableAbility = {
  id: 'steed-charge',
  name: 'Investida',
  text: 'Recupere 1 de vida.',
  form: 'targeted',
  element: null,
  cost: [],
  power: null,
  effects: [
    {
      text: 'Recupere 1 de vida.',
      trigger: null,
      cost: [],
      activation: [{ kind: 'heal', amount: 1 }],
      duration: { kind: 'immediate' },
      mark: null,
    },
  ],
  cooldown: 0,
  timing: 'combat',
  classRestriction: [],
  usesPerTurn: 1,
  target: 'self',
  duration: null,
  channel: null,
}
const STEED = makeMountCard({ id: 'fixture.test-steed', abilities: [charge] })

const enemy = makeEnemy({ count: 1, health: 30 })
const combatCard = makeCombatEventCard({
  goodOutcome: emptyOutcome,
  badOutcome: emptyOutcome,
  enemies: [
    {
      ...enemy,
      modifiers: { ...enemy.modifiers, attack: 0, defense: 0, celerity: 0 },
    },
  ],
})

function setup(player: Partial<TPlayerState> & { mount?: unknown } = {}) {
  const dimension = makeDimensionCard({
    id: 'fixture.test-dimension',
    eventDecks: [
      { zoneType: 'urban', cards: [{ cardId: combatCard.id, copies: 1 }] },
    ],
  })
  const memberId = new UniqueEntityID('member-1')
  const member = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({
        deck: [endurance.id],
        peak: 0,
        health: 18,
        ...(player as Partial<TPlayerState>),
      }),
    },
    memberId
  )
  let party = makeParty({
    status: 'inSession',
    members: [member],
    hostMemberId: memberId,
    turn: { round: 1, memberId, actionPoints: 1 },
    config: GAME_CONFIG_DEFAULTS,
    rewardDecks: [{ zoneType: 'urban', cards: [] }],
  })
  const repository = new InMemoryPartiesRepository()
  vi.spyOn(repository, 'findById').mockImplementation(async () => party)
  const save = vi
    .spyOn(repository, 'save')
    .mockImplementation(async (updated) => {
      party = updated
    })
  const catalog = new InMemoryCardCatalog()
  const cards: TCard[] = [
    combatCard,
    dimension,
    harbor,
    strength,
    endurance,
    PONY,
    STEED,
  ]
  catalog.cards = cards
  const sut = new TakePartyActionUseCase(
    repository,
    fixedClock('2026-11-25T12:00:00Z'),
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

  async function refuse(body: unknown, expected: object) {
    const before = party.savedAt
    const rngBefore = [...party.rngState]
    const playerBefore = party.members[0].player
    const savesBefore = save.mock.calls.length
    let result: Awaited<ReturnType<typeof act>> | undefined
    await expect(
      (async () => {
        result = await act(body)
      })()
    ).resolves.toBeUndefined()
    expect(result?.isLeft()).toBe(true)
    expect(result?.value).toMatchObject(expected)
    expect(save).toHaveBeenCalledTimes(savesBefore)
    expect(party.savedAt).toEqual(before)
    expect(party.rngState).toEqual(rngBefore)
    expect(party.members[0].player).toEqual(playerBefore)
  }

  async function reveal() {
    const started = await accept({ type: 'startEvent' })
    const encounter = started.randomEventEncounter
    if (!encounter) throw new Error('O encontro deveria estar aberto')
    await accept({ type: 'revealEvent', encounterId: encounter.id })
  }

  return {
    accept,
    refuse,
    reveal,
    party: () => party,
    cards: () => new Map(cards.map((card) => [card.id, card])),
    player: () => party.members[0].player,
  }
}

const usePony = {
  type: 'prepare',
  operation: 'useAbility',
  abilityId: 'pony-rest',
  mountAbility: true,
}

describe('Preparar: useAbility da montaria (REQ-157)', () => {
  it('REQ-157: com a montaria, a habilidade fora de combate cura 1, sem gastar PA nem usar o RNG', async () => {
    const game = setup({
      mount: { cardId: PONY.id, inventory: [], tcgFolder: [] },
    })
    const rngState = game.party().rngState

    const used = await game.accept(usePony)

    expect(used.turn.actionPoints).toBe(1)
    expect(game.player().health).toBe(19)
    expect(game.party().rngState).toEqual(rngState)
    // Usos por vez: a segunda vez na mesma vez é recusada pela FEAT-13.
    expect(game.party().adventureAbilityOptions(game.cards())).toEqual([])
  })

  it('REQ-157: sem montaria → 409 noMount', async () => {
    const game = setup()

    await game.refuse(usePony, {
      code: 'ACTION_NOT_ALLOWED',
      details: { reason: 'noMount' },
    })
  })

  it('REQ-157: noMount vem antes das recusas da FEAT-13 (habilidade inexistente)', async () => {
    const game = setup()

    await game.refuse(
      { ...usePony, abilityId: 'does-not-exist' },
      { code: 'ACTION_NOT_ALLOWED', details: { reason: 'noMount' } }
    )
  })

  it('REQ-157: com montaria, habilidade que ela não tem → recusa da FEAT-13 (combatAbilityUnavailable)', async () => {
    const game = setup({
      mount: { cardId: PONY.id, inventory: [], tcgFolder: [] },
    })

    await game.refuse(
      { ...usePony, abilityId: 'does-not-exist' },
      {
        code: 'ACTION_NOT_ALLOWED',
        details: { reason: 'combatAbilityUnavailable' },
      }
    )
  })

  it('REQ-157: equipmentSlot e mountAbility juntos → ACTION_INVALID', async () => {
    const game = setup({
      mount: { cardId: PONY.id, inventory: [], tcgFolder: [] },
    })

    await game.refuse(
      { ...usePony, equipmentSlot: 'weapon' },
      { code: 'ACTION_INVALID' }
    )
  })
})

describe('Combate: useAbility da montaria (REQ-157, D-150 b)', () => {
  it('REQ-157: CombatState.abilities traz a habilidade com mountAbility: true; abilityStates com equipmentSlot null e mountAbility true', async () => {
    const game = setup({
      mount: { cardId: STEED.id, inventory: [], tcgFolder: [] },
    })
    await game.reveal()

    const combat = game.party().describeCombat(game.cards())

    expect(combat?.turn).toMatchObject({
      actorId: combat?.memberId,
      phase: 'prepare',
    })
    expect(combat?.abilities).toEqual([
      expect.objectContaining({ abilityId: charge.id, mountAbility: true }),
    ])
    expect(combat?.abilities[0]).not.toHaveProperty('equipmentSlot')
    expect(combat?.abilityStates).toContainEqual(
      expect.objectContaining({
        actorId: game.party().combat?.memberId,
        abilityId: charge.id,
        equipmentSlot: null,
        mountAbility: true,
      })
    )
  })

  it('REQ-157: useAbility com mountAbility: true cura 1 e emite combatAbilityUsed com mountAbility: true', async () => {
    const game = setup({
      mount: { cardId: STEED.id, inventory: [], tcgFolder: [] },
    })
    await game.reveal()
    const state = game.party().combat!

    await game.accept({
      type: 'useAbility',
      combatId: state.id,
      turnId: state.turn.id,
      abilityId: charge.id,
      mountAbility: true,
    })

    expect(game.player().health).toBe(19)
    // AMBÍGUO: o contrato não diz o `equipmentSlot` do combatAbilityUsed da montaria; só `mountAbility`.
    expect(game.party().combatUpdates).toContainEqual(
      expect.objectContaining({
        type: 'combatAbilityUsed',
        abilityId: charge.id,
        mountAbility: true,
      })
    )
  })

  it('REQ-157: sem montaria, useAbility com mountAbility: true no combate → noMount', async () => {
    const game = setup()
    await game.reveal()
    const state = game.party().combat!

    await game.refuse(
      {
        type: 'useAbility',
        combatId: state.id,
        turnId: state.turn.id,
        abilityId: charge.id,
        mountAbility: true,
      },
      { code: 'ACTION_NOT_ALLOWED', details: { reason: 'noMount' } }
    )
  })
})
