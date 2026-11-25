import { describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type {
  TCard,
  TExecutableAbility,
  TMountCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TEffect } from '@/domain/catalog/enterprise/value-objects/effect'
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
  makeItemCard,
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

// T-75 (revisão): origem da montaria nas opções do combate e nos efeitos
// disparados (REQ-157; D-148, D-150 b) e loseMount por gatilho (REQ-163).

const MEMBER = new UniqueEntityID('member-1')
const endurance = makeAttributeCard({
  id: 'fixture.endurance-basic',
  attributes: ['endurance'],
})
const harbor = makeUrbanZoneCard({ zoneActions: ['startEvent'] })
const POTION = makeItemCard({ id: 'fixture.healing-potion' })
const PONY = makeWarPonyCard()
const emptyOutcome = { text: 'Sem efeito.', steps: [] }

const onFlee = (activation: unknown, text: string) =>
  ({
    text,
    trigger: { kind: 'onCombatFleeAttempt' },
    cost: [],
    activation,
    duration: { kind: 'immediate' },
    mark: null,
  }) as unknown as TEffect

const healOnFlee = onFlee([{ kind: 'heal', amount: 1 }], 'Recupere 1 de vida.')

const passiveOnFlee: TExecutableAbility = {
  id: 'steed-calm',
  name: 'Calma',
  text: 'Recupere 1 de vida.',
  form: 'passive',
  element: null,
  cost: [],
  power: null,
  effects: [healOnFlee],
  cooldown: 0,
  timing: 'combat',
  classRestriction: [],
  usesPerTurn: 1,
  target: 'self',
  duration: null,
  channel: null,
} as TExecutableAbility

const TRIGGER_STEED = makeMountCard({
  id: 'fixture.trigger-steed',
  effects: [healOnFlee],
  abilities: [passiveOnFlee],
})
const SKITTISH = makeMountCard({
  id: 'fixture.skittish-steed',
  effects: [onFlee([{ kind: 'loseMount' }], 'Perca a montaria.')],
})

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

function setup(mount: unknown) {
  const dimension = makeDimensionCard({
    id: 'fixture.test-dimension',
    eventDecks: [
      { zoneType: 'urban', cards: [{ cardId: combatCard.id, copies: 1 }] },
    ],
  })
  const member = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({
        deck: [endurance.id],
        // Pico > 0 e Vigor para poder tentar a fuga (gatilho onCombatFleeAttempt).
        peak: 10,
        vigor: 20,
        health: 18,
        gold: 10,
        ...({ mount } as unknown as Partial<TPlayerState>),
      }),
    },
    MEMBER
  )
  let party = makeParty({
    status: 'inSession',
    members: [member],
    hostMemberId: MEMBER,
    turn: { round: 1, memberId: MEMBER, actionPoints: 1 },
    config: GAME_CONFIG_DEFAULTS,
    rewardDecks: [{ zoneType: 'urban', cards: [] }],
  })
  const repository = new InMemoryPartiesRepository()
  vi.spyOn(repository, 'findById').mockImplementation(async () => party)
  vi.spyOn(repository, 'save').mockImplementation(async (updated) => {
    party = updated
  })
  const cards: TCard[] = [
    combatCard,
    dimension,
    harbor,
    endurance,
    POTION,
    PONY,
    TRIGGER_STEED,
    SKITTISH,
  ]
  const catalog = new InMemoryCardCatalog()
  catalog.cards = cards
  const sut = new TakePartyActionUseCase(
    repository,
    fixedClock('2026-11-25T12:00:00Z'),
    catalog,
    sequentialIds()
  )

  async function accept(body: unknown) {
    const result = await sut.execute({ partyId: party.id.toString(), body })
    if (result.isLeft())
      throw new Error(`Ação recusada: ${JSON.stringify(result.value)}`)
    return result.value.party
  }

  async function reveal() {
    const started = await accept({ type: 'startEvent' })
    const encounter = started.randomEventEncounter
    if (!encounter) throw new Error('O encontro deveria estar aberto')
    await accept({ type: 'revealEvent', encounterId: encounter.id })
  }

  async function flee() {
    const state = party.combat!
    await accept({
      type: 'escapeCombat',
      combatId: state.id,
      turnId: state.turn.id,
    })
  }

  return {
    reveal,
    flee,
    party: () => party,
    cards: () => new Map(cards.map((card) => [card.id, card])),
    player: () => party.members[0].player as { mount?: unknown },
  }
}

const emptyMount = (card: TMountCard) => ({
  cardId: card.id,
  inventory: [],
  tcgFolder: [],
})

describe('Combate: origem da montaria (REQ-157, D-148)', () => {
  it("REQ-157: CombatState.effects traz o efeito ativável da montaria com origin { type: 'mount', cardId, effectIndex }", async () => {
    const game = setup(emptyMount(PONY))
    await game.reveal()

    const combat = game.party().describeCombat(game.cards())

    expect(combat?.effects).toContainEqual(
      expect.objectContaining({
        origin: { type: 'mount', cardId: PONY.id, effectIndex: 0 },
      })
    )
  })

  it("REQ-157: efeitos disparados da montaria → origin 'mount' (carta) e 'mountAbility' (habilidade) na escolha pendente", async () => {
    const game = setup(emptyMount(TRIGGER_STEED))
    await game.reveal()

    await game.flee()

    const origins = game
      .party()
      .triggeredEffectChoice?.effects.map(({ origin }) => origin)
    expect(origins).toEqual(
      expect.arrayContaining([
        { type: 'mount', cardId: TRIGGER_STEED.id, effectIndex: 0 },
        {
          type: 'mountAbility',
          cardId: TRIGGER_STEED.id,
          abilityId: passiveOnFlee.id,
          effectIndex: 0,
        },
      ])
    )
    expect(origins).toHaveLength(2)
  })
})

describe('loseMount por gatilho (REQ-163, D-150 a)', () => {
  it('REQ-163: efeito disparado com loseMount emite SentToLimbo na ordem mount → mountInventory → mountTcgFolder; mount vira null', async () => {
    const game = setup({
      cardId: SKITTISH.id,
      inventory: [{ cardId: POTION.id, quantity: 2 }],
      tcgFolder: [{ cardId: endurance.id, copies: 3 }],
    })
    await game.reveal()
    game.party().pullDomainEvents()

    await game.flee()

    expect(game.player().mount).toBeNull()
    expect(
      game
        .party()
        .pullDomainEvents()
        .filter(
          (event) =>
            event.type === 'SentToLimbo' &&
            (event as { from: string }).from.startsWith('mount')
        )
    ).toEqual([
      expect.objectContaining({
        type: 'SentToLimbo',
        memberId: MEMBER,
        cardId: SKITTISH.id,
        quantity: 1,
        from: 'mount',
      }),
      expect.objectContaining({
        type: 'SentToLimbo',
        memberId: MEMBER,
        cardId: POTION.id,
        quantity: 2,
        from: 'mountInventory',
      }),
      expect.objectContaining({
        type: 'SentToLimbo',
        memberId: MEMBER,
        cardId: endurance.id,
        quantity: 3,
        from: 'mountTcgFolder',
      }),
    ])
  })
})
