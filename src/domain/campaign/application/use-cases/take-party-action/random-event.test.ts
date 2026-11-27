import { describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng, type RngState } from '@/core/rng/seeded-rng'
import type {
  TCard,
  TExecutableAbility,
  TRandomEventRequirement,
  TZoneQuestCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { availableActions } from '../../../enterprise/available-actions'
import type { TAutomaticTurnEvent } from '../../../enterprise/ai-turn/public-events'
import { shuffle } from '../../../enterprise/shuffle'
import {
  PartyMember,
  type TPlayerState,
} from '../../../enterprise/entities/party-member'
import {
  makeAttributeCard,
  makeCombatEventCard,
  makeDimensionCard,
  makeEffect,
  makeEnemy,
  makeEquipmentCard,
  makeItemCard,
  makeMountCard,
  makeRandomEventCard,
  makeUrbanZoneCard,
  makeZoneEffect,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'
import { GetPartyUseCase } from '../get-party'
import { ListPartiesUseCase } from '../list-parties'
import { ResumeLegacyKnockout } from '../resume-legacy-knockout'
import { StartSessionUseCase } from '../start-session'
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
const ore = makeItemCard({ id: 'fixture.ore', itemCategory: 'material' })
const spare = makeItemCard({ id: 'fixture.spare', itemCategory: 'material' })
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

function executableAbility(
  overrides: Partial<TExecutableAbility> = {}
): TExecutableAbility {
  return {
    id: 'fixture.ability',
    name: 'Habilidade de teste',
    text: 'Habilidade de teste.',
    form: 'targeted',
    element: null,
    cost: [],
    power: null,
    effects: [],
    cooldown: 0,
    timing: 'combat',
    classRestriction: [],
    usesPerTurn: 1,
    target: 'self',
    duration: null,
    channel: null,
    ...overrides,
  }
}

function triggeredEffectChoiceOf(party: ReturnType<typeof makeParty>) {
  const { triggeredEffectChoice } = party as typeof party & {
    triggeredEffectChoice?: {
      choiceId: string
      effects: { effectId: string; mode: 'automatic' | 'optional' }[]
    } | null
  }
  if (!triggeredEffectChoice) throw new Error('Era esperada uma escolha aberta')
  return triggeredEffectChoice
}

describe('TakePartyActionUseCase — habilidades e IA (T-47)', () => {
  it.each([
    { attack: 4, charges: 1, remainingHealth: 19 },
    { attack: 5, charges: 0, remainingHealth: 30 },
  ])(
    'REQ-119: dano $attack deixa $charges carga(s) de Canalizada',
    async ({ attack, charges, remainingHealth }) => {
      const ability = executableAbility({
        form: 'channeled',
        target: 'allOpponents',
        channel: { chargesRequired: 2, releaseForm: 'area' },
        power: 16,
      })
      const weapon = makeEquipmentCard({ abilities: [ability], modifiers: [] })
      const enemy = makeEnemy({ count: 1, health: 30 })
      const combatCard = makeCombatEventCard({
        goodOutcome: emptyOutcome,
        badOutcome: emptyOutcome,
        enemies: [
          { ...enemy, modifiers: { ...enemy.modifiers, attack, defense: 0 } },
        ],
      })
      const player = makePlayerState()
      const game = setup({
        combatOnly: true,
        combatCard,
        additionalCards: [weapon],
        player: {
          peak: 0,
          health: 20,
          equipment: { ...player.equipment, weapon: weapon.id },
          modifiers: { ...player.modifiers, defense: 0, evasion: 0 },
        },
      })
      await game.reveal()
      const state = game.party().combat!
      const useAbility = {
        type: 'useAbility',
        combatId: state.id,
        turnId: state.turn.id,
        abilityId: ability.id,
        equipmentSlot: 'weapon',
      }
      const charged = await game.accept(useAbility)
      expect(charged.combat).toMatchObject({
        turn: { id: state.turn.id },
        enemies: [{ health: 30 }],
        abilityStates: expect.arrayContaining([
          expect.objectContaining({ abilityId: ability.id, charges: 1 }),
        ]),
      })
      const next = await game.accept({
        type: 'endCombatTurn',
        combatId: state.id,
        turnId: state.turn.id,
      })
      expect(next.members[0].player.health).toBe(20 - attack)
      expect(next.combat).toMatchObject({
        abilityStates: expect.arrayContaining([
          expect.objectContaining({ abilityId: ability.id, charges }),
        ]),
      })
      const releasedOrRecharged = await game.accept({
        ...useAbility,
        turnId: next.combat!.turn.id,
      })
      expect(releasedOrRecharged.combat).toMatchObject({
        enemies: [{ health: remainingHealth }],
      })
    }
  )

  it.each([
    { element: 'fire', enemyEffect: null, remainingHealth: 12 },
    { element: null, enemyEffect: null, remainingHealth: 19 },
    { element: null, enemyEffect: 'healOnDamage', remainingHealth: 21 },
    { element: null, enemyEffect: 'defenseWhileAlone', remainingHealth: 21 },
  ] as const)(
    'REQ-119: acerto elemental (alvo $element, efeito inimigo $enemyEffect)',
    async ({ element, enemyEffect, remainingHealth }) => {
      const ability = executableAbility({
        form: 'area',
        target: 'allOpponents',
        element: 'water',
        power: 16,
        effects: [
          makeEffect({
            trigger: { kind: 'onElementalAdvantageHit' },
            cost: [],
            activation: [{ kind: 'effectDamage', amount: 4 }],
          }),
        ],
      })
      const weapon = makeEquipmentCard({ abilities: [ability], modifiers: [] })
      const enemy = makeEnemy({
        count: 1,
        health: 30,
        element,
        abilities: enemyEffect
          ? [
              executableAbility({
                form: 'passive',
                effects: [
                  enemyEffect === 'healOnDamage'
                    ? makeEffect({
                        trigger: {
                          kind: 'onElementDamageTaken',
                          element: 'water',
                        },
                        cost: [],
                        activation: [{ kind: 'heal', amount: 2 }],
                      })
                    : makeEffect({
                        trigger: {
                          kind: 'whileEnemyCount',
                          count: 1,
                          op: 'eq',
                        },
                        cost: [],
                        activation: [
                          {
                            kind: 'modifierFlat',
                            changes: [{ modifier: 'defense', amount: 4 }],
                          },
                        ],
                      }),
                ],
              }),
            ]
          : [],
      })
      const combatCard = makeCombatEventCard({
        goodOutcome: emptyOutcome,
        badOutcome: emptyOutcome,
        enemies: [
          {
            ...enemy,
            modifiers: { ...enemy.modifiers, defense: 0, celerity: 0 },
          },
        ],
      })
      const game = setup({
        combatOnly: true,
        combatCard,
        additionalCards: [weapon],
        player: {
          peak: 0,
          equipment: { ...makePlayerState().equipment, weapon: weapon.id },
        },
      })

      await game.reveal()
      const state = game.party().combat!
      const used = await game.accept({
        type: 'useAbility',
        combatId: state.id,
        turnId: state.turn.id,
        abilityId: ability.id,
        equipmentSlot: 'weapon',
      })

      expect(used.combat).toMatchObject({
        enemies: [{ health: remainingHealth }],
      })
    }
  )

  it('REQ-119: valida o lote antes de cobrar e resolve gatilhos da dimensão, zona e jogador em ordem na antecipação', async () => {
    const ability = executableAbility({
      timing: 'outsideCombat',
      cost: [
        { kind: 'payGold', amount: 2 },
        {
          ...randomDiscard,
          requirements: [{ attribute: 'any', count: 1 }],
          random: false,
        },
      ],
    })
    const trigger = {
      kind: 'onAbilityUsed',
      slots: ['weapon'],
      excludeSlots: [],
      tags: [],
      cardId: null,
    } as const
    const weapon = makeEquipmentCard({
      abilities: [ability],
      effects: [
        makeEffect({
          trigger,
          cost: [],
          activation: [{ kind: 'heal', amount: 1 }],
        }),
      ],
    })
    const game = setup({
      additionalCards: [weapon],
      dimensionEffects: [
        makeZoneEffect({
          trigger,
          polarity: 'positive',
          activation: [{ kind: 'heal', amount: 5 }],
        }),
      ],
      zone: {
        ...harbor,
        effects: [
          makeZoneEffect({
            trigger,
            activation: [{ kind: 'loseLife', amount: 3 }],
          }),
        ],
      },
      player: {
        peak: 0,
        health: 17,
        hand: [strength.id],
        equipment: { ...makePlayerState().equipment, weapon: weapon.id },
      },
    })
    await game.start()
    const [copy] = game.handCopies()
    const useAbility = {
      type: 'prepare',
      operation: 'useAbility',
      equipmentSlot: 'weapon',
      abilityId: ability.id,
    }
    await game.refuse(
      { ...useAbility, payment: { handCards: ['missing-copy'] } },
      { reason: 'paymentInvalid' }
    )
    expect(game.playerState()).toMatchObject({ gold: 10, health: 17 })
    expect(game.handCopies()).toEqual([copy])
    const used = await game.accept({
      ...useAbility,
      payment: { handCards: [copy.copyId] },
    })
    expect(used.turn.actionPoints).toBe(0)
    expect(game.playerState()).toMatchObject({
      gold: 8,
      health: 18,
      discard: [strength.id],
      deck: [endurance.id],
    })
    expect(game.handCopies()).toEqual([])
  })

  it.each([
    { decision: 'pay', gold: 9, health: 17 },
    { decision: 'decline', gold: 10, health: 15 },
    { decision: 'automaticFirst', gold: 1, health: 17 },
  ] as const)(
    'REQ-119: escolha de efeito disparado na antecipação ($decision)',
    async ({ decision, gold, health }) => {
      const trigger = {
        kind: 'onAbilityUsed',
        slots: ['weapon'],
        excludeSlots: [],
        tags: [],
        cardId: null,
      } as const
      const ability = executableAbility({ timing: 'outsideCombat' })
      const passive = executableAbility({
        id: 'fixture.passive',
        form: 'passive',
        timing: 'both',
        effects: [
          makeEffect({
            trigger,
            cost: [
              {
                kind: 'payGold',
                amount: decision === 'automaticFirst' ? 11 : 1,
              },
            ],
            activation: [{ kind: 'heal', amount: 2 }],
          }),
          ...(decision === 'automaticFirst'
            ? [
                makeEffect({
                  trigger,
                  cost: [],
                  activation: [{ kind: 'gainGold', amount: 2 }],
                }),
              ]
            : []),
        ],
      })
      const weapon = makeEquipmentCard({ abilities: [ability, passive] })
      const game = setup({
        additionalCards: [weapon],
        player: {
          peak: 0,
          health: 15,
          equipment: { ...makePlayerState().equipment, weapon: weapon.id },
        },
      })
      await game.start()
      expect(game.playerState()).toMatchObject({ health: 15, gold: 10 })

      await game.accept({
        type: 'prepare',
        operation: 'useAbility',
        equipmentSlot: 'weapon',
        abilityId: ability.id,
      })

      expect(game.playerState()).toMatchObject({ health: 15, gold: 10 })
      const paused = game.party()
      expect(availableActions(paused, paused.turn.memberId, new Set())).toEqual(
        ['resolveTriggeredEffect']
      )
      const choice = triggeredEffectChoiceOf(paused)
      expect(choice).toMatchObject({
        memberId: paused.turn.memberId.toString(),
        decisionDeadlineAt: null,
      })
      const optional = choice.effects.find(({ mode }) => mode === 'optional')!
      const command = {
        type: 'resolveTriggeredEffect',
        choiceId: choice.choiceId,
        effectId: optional.effectId,
      }
      if (decision === 'automaticFirst') {
        expect(optional).toMatchObject({ canPay: false })
        await game.refuse(
          { ...command, decision: 'pay' },
          { reason: 'paymentInvalid' }
        )
        expect(triggeredEffectChoiceOf(game.party())).toEqual(choice)
        const automatic = choice.effects.find(
          ({ mode }) => mode === 'automatic'
        )!
        await game.accept({
          ...command,
          effectId: automatic.effectId,
          decision: 'resolve',
        })
        expect(game.playerState().gold).toBe(12)
        const next = triggeredEffectChoiceOf(game.party())
        expect(next.choiceId).not.toBe(choice.choiceId)
        expect(next.effects).toEqual([
          expect.objectContaining({
            effectId: optional.effectId,
            canPay: true,
          }),
        ])
        await game.refuse(
          { ...command, decision: 'pay' },
          { reason: 'staleTriggeredEffectChoice' }
        )
        expect(triggeredEffectChoiceOf(game.party())).toEqual(next)
        await game.accept({
          ...command,
          choiceId: next.choiceId,
          decision: 'pay',
        })
      } else {
        await game.accept({ ...command, decision })
      }
      expect(game.playerState()).toMatchObject({ health, gold })
      expect(game.party()).toMatchObject({ triggeredEffectChoice: null })
      await game.refuse(
        { ...command, decision: 'decline' },
        { reason: 'staleTriggeredEffectChoice' }
      )
      expect(game.playerState()).toMatchObject({ health, gold })
    }
  )

  it('REQ-119: escolha de efeito disparado pausa e retoma o turno inimigo', async () => {
    const passive = executableAbility({
      form: 'passive',
      effects: [
        makeEffect({
          trigger: { kind: 'onElementDamageTaken', element: 'fire' },
          cost: [{ kind: 'payGold', amount: 1 }],
          activation: [{ kind: 'heal', amount: 1 }],
        }),
      ],
    })
    const weapon = makeEquipmentCard({ abilities: [passive], modifiers: [] })
    const enemy = makeEnemy({ count: 1, health: 30 })
    const combatCard = makeCombatEventCard({
      goodOutcome: emptyOutcome,
      badOutcome: emptyOutcome,
      enemies: [
        {
          ...enemy,
          abilities: [
            executableAbility({
              target: 'opponent',
              element: 'fire',
              power: 0,
            }),
          ],
          combatRules: { abilityPriority: ['highestPower'] },
          modifiers: { ...enemy.modifiers, attack: 2, celerity: 12 },
        },
      ],
    })
    const player = makePlayerState()
    const game = setup({
      combatOnly: true,
      combatCard,
      additionalCards: [weapon],
      player: {
        peak: 0,
        health: 20,
        equipment: { ...player.equipment, weapon: weapon.id },
        modifiers: { ...player.modifiers, defense: 0, evasion: 0 },
      },
    })

    await game.reveal()
    const paused = game.party()
    expect(paused.combat!.turn.actorId).not.toBe('member-1')
    expect(game.playerState()).toMatchObject({ health: 18, gold: 10 })
    const choice = triggeredEffectChoiceOf(paused)
    expect(availableActions(paused, paused.turn.memberId, new Set())).toEqual([
      'resolveTriggeredEffect',
    ])
    await game.accept({
      type: 'resolveTriggeredEffect',
      choiceId: choice.choiceId,
      effectId: choice.effects[0].effectId,
      decision: 'pay',
    })

    expect(game.playerState()).toMatchObject({ health: 17, gold: 9 })
    expect(game.party()).toMatchObject({ triggeredEffectChoice: null })
    expect(game.party().combat!.turn.actorId).toBe('member-1')
  })

  it.each([
    { element: 'fire', remainingHealth: 11, defense: 4 },
    { element: null, remainingHealth: 9, defense: 0 },
  ] as const)(
    'REQ-119: a passiva do inimigo reage ao uso de Fogo (elemento $element)',
    async ({ element, remainingHealth, defense }) => {
      const ability = executableAbility({
        element,
        cost: [{ kind: 'donateLife', amount: 4 }],
        effects: [
          makeEffect({
            cost: [],
            mark: 'buff',
            activation: [{ kind: 'heal', amount: 1 }],
          }),
        ],
      })
      const passive = executableAbility({
        id: 'fixture.enemy-passive',
        form: 'passive',
        effects: [
          makeEffect({
            trigger: { kind: 'onElementAbilityUsed', element: 'fire' },
            cost: [],
            activation: [{ kind: 'heal', amount: 2 }],
          }),
          makeEffect({
            trigger: { kind: 'whileUsedAbilitiesSameElement' },
            cost: [],
            activation: [
              {
                kind: 'modifierFlat',
                changes: [{ modifier: 'defense', amount: 4 }],
              },
            ],
          }),
        ],
      })
      const enemy = makeEnemy({ count: 1, health: 12 })
      const combatCard = makeCombatEventCard({
        goodOutcome: emptyOutcome,
        badOutcome: emptyOutcome,
        enemies: [
          {
            ...enemy,
            abilities: [ability, passive],
            combatRules: { abilityPriority: ['selfBuff'] },
            modifiers: { ...enemy.modifiers, defense: 0, celerity: 12 },
          },
        ],
      })
      const game = setup({ combatOnly: true, combatCard })

      await game.reveal()

      expect(game.party().combat).toMatchObject({
        turn: { actorId: 'member-1' },
        enemies: [{ health: remainingHealth, effectiveModifiers: { defense } }],
      })
    }
  )

  it('REQ-121: Suporte cura o aliado ferido de menor vida, desempata pela ordem impressa e ainda ataca', async () => {
    const heal = executableAbility({
      target: 'ally',
      effects: [
        makeEffect({ cost: [], activation: [{ kind: 'heal', amount: 1 }] }),
      ],
    })
    const enemy = makeEnemy({ count: 1 })
    const ally = {
      ...enemy,
      modifiers: { ...enemy.modifiers, attack: 2, celerity: 12 },
    }
    const combatCard = makeCombatEventCard({
      goodOutcome: emptyOutcome,
      badOutcome: emptyOutcome,
      enemies: [
        { ...ally, health: 10 },
        ally,
        ally,
        {
          ...enemy,
          health: 12,
          behavior: 'support',
          abilities: [heal],
          modifiers: { ...enemy.modifiers, attack: 2, celerity: 10 },
        },
      ],
    })
    const player = makePlayerState()
    const game = setup({
      combatOnly: true,
      combatCard,
      player: {
        peak: 0,
        health: 20,
        modifiers: {
          ...player.modifiers,
          defense: 0,
          evasion: 0,
          reflection: 1,
        },
      },
    })

    await game.reveal()

    expect(game.playerState().health).toBe(16)
    expect(game.party().combat).toMatchObject({
      cycle: 1,
      turn: { actorId: 'member-1', phase: 'prepare' },
      enemies: [{ health: 9 }, { health: 8 }, { health: 7 }, { health: 11 }],
    })
  })
})

describe('TakePartyActionUseCase — desfechos de combate (T-48)', () => {
  const enemy = makeEnemy({
    count: 1,
    health: 1,
    modifiers: {
      ...combat.enemies[0].modifiers,
      attack: 0,
      defense: 0,
      evasion: 0,
      celerity: 0,
    },
  })
  const loss = {
    type: 'effect',
    effect: {
      text: 'Perca 5 de ouro.',
      activation: [{ kind: 'loseGold', amount: 5 }],
      duration: { kind: 'immediate' },
      mark: null,
    },
  } as const

  function fight(
    card: Partial<typeof combat> = {},
    options: Parameters<typeof setup>[0] = {}
  ) {
    return setup({
      combatOnly: true,
      combatCard: makeCombatEventCard({
        enemies: [enemy],
        goodOutcome: emptyOutcome,
        badOutcome: { text: loss.effect.text, steps: [loss] },
        ...card,
      }),
      ...options,
    })
  }

  function outcomeOf(party: ReturnType<typeof makeParty>) {
    return {
      combat: party.combat,
      lastCombatResult: party.lastCombatResult,
      pendingRewards: party.pendingRewards,
      eventDecks: party.eventDecks,
    }
  }

  function turnOf(game: ReturnType<typeof setup>) {
    const battle = game.party().combat
    if (!battle) throw new Error('O combate deveria estar aberto')
    return { combatId: battle.id, turnId: battle.turn.id }
  }

  it('REQ-122: fuga bem-sucedida paga Vigor, perde Pico e descarta uma vez', async () => {
    const game = fight({ escapeThreshold: 0 }, { player: { vigor: 6 } })
    await game.reveal()
    const turn = turnOf(game)
    const party = await game.accept({ type: 'escapeCombat', ...turn })
    expect(game.playerState()).toMatchObject({ peak: 8, vigor: 4, gold: 10 })
    expect(outcomeOf(party)).toMatchObject({
      combat: null,
      lastCombatResult: {
        combatId: turn.combatId,
        resolution: 'escaped',
        cause: 'escapeSucceeded',
        peakDelta: -2,
      },
      eventDecks: [{ zoneType: 'urban', cards: [], discard: [combat.id] }],
    })
    expect(availableActions(party, party.turn.memberId, new Set())).toContain(
      'endTurn'
    )
  })

  it('REQ-122: falha de fuga dá ataque livre extra e preserva o turno normal inimigo', async () => {
    const attacker = {
      ...enemy,
      modifiers: { ...enemy.modifiers, attack: 4, accuracy: 1 },
    }
    const game = fight(
      { enemies: [attacker], escapeThreshold: 20 },
      {
        player: {
          modifiers: { ...makePlayerState().modifiers, defense: 0, evasion: 0 },
        },
      }
    )
    await game.reveal()
    const party = await game.accept({ type: 'escapeCombat', ...turnOf(game) })
    expect(game.playerState()).toMatchObject({ health: 14, peak: 10, vigor: 8 })
    expect(party.combat).toMatchObject({
      cycle: 2,
      turn: { actorId: 'member-1' },
    })
    expect(party.eventDecks[0].discard).toEqual([])
  })

  it('REQ-122: limite em Sem fuga cobra apenas Pico e devolve a vez', async () => {
    const game = fight(
      {
        noEscape: true,
        enemies: [{ ...enemy, modifiers: { ...enemy.modifiers, accuracy: 0 } }],
      },
      {
        player: { vigor: 6 },
        rewardConfig: { ...GAME_CONFIG_DEFAULTS, maxCombatCycles: 1 },
      }
    )
    await game.reveal()
    const turn = turnOf(game)
    await game.refuse(
      { type: 'escapeCombat', ...turn },
      { reason: 'escapeForbidden' }
    )
    const rng = [...game.party().rngState]
    const party = await game.accept({ type: 'endCombatTurn', ...turn })
    expect(outcomeOf(party)).toMatchObject({
      combat: null,
      lastCombatResult: {
        resolution: 'escaped',
        cause: 'cycleLimit',
        peakDelta: -2,
      },
      eventDecks: [{ discard: [combat.id] }],
    })
    expect(game.playerState()).toMatchObject({ peak: 8, vigor: 6, gold: 10 })
    expect(party.rngState).toEqual(rng)
  })

  it('REQ-122/REQ-127: preserva a vitória por Reflexão e conclui o respawn na última escolha', async () => {
    const reflectingEnemy = {
      ...enemy,
      modifiers: { ...enemy.modifiers, reflection: 1 },
    }
    const game = fight(
      {
        enemies: [enemy, reflectingEnemy],
        goodOutcome: {
          text: 'Compre uma recompensa.',
          steps: [{ type: 'drawRewards', count: 1 }],
        },
      },
      {
        player: { health: 1, inventory: [{ cardId: spare.id, quantity: 1 }] },
        rewardCards: [ore.id],
        rewardConfig: { ...GAME_CONFIG_DEFAULTS, inventoryCapacity: 1 },
      }
    )
    await game.reveal()
    const battle = game.party().combat!
    await game.refuse({ type: 'endTurn' }, { reason: 'combatInProgress' })
    const at = fixedClock('2026-11-20T12:00:00Z').now()
    expect(game.party().endSession(at).value).toBe('combatInProgress')
    const first = await game.accept({
      type: 'combatAttack',
      ...turnOf(game),
      targetId: battle.enemies[0].id,
    })
    expect(first.combat?.enemies.map(({ health }) => health)).toEqual([0, 1])
    expect(first.pendingRewards).toEqual([])
    const victory = await game.accept({
      type: 'combatAttack',
      ...turnOf(game),
      targetId: battle.enemies[1].id,
    })
    expect(outcomeOf(victory)).toMatchObject({
      combat: null,
      lastCombatResult: {
        resolution: 'victory',
        cause: 'enemiesDefeated',
        playerDown: true,
      },
      pendingRewards: [
        {
          cardId: ore.id,
          source: { type: 'combatEvent', combatId: battle.id },
        },
      ],
      eventDecks: [{ discard: [] }],
    })
    expect(game.playerState()).toMatchObject({
      health: 0,
      down: true,
      gold: 10,
    })
    expect(availableActions(victory, victory.turn.memberId, new Set())).toEqual(
      ['resolveReward']
    )
    const finished = await game.accept({
      type: 'resolveReward',
      rewardId: pendingRewardId(victory),
      choice: 'keep',
      discard: [{ cardId: spare.id, copies: 1 }],
    })
    expect(game.playerState()).toMatchObject({
      down: false,
      inventory: [{ cardId: ore.id, quantity: 1 }],
    })
    expect(game.playerState().health).toBeGreaterThan(0)
    expect(finished.lastCombatResult?.peakDelta).toBe(2)
    expect(finished.eventDecks[0].discard).toEqual([combat.id])
    expect(finished.endSession(at).isRight()).toBe(true)
    expect(finished.startSession(at)).toBe(true)
  })

  it('REQ-122/REQ-126/REQ-127: derrota aplica a coisa ruim uma vez antes do respawn', async () => {
    const attacker = {
      ...enemy,
      modifiers: { ...enemy.modifiers, attack: 20, accuracy: 1 },
    }
    const game = fight(
      { enemies: [attacker] },
      {
        player: {
          health: 1,
          modifiers: { ...makePlayerState().modifiers, evasion: 0 },
        },
      }
    )
    await game.reveal()
    const party = await game.accept({ type: 'endCombatTurn', ...turnOf(game) })
    expect(outcomeOf(party)).toMatchObject({
      combat: null,
      lastCombatResult: {
        resolution: 'defeat',
        cause: 'playerDown',
        playerDown: true,
      },
      eventDecks: [{ discard: [combat.id] }],
    })
    expect(game.playerState()).toMatchObject({ down: false, gold: 5 })
    expect(game.playerState().health).toBeGreaterThan(0)
    await game.accept({ type: 'endTurn' })
    expect(game.playerState().gold).toBe(5)
  })
})

describe('TakePartyActionUseCase — recompensas de encontro (T-42)', () => {
  it.each(['grantReward', 'drawRewards', 'searchReward'] as const)(
    'REQ-166: %s entrega item de conclusão sem ocupar inventário ou montaria',
    async (type) => {
      const shard = { ...ore, id: 'fixture.shard', completionItem: true }
      const inventory = [{ cardId: spare.id, quantity: 1 }]
      const mount = {
        cardId: 'fixture.plow-horse',
        inventory: [],
        tcgFolder: [],
      }
      const step =
        type === 'drawRewards'
          ? { type, count: 1 }
          : type === 'grantReward'
            ? { type, cardId: shard.id, copies: 2 }
            : { type, cardId: shard.id }
      const game = setup({
        player: { inventory, mount },
        additionalCards: [shard, makeMountCard({ id: mount.cardId })],
        rewardCards: [shard.id],
        rewardConfig: {
          ...GAME_CONFIG_DEFAULTS,
          inventoryCapacity: 1,
          mountInventorySlots: 1,
        },
        outcome: { text: 'Receba fragmentos.', steps: [step] },
      })
      const encounterId = await game.reveal()
      const finished = await game.accept({ type: 'resolveEvent', encounterId })

      expect(finished.pendingRewards).toEqual([])
      expect(game.playerState()).toMatchObject({
        inventory,
        mount,
        completionItems: [
          { cardId: shard.id, quantity: type === 'grantReward' ? 2 : 1 },
        ],
      })
    }
  )

  it('REQ-166: entrega item de conclusão de missão com inventário cheio', async () => {
    const shard = { ...ore, id: 'fixture.shard', completionItem: true }
    const inventory = [{ cardId: spare.id, quantity: 1 }]
    const quest: TZoneQuestCard = {
      type: 'zoneQuest',
      id: 'fixture.shard-quest',
      collectionId: 'fixture',
      title: 'Fragmentos',
      summary: 'Receba fragmentos.',
      stages: [
        {
          type: 'interaction',
          location: { type: 'zoneType', zoneType: 'urban' },
          text: 'Entregue a missão.',
        },
      ],
      rewards: [{ type: 'grantReward', cardId: shard.id, copies: 2 }],
    }
    const questId = 'quest-1'
    const game = setup({
      player: {
        inventory,
        openZoneQuests: [
          {
            questId,
            questCardId: quest.id,
            originZoneId: harbor.id,
            stageIndex: 0,
          },
        ],
      },
      additionalCards: [quest, shard],
      rewardConfig: { ...GAME_CONFIG_DEFAULTS, inventoryCapacity: 1 },
    })

    const finished = await game.accept({ type: 'finishQuest', questId })

    expect(finished.pendingRewards).toEqual([])
    expect(game.playerState()).toMatchObject({
      inventory,
      openZoneQuests: [],
      completionItems: [{ cardId: shard.id, quantity: 2 }],
    })
  })

  it('REQ-114/REQ-115: pausa na primeira cópia, valida o descarte e retoma pela reserva uma vez', async () => {
    const inventory = [{ cardId: spare.id, quantity: 2 }]
    const heal = {
      type: 'effect',
      effect: {
        text: 'Recupere 2 de vida.',
        activation: [{ kind: 'heal', amount: 2 }],
        duration: { kind: 'immediate' },
        mark: null,
      },
    } as const
    const game = setup({
      requirements: [attrs],
      player: { inventory, health: 10, hand: [strength.id, strength.id] },
      rewardCards: [ore.id],
      rewardConfig: {
        ...GAME_CONFIG_DEFAULTS,
        inventoryCapacity: 1,
        reserveDeck: [{ type: 'card', cardId: potion.id, weight: 1 }],
      },
      outcome: {
        text: 'Cura, duas recompensas e cura.',
        steps: [heal, { type: 'drawRewards', count: 2 }, heal],
      },
    })
    const encounterId = await game.reveal()
    const [firstCopy, secondCopy] = game.handCopies()
    const pay = {
      type: 'payEventRequirement',
      encounterId,
      requirementId: attrs.id,
    }
    await game.accept({ ...pay, payment: { handCards: [firstCopy.copyId] } })
    const paused = await game.accept({
      ...pay,
      payment: { handCards: [secondCopy.copyId] },
    })
    expect(rewardState(paused)).toMatchObject({
      randomEventEncounter: { phase: 'success' },
      pendingRewards: [
        {
          id: expect.any(String),
          memberId: 'member-1',
          cardId: ore.id,
          origin: { type: 'rewardDeck', zoneType: 'urban' },
          source: { type: 'randomEvent', encounterId },
          destination: 'inventory',
          discardOptions: [{ cardId: spare.id, maxCopies: 2 }],
          decisionDeadlineAt: null,
        },
      ],
    })
    expect(game.playerState().health).toBe(12)
    expect(availableActions(paused, paused.turn.memberId, new Set())).toEqual([
      'resolveReward',
    ])
    const rewardId = pendingRewardId(paused)
    const keep = { type: 'resolveReward', rewardId, choice: 'keep' }
    await game.refuse({ ...keep, discard: [] }, { reason: 'rewardDoesNotFit' })
    await game.refuse(
      { ...keep, discard: [{ cardId: spare.id, copies: 1 }] },
      { reason: 'rewardDoesNotFit' }
    )
    expect(game.playerState().inventory).toEqual(inventory)
    const resumed = await game.accept({
      ...keep,
      discard: [{ cardId: spare.id, copies: 2 }],
    })
    expect(game.playerState().inventory).toEqual([
      { cardId: ore.id, quantity: 1 },
    ])
    expect(game.playerState().health).toBe(12)
    expect(game.playerState()).toMatchObject({
      lastRewardDelivery: {
        rewardId,
        cardId: ore.id,
        origin: { type: 'rewardDeck', zoneType: 'urban' },
        disposition: 'kept',
      },
    })
    expect(resumed.pullDomainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'SentToLimbo',
        cardId: spare.id,
        quantity: 2,
      })
    )
    expect(rewardState(resumed)).toMatchObject({
      pendingRewards: [{ cardId: potion.id, origin: { type: 'reserveDeck' } }],
    })
    const reserveId = pendingRewardId(resumed)
    expect(reserveId).not.toBe(rewardId)
    const leave = {
      type: 'resolveReward',
      rewardId: reserveId,
      choice: 'leave',
    }
    expect(rewardState(await game.accept(leave))).toMatchObject({
      pendingRewards: [],
      randomEventEncounter: null,
    })
    expect(game.playerState()).toMatchObject({
      health: 14,
      peak: 11,
      hand: [endurance.id],
      lastRandomEvent: { resolution: 'success', peakDelta: 1 },
      lastRewardDelivery: {
        rewardId: reserveId,
        cardId: potion.id,
        origin: { type: 'reserveDeck' },
        disposition: 'removed',
      },
    })
    await game.refuse(leave, { reason: 'staleReward' })
  })

  it.each([
    { type: 'searchReward', cardId: ore.id },
    { type: 'grantReward', cardId: ore.id, copies: 1 },
  ] as const)(
    'REQ-115: deixar recompensa de $type respeita a origem',
    async (step) => {
      const searched = step.type === 'searchReward'
      const game = setup({
        player: { inventory: [{ cardId: spare.id, quantity: 1 }] },
        rewardCards: [ore.id, potion.id],
        rewardConfig: { ...GAME_CONFIG_DEFAULTS, inventoryCapacity: 1 },
        outcome: { text: 'Receba minério.', steps: [step] },
      })
      const encounterId = await game.reveal()
      const paused = await game.accept({ type: 'resolveEvent', encounterId })
      const origin = searched
        ? { type: 'rewardDeck', zoneType: 'urban' }
        : { type: 'fixed' }
      expect(rewardState(paused)).toMatchObject({
        pendingRewards: [{ cardId: ore.id, origin }],
      })
      if (searched) {
        expect(game.playerState()).toMatchObject({
          lastRewardSearch: { encounterId, cardId: ore.id, found: true },
        })
      }
      const rewardId = pendingRewardId(paused)
      const resolved = await game.accept({
        type: 'resolveReward',
        rewardId,
        choice: 'leave',
      })
      expect(rewardState(resolved)).toMatchObject({
        randomEventEncounter: null,
        pendingRewards: [],
      })
      expect(game.playerState()).toMatchObject({
        lastRewardDelivery: {
          rewardId,
          cardId: ore.id,
          origin,
          disposition: searched ? 'returnedToDeck' : 'sentToLimbo',
        },
      })
      expect(resolved.rewardDecks).toEqual([
        {
          zoneType: 'urban',
          cards: searched ? [potion.id, ore.id] : [ore.id, potion.id],
        },
      ])
      if (!searched) {
        expect(resolved.pullDomainEvents()).toContainEqual(
          expect.objectContaining({
            type: 'SentToLimbo',
            cardId: ore.id,
            quantity: 1,
          })
        )
      }
    }
  )

  it('REQ-115: busca no deck vazio registra ausência sem recorrer à reserva', async () => {
    const game = setup({
      rewardConfig: {
        ...GAME_CONFIG_DEFAULTS,
        reserveDeck: [{ type: 'card', cardId: ore.id, weight: 1 }],
      },
      outcome: {
        text: 'Busque minério.',
        steps: [{ type: 'searchReward', cardId: ore.id }],
      },
    })
    const encounterId = await game.reveal()
    expect(
      rewardState(await game.accept({ type: 'resolveEvent', encounterId }))
    ).toMatchObject({
      randomEventEncounter: null,
      pendingRewards: [],
    })
    expect(game.playerState()).toMatchObject({
      inventory: [],
      lastRewardSearch: { encounterId, cardId: ore.id, found: false },
    })
  })
})

describe('TakePartyActionUseCase — montaria como recompensa (T-79)', () => {
  const horse = makeMountCard()
  const pony = makeMountCard({ id: 'fixture.war-pony', name: 'Pônei' })
  const owned = {
    cardId: pony.id,
    inventory: [{ cardId: ore.id, quantity: 1 }],
    tcgFolder: [],
  }

  it.each([
    { type: 'drawRewards', count: 1 },
    { type: 'searchReward', cardId: horse.id },
    { type: 'grantReward', cardId: horse.id, copies: 1 },
  ] as const)(
    'REQ-162: sem montaria, $type entrega a montaria vazia sem escolha',
    async (step) => {
      const game = setup({
        player: { inventory: [{ cardId: spare.id, quantity: 1 }] },
        rewardCards: [horse.id],
        rewardConfig: { ...GAME_CONFIG_DEFAULTS, inventoryCapacity: 1 },
        additionalCards: [horse, pony],
        outcome: { text: 'Ganhe um cavalo.', steps: [step] },
      })
      const encounterId = await game.reveal()
      const resolved = await game.accept({ type: 'resolveEvent', encounterId })
      expect(rewardState(resolved)).toMatchObject({
        randomEventEncounter: null,
        pendingRewards: [],
      })
      expect(game.playerState()).toMatchObject({
        mount: { cardId: horse.id, inventory: [], tcgFolder: [] },
        inventory: [{ cardId: spare.id, quantity: 1 }],
        lastRewardDelivery: {
          cardId: horse.id,
          origin:
            step.type === 'grantReward'
              ? { type: 'fixed' }
              : { type: 'rewardDeck', zoneType: 'urban' },
          disposition: 'kept',
          space: null,
        },
      })
    }
  )

  it.each([
    { type: 'drawRewards', count: 1 },
    { type: 'searchReward', cardId: horse.id },
  ] as const)(
    'REQ-162: com montaria, $type devolve a carta ao fundo do deck',
    async (step) => {
      const game = setup({
        player: { mount: owned },
        rewardCards: [horse.id, potion.id],
        additionalCards: [horse, pony],
        outcome: { text: 'Ganhe um cavalo.', steps: [step] },
      })
      const encounterId = await game.reveal()
      const resolved = await game.accept({ type: 'resolveEvent', encounterId })
      expect(rewardState(resolved)).toMatchObject({ pendingRewards: [] })
      expect(game.playerState()).toMatchObject({
        mount: owned,
        lastRewardDelivery: {
          cardId: horse.id,
          origin: { type: 'rewardDeck', zoneType: 'urban' },
          disposition: 'returnedToDeck',
          space: null,
        },
      })
      expect(resolved.rewardDecks).toEqual([
        { zoneType: 'urban', cards: [potion.id, horse.id] },
      ])
      expect(resolved.pullDomainEvents()).not.toContainEqual(
        expect.objectContaining({ type: 'SentToLimbo' })
      )
    }
  )

  it('REQ-162: com montaria, a recompensa fixa vai ao limbo', async () => {
    const game = setup({
      player: { mount: owned },
      additionalCards: [horse, pony],
      outcome: {
        text: 'Ganhe um cavalo.',
        steps: [{ type: 'grantReward', cardId: horse.id, copies: 1 }],
      },
    })
    const encounterId = await game.reveal()
    const resolved = await game.accept({ type: 'resolveEvent', encounterId })
    expect(rewardState(resolved)).toMatchObject({ pendingRewards: [] })
    expect(game.playerState()).toMatchObject({
      mount: owned,
      lastRewardDelivery: {
        cardId: horse.id,
        origin: { type: 'fixed' },
        disposition: 'sentToLimbo',
        space: null,
      },
    })
    expect(resolved.pullDomainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'SentToLimbo',
        memberId: new UniqueEntityID('member-1'),
        cardId: horse.id,
        quantity: 1,
        from: 'mount',
      })
    )
  })

  it('REQ-162: duas cópias fixas: a primeira vira a montaria, a segunda vai ao limbo', async () => {
    const game = setup({
      additionalCards: [horse],
      outcome: {
        text: 'Ganhe dois cavalos.',
        steps: [{ type: 'grantReward', cardId: horse.id, copies: 2 }],
      },
    })
    const encounterId = await game.reveal()
    await game.accept({ type: 'resolveEvent', encounterId })
    expect(game.playerState()).toMatchObject({
      mount: { cardId: horse.id, inventory: [], tcgFolder: [] },
      lastRewardDelivery: { cardId: horse.id, disposition: 'sentToLimbo' },
    })
  })
})

function pendingRewardId(party: ReturnType<typeof makeParty>): string {
  return party.pendingRewards[0].id
}

function rewardState(party: ReturnType<typeof makeParty>) {
  return {
    randomEventEncounter: party.randomEventEncounter,
    pendingRewards: party.pendingRewards,
  }
}

describe('TakePartyActionUseCase — prêmio de montaria (T-84)', () => {
  const shard = makeItemCard({ id: 'fixture.shard', completionItem: true })
  const horse = makeMountCard()
  const pony = makeMountCard({ id: 'fixture.war-pony', name: 'Pônei' })
  const owned = {
    cardId: pony.id,
    inventory: [{ cardId: ore.id, quantity: 1 }],
    tcgFolder: [],
  }

  it.each([
    { slot: 'vazio', existingMount: null, copiesToLimbo: 1 },
    { slot: 'ocupado', existingMount: owned, copiesToLimbo: 2 },
  ])(
    'REQ-167/REQ-169: distribui o prêmio de montaria com slot $slot',
    async ({ existingMount, copiesToLimbo }) => {
      const game = setup({
        completion: {
          zoneTitle: harbor.title,
          requirement: [{ cardId: shard.id, count: 1 }],
          grandPrize: { cards: [{ cardId: horse.id, copies: 2 }], gold: 0 },
          finalBoss: null,
        },
        player: {
          completionItems: [{ cardId: shard.id, quantity: 1 }],
          mount: existingMount,
        },
        additionalCards: [shard, horse, pony],
      })

      const result = await game.accept({ type: 'completeDimension' })

      expect(result.pendingRewards).toEqual([])
      expect(result).toHaveProperty(
        'lastDimensionCompletion.members.0.cards',
        existingMount
          ? []
          : [{ cardId: horse.id, copies: 1, destination: 'mount' }]
      )
      expect(game.playerState().mount).toEqual(
        existingMount ?? { cardId: horse.id, inventory: [], tcgFolder: [] }
      )
      const lostCopies = result.pullDomainEvents().reduce((total, event) => {
        if (
          event.type === 'SentToLimbo' &&
          event.cardId === horse.id &&
          event.from === 'mount'
        ) {
          return total + event.quantity
        }
        return total
      }, 0)
      expect(lostCopies).toBe(copiesToLimbo)
    }
  )
})

it('REQ-169/REQ-170: avança pela ordem de lançamento com o prêmio pendente do dono', async () => {
  const shard = makeItemCard({ id: 'fixture.shard', completionItem: true })
  const next = makeDimensionCard({
    id: 'fixture-next.dimension',
    collectionId: 'fixture-next',
    releaseOrder: 2,
  })
  const later = makeDimensionCard({
    id: 'fixture-later.dimension',
    collectionId: 'fixture-later',
    releaseOrder: 3,
  })
  const city = makeUrbanZoneCard({
    id: 'fixture-next.city',
    collectionId: next.collectionId,
  })
  const game = setup({
    completion: {
      zoneTitle: harbor.title,
      requirement: [{ cardId: shard.id, count: 1 }],
      grandPrize: { cards: [{ cardId: potion.id, copies: 1 }], gold: 10 },
      finalBoss: null,
    },
    rewardConfig: { ...GAME_CONFIG_DEFAULTS, inventoryCapacity: 1 },
    player: {
      completionItems: [{ cardId: shard.id, quantity: 1 }],
      inventory: [{ cardId: ore.id, quantity: 1 }],
      gold: GAME_CONFIG_DEFAULTS.purseCapacity - 2,
      hand: [strength.id],
      discard: [strength.id],
    },
    additionalCards: [shard, later, next, city],
    publishedCollections: [later.collectionId, next.collectionId],
  })

  const advanced = await game.accept({ type: 'completeDimension' })
  expect(advanced.status).toBe('inSession')
  expect(advanced.dimension.dimensionCardId).toBe(next.id)
  expect(game.playerState()).toMatchObject({
    zoneId: city.id,
    respawnZoneId: city.id,
    completionItems: [],
    gold: GAME_CONFIG_DEFAULTS.purseCapacity,
    discard: [],
  })
  expect([...game.playerState().hand].sort()).toEqual(
    [strength.id, strength.id, endurance.id].sort()
  )
  expect(advanced.lastDimensionCompletion).toMatchObject({
    members: [{ memberId: 'member-1', gold: 2, peakDelta: 25, cards: [] }],
    next: { type: 'nextDimension', dimensionCardId: next.id },
  })
  expect(advanced.pendingRewards).toMatchObject([
    {
      memberId: 'member-1',
      cardId: potion.id,
      source: { type: 'grandPrize', dimensionCardId: 'fixture.test-dimension' },
    },
  ])
  const resolved = await game.accept({
    type: 'resolveReward',
    rewardId: advanced.pendingRewards[0].id,
    choice: 'leave',
  })
  expect(resolved.pendingRewards).toEqual([])
  expect(resolved.lastDimensionCompletion).toEqual(
    advanced.lastDimensionCompletion
  )
})

describe('TakePartyActionUseCase — chefe final (T-83)', () => {
  const shard = makeItemCard({ id: 'fixture.shard', completionItem: true })
  const items = [{ cardId: shard.id, quantity: 2 }]
  const enemy = makeEnemy({
    count: 1,
    enemyCategory: 'boss',
    health: 1,
    modifiers: {
      ...combat.enemies[0].modifiers,
      attack: 0,
      accuracy: 0,
      defense: 0,
      evasion: 0,
      celerity: 0,
      reflection: 0,
    },
  })
  const completion = {
    zoneTitle: harbor.title,
    requirement: [{ cardId: shard.id, count: 2 }],
    grandPrize: { cards: [], gold: 0 },
    finalBoss: {
      title: 'Guardião',
      flavorText: null,
      enemies: [enemy],
      noEscape: false,
      escapeThreshold: 0,
    },
  }
  const complete = { type: 'completeDimension' }

  it.each([
    { reason: 'noActionPoints', actionPoints: 0, rule: null, quantity: 0 },
    { reason: 'noCompletion', actionPoints: 1, rule: null, quantity: 0 },
    {
      reason: 'notCompletionZone',
      actionPoints: 1,
      rule: { ...completion, zoneTitle: 'Outra zona' },
      quantity: 0,
    },
    {
      reason: 'completionRequirementNotMet',
      actionPoints: 1,
      rule: completion,
      quantity: 1,
    },
  ])(
    'REQ-167: recusa $reason sem salvar nem avançar o RNG',
    async ({ reason, actionPoints, rule, quantity }) => {
      const game = setup({
        completion: rule,
        actionPoints,
        player: { completionItems: [{ cardId: shard.id, quantity }] },
        otherMember:
          reason === 'completionRequirementNotMet'
            ? makePlayerState({
                completionItems: [{ cardId: shard.id, quantity: 1 }],
              })
            : undefined,
        additionalCards: [shard],
      })
      await game.refuse(complete, { reason })
      expect(game.party().turn.actionPoints).toBe(actionPoints)
      expect(game.party().combat).toBeNull()
    }
  )

  it.each(['escapeSucceeded', 'cycleLimit', 'playerDown'] as const)(
    'REQ-167/REQ-168: abre o chefe e preserva os itens em %s',
    async (cause) => {
      const noEscape = cause === 'cycleLimit'
      const finalBoss = {
        ...completion.finalBoss,
        noEscape,
        enemies: [
          cause === 'playerDown'
            ? {
                ...enemy,
                modifiers: { ...enemy.modifiers, attack: 100, accuracy: 100 },
              }
            : enemy,
        ],
      }
      const game = setup({
        completion: { ...completion, finalBoss },
        actionPoints: 2,
        player: {
          completionItems: items,
          health: 1,
          vigor: 6,
          modifiers: { ...makePlayerState().modifiers, evasion: 0 },
        },
        additionalCards: [shard],
        rewardConfig: { ...GAME_CONFIG_DEFAULTS, maxCombatCycles: 1 },
      })

      const started = await game.accept(complete)
      expect(started.turn.actionPoints).toBe(1)
      expect(game.playerState().completionItems).toEqual(items)
      expect(started.combat).toMatchObject({
        finalBoss: true,
        card: {
          id: started.dimension.dimensionCardId,
          title: finalBoss.title,
          enemies: finalBoss.enemies,
          noEscape,
          goodOutcome: { text: '' },
          badOutcome: { text: '' },
        },
      })
      const battle = started.combat!
      const turn = { combatId: battle.id, turnId: battle.turn.id }
      if (noEscape) {
        await game.refuse(
          { type: 'escapeCombat', ...turn },
          { reason: 'escapeForbidden' }
        )
      }
      const finished = await game.accept({
        type: cause === 'escapeSucceeded' ? 'escapeCombat' : 'endCombatTurn',
        ...turn,
      })
      expect(finished.combat).toBeNull()
      expect(finished.lastCombatResult).toMatchObject({
        finalBoss: true,
        resolution: cause === 'playerDown' ? 'defeat' : 'escaped',
        cause,
      })
      expect(game.playerState().completionItems).toEqual(items)
      expect(finished.eventDecks).toEqual([])
    }
  )

  it('REQ-165/REQ-168: a vitória contra o chefe soma o Pico uma vez', async () => {
    const game = setup({
      completion,
      player: { completionItems: items },
      additionalCards: [shard],
      rewardConfig: { ...GAME_CONFIG_DEFAULTS, bossPeakGain: 23 },
    })
    const started = await game.accept(complete)
    expect(started.combatUpdates).toContainEqual(
      expect.objectContaining({
        type: 'combatStarted',
        cardTitle: completion.finalBoss.title,
      })
    )
    const battle = started.combat!
    const victory = await game.accept({
      type: 'combatAttack',
      combatId: battle.id,
      turnId: battle.turn.id,
      targetId: battle.enemies[0].id,
    })
    expect(victory.lastCombatResult).toMatchObject({
      finalBoss: true,
      resolution: 'victory',
      peakDelta: 23,
    })
    expect(game.playerState().peak).toBe(58)
    expect(victory.lastDimensionCompletion).toMatchObject({
      finalBossDefeated: true,
      members: [{ memberId: 'member-1', peakDelta: 48 }],
    })
  })

  it.each([0, 37])(
    'REQ-165: aplica bossPeakGain = %i por chefe em evento',
    async (bossPeakGain) => {
      const game = setup({
        combatOnly: true,
        combatCard: makeCombatEventCard({
          enemies: [{ ...enemy, count: 2 }],
          goodOutcome: emptyOutcome,
          badOutcome: emptyOutcome,
        }),
        rewardConfig: { ...GAME_CONFIG_DEFAULTS, bossPeakGain },
      })
      await game.reveal()
      for (const index of [0, 1]) {
        const battle = game.party().combat!
        await game.accept({
          type: 'combatAttack',
          combatId: battle.id,
          turnId: battle.turn.id,
          targetId: battle.enemies[index].id,
        })
      }
      expect(game.party().lastCombatResult).toMatchObject({
        finalBoss: false,
        resolution: 'victory',
        peakDelta: bossPeakGain * 2,
      })
      expect(game.playerState().peak).toBe(10 + bossPeakGain * 2)
    }
  )
})

it('REQ-171/REQ-172: reabre o save congelado, projeta idle após publicação e prepara a sucessora uma vez', async () => {
  const shard = makeItemCard({ id: 'fixture.shard', completionItem: true })
  const next = makeDimensionCard({
    id: 'fixture-next.dimension',
    collectionId: 'fixture-next',
    releaseOrder: 2,
  })
  const city = makeUrbanZoneCard({
    id: 'fixture-next.city',
    collectionId: next.collectionId,
  })
  const game = setup({
    completion: {
      zoneTitle: harbor.title,
      requirement: [{ cardId: shard.id, count: 1 }],
      grandPrize: { cards: [{ cardId: potion.id, copies: 1 }], gold: 10 },
      finalBoss: null,
    },
    rewardConfig: { ...GAME_CONFIG_DEFAULTS, inventoryCapacity: 1 },
    player: {
      completionItems: [{ cardId: shard.id, quantity: 1 }],
      inventory: [{ cardId: ore.id, quantity: 1 }],
    },
    additionalCards: [shard, next, city],
  })
  const frozen = await game.accept({ type: 'completeDimension' })
  expect(frozen.status).toBe('frozen')
  expect(frozen.lastDimensionCompletion?.next).toEqual({ type: 'frozen' })
  expect(frozen.pendingRewards).toHaveLength(1)

  const repository = new InMemoryPartiesRepository()
  await repository.create(frozen)
  const save = vi.spyOn(repository, 'save')
  const partyId = frozen.id.toString()
  const clock = fixedClock('2026-11-26T12:00:00Z')
  const resumeKnockout = new ResumeLegacyKnockout(game.catalog, sequentialIds())
  const start = new StartSessionUseCase(
    repository,
    clock,
    resumeKnockout,
    game.catalog
  )
  const get = new GetPartyUseCase(
    repository,
    clock,
    resumeKnockout,
    game.catalog
  )
  const list = new ListPartiesUseCase(repository, game.catalog)

  const frozenDetail = await get.execute({ partyId })
  expect(frozenDetail.value).toHaveProperty('party.status', 'frozen')
  expect(
    (await list.execute()).value.parties.map(({ status }) => status)
  ).toEqual(['frozen'])
  const denied = await start.execute({ partyId })
  expect(denied.value).toMatchObject({
    code: 'PARTY_FROZEN',
    message: 'Este save está congelado até o lançamento da próxima dimensão.',
  })
  expect(save).not.toHaveBeenCalled()

  game.catalog.collections.push({
    id: next.collectionId,
    name: next.collectionId,
  })
  const idle = await get.execute({ partyId })
  expect(idle.value).toHaveProperty('party.status', 'idle')
  expect(idle.value).toHaveProperty('party.rngState', frozen.rngState)
  expect(idle.value).toHaveProperty(
    'party.lastDimensionCompletion',
    frozen.lastDimensionCompletion
  )
  expect(
    (await list.execute()).value.parties.map(({ status }) => status)
  ).toEqual(['idle'])
  expect(save).not.toHaveBeenCalled()
  expect(await repository.findById(partyId)).toHaveProperty('status', 'frozen')

  game.catalog.cards = game.catalog.cards.filter(({ id }) => id !== city.id)
  const invalid = await start.execute({ partyId })
  expect(invalid.value).toMatchObject({ code: 'DIMENSION_INVALID' })
  expect(save).not.toHaveBeenCalled()
  expect(await repository.findById(partyId)).toHaveProperty(
    'rngState',
    frozen.rngState
  )
  game.catalog.cards.push(city)

  const started = await start.execute({ partyId })
  if (started.isLeft()) throw new Error(started.value.message)
  const resumed = started.value.party
  expect(resumed.status).toBe('inSession')
  expect(resumed.dimension.dimensionCardId).toBe(next.id)
  expect(resumed.lastDimensionCompletion).toEqual({
    ...frozen.lastDimensionCompletion,
    next: { type: 'nextDimension', dimensionCardId: next.id, name: next.name },
  })
  expect(resumed.pendingRewards).toEqual(frozen.pendingRewards)
  expect(resumed.members[0].player).toMatchObject({
    zoneId: city.id,
    respawnZoneId: city.id,
    peak: frozen.members[0].player.peak,
    gold: frozen.members[0].player.gold,
    completionItems: [],
  })
  const repeated = await start.execute({ partyId })
  expect(repeated.value).toHaveProperty('party.rngState', resumed.rngState)
  expect(repeated.value).toHaveProperty(
    'party.pendingRewards',
    frozen.pendingRewards
  )
  expect(save).toHaveBeenCalledTimes(1)

  const replayRepository = new InMemoryPartiesRepository()
  await replayRepository.create(frozen)
  const replay = await new StartSessionUseCase(
    replayRepository,
    clock,
    resumeKnockout,
    game.catalog
  ).execute({ partyId })
  if (replay.isLeft()) throw new Error(replay.value.message)
  expect(replay.value.party.rngState).toEqual(resumed.rngState)
  expect(replay.value.party.dimension).toEqual(resumed.dimension)
  expect(replay.value.party.members[0].player.hand).toEqual(
    resumed.members[0].player.hand
  )
})

it('REQ-183 / FEAT-21: captura as fases públicas mesmo após encerrar o encontro', async () => {
  const game = setup({
    eventDecks: [
      { zoneType: 'urban', cards: [makeRandomEventCard().id], discard: [] },
    ],
  })
  const events: TAutomaticTurnEvent[] = []
  game.party().recordAutomaticTurn(events)
  const encounterId = await game.reveal()
  await game.accept({ type: 'giveUpEvent', encounterId })
  expect(game.party().randomEventEncounter).toBeNull()
  const cardId = game.event.id
  expect(events).toEqual([
    { type: 'randomEventStarted', payload: { encounterId, zoneId: harbor.id } },
    {
      type: 'randomEventRevealed',
      payload: { encounterId, cardId, cardTitle: game.event.title },
    },
    {
      type: 'randomEventPhaseChanged',
      payload: { encounterId, phase: 'setback' },
    },
    {
      type: 'randomEventEnded',
      payload: { encounterId, cardId, resolution: 'setback', cause: 'gaveUp' },
    },
  ])
})

function setup({
  requirements = [minimum],
  player = {},
  actionPoints = 1,
  combatOnly = false,
  combatCard = combat,
  combatCopies = 1,
  eventDecks,
  noEscape = false,
  rngState = SeededRng.fromSeed(42).state(),
  outcome = emptyOutcome,
  badOutcome = emptyOutcome,
  rewardCards = [],
  rewardConfig = GAME_CONFIG_DEFAULTS,
  additionalCards = [],
  dimensionEffects = [],
  completion,
  otherMember,
  publishedCollections = [],
  zone = harbor,
}: {
  requirements?: readonly TRandomEventRequirement[]
  player?: Partial<TPlayerState>
  actionPoints?: number
  combatOnly?: boolean
  combatCard?: typeof combat
  combatCopies?: number
  eventDecks?: ReturnType<typeof makeParty>['eventDecks']
  noEscape?: boolean
  rngState?: RngState
  outcome?: ReturnType<typeof makeRandomEventCard>['goodOutcome']
  badOutcome?: ReturnType<typeof makeRandomEventCard>['badOutcome']
  rewardCards?: string[]
  rewardConfig?: typeof GAME_CONFIG_DEFAULTS
  additionalCards?: TCard[]
  dimensionEffects?: ReturnType<typeof makeDimensionCard>['effects']
  completion?: ReturnType<typeof makeDimensionCard>['completion']
  otherMember?: TPlayerState
  publishedCollections?: string[]
  zone?: typeof harbor
} = {}) {
  const event = makeRandomEventCard({
    requirements,
    goodOutcome: outcome,
    badOutcome,
    escapeThreshold: 10,
    noEscape,
  })
  const dimension = makeDimensionCard({
    id: 'fixture.test-dimension',
    completion,
    effects: dimensionEffects,
    eventDecks: [
      {
        zoneType: 'urban',
        cards: [
          { cardId: combatCard.id, copies: combatCopies },
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
  const members = [member]
  if (otherMember) {
    members.push(
      PartyMember.create(
        { characterName: 'Rui', kind: 'human', player: otherMember },
        new UniqueEntityID('member-2')
      )
    )
  }
  let party = makeParty({
    status: 'inSession',
    members,
    turnOrder: members.map(({ id }) => id),
    hostMemberId: memberId,
    turn: { round: 1, memberId, actionPoints },
    rngState,
    config: rewardConfig,
    rewardDecks: [{ zoneType: 'urban', cards: rewardCards }],
    eventDecks,
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
  catalog.collections = publishedCollections.map((id) => ({ id, name: id }))
  catalog.cards = [
    event,
    combatCard,
    dimension,
    zone,
    strength,
    endurance,
    potion,
    ore,
    spare,
    ...additionalCards,
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
    catalog,
    refuse,
    start,
    reveal,
    party: () => party,
    playerState,
    handCopies,
    event,
  }
}

describe('TakePartyActionUseCase — doação fatal em encontro (T-51)', () => {
  const donation = {
    id: 'life',
    text: 'Doe 1 PV.',
    kind: 'donateLife',
    amount: 1,
  } as const
  const lifeReceipt = { requirementId: donation.id, health: 1 }
  const heal = {
    type: 'effect',
    effect: {
      text: 'Cure 7 PV.',
      activation: [{ kind: 'heal', amount: 7 }],
      duration: { kind: 'immediate' },
      mark: null,
    },
  } as const
  const gain = {
    type: 'effect',
    effect: {
      text: 'Ganhe 3 de ouro.',
      activation: [{ kind: 'gainGold', amount: 3 }],
      duration: { kind: 'immediate' },
      mark: null,
    },
  } as const
  const rewardConfig = {
    ...GAME_CONFIG_DEFAULTS,
    inventoryCapacity: 1,
    soloKnockoutGoldLossPercent: 0,
  }

  it.each([false, true])(
    'REQ-126/REQ-127: doação fatal com pagamento parcial conclui o revés (escolha pendente: %s)',
    async (withReward) => {
      const game = setup({
        requirements: [randomDiscard, donation, gold],
        player: {
          health: 1,
          hand: [strength.id],
          inventory: [{ cardId: spare.id, quantity: 1 }],
        },
        badOutcome: {
          text: 'Resolva o revés.',
          steps: withReward
            ? [
                heal,
                { type: 'drawRewards', count: 1 },
                heal,
                { type: 'drawRewards', count: 1 },
                gain,
              ]
            : [heal, gain],
        },
        rewardCards: [ore.id, potion.id],
        rewardConfig,
      })
      const encounterId = await game.reveal()
      const partial = await game.accept({
        type: 'payEventRequirement',
        encounterId,
        requirementId: randomDiscard.id,
      })
      const payments = [...partial.randomEventEncounter!.payments, lifeReceipt]
      const turn = { ...partial.turn }
      expect(turn.actionPoints).toBe(0)

      let finished = await game.accept({
        type: 'payEventRequirement',
        encounterId,
        requirementId: donation.id,
      })
      if (withReward) {
        for (const cardId of [ore.id, potion.id]) {
          expect(finished.randomEventEncounter).toMatchObject({
            phase: 'setback',
            payments,
          })
          expect(finished.turn).toEqual(turn)
          expect(finished.eventDecks[0].discard).toEqual([])
          expect(finished.pendingRewards).toMatchObject([{ cardId }])
          expect(game.playerState()).toMatchObject({
            health: 0,
            down: true,
            gold: 10,
          })
          expect(availableActions(finished, turn.memberId, new Set())).toEqual([
            'resolveReward',
          ])
          finished = await game.accept({
            type: 'resolveReward',
            rewardId: pendingRewardId(finished),
            choice: 'leave',
          })
        }
      }
      expect(finished.randomEventEncounter).toBeNull()
      expect(finished.pendingRewards).toEqual([])
      expect(finished.eventDecks[0].discard).toEqual([game.event.id])
      expect(game.playerState()).toMatchObject({
        down: false,
        gold: 13,
        lastRandomEvent: {
          resolution: 'setback',
          cause: 'gaveUp',
          peakDelta: -1,
          payments,
          replacement: { requested: 1, drawn: 1 },
        },
      })
      expect(game.playerState().health).toBeGreaterThan(0)
    }
  )

  it.each([4, 5])(
    'REQ-126/REQ-127: verifica o mínimo no último pagamento fatal com Vigor %i',
    async (initialVigor) => {
      const game = setup({
        requirements: [donation, minimum],
        player: { health: 1, vigor: initialVigor },
        outcome: { text: 'Resolva o êxito.', steps: [gain] },
        rewardConfig,
      })
      const encounterId = await game.reveal()
      const action = {
        type: 'payEventRequirement',
        encounterId,
        requirementId: donation.id,
      }
      if (initialVigor < minimum.value) {
        const before = game.party().randomEventEncounter
        const player = game.playerState()
        await game.refuse(action, {
          reason: 'eventMinimumNotMet',
          checks: [
            { requirementId: minimum.id, stat: 'vigor', minimum: 5, actual: 4 },
          ],
        })
        expect(game.party().randomEventEncounter).toEqual(before)
        expect(game.playerState()).toEqual(player)
        expect(game.party().eventDecks[0].discard).toEqual([])
        return
      }
      const finished = await game.accept(action)
      expect(finished.randomEventEncounter).toBeNull()
      expect(finished.eventDecks[0].discard).toEqual([game.event.id])
      expect(game.playerState()).toMatchObject({
        down: false,
        gold: 13,
        lastRandomEvent: {
          resolution: 'success',
          cause: 'requirementsMet',
          payments: [lifeReceipt],
        },
      })
      expect(game.playerState().health).toBeGreaterThan(0)
    }
  )
})

describe('TakePartyActionUseCase — encontro aleatório (T-41)', () => {
  it('REQ-117: inicializa deck misto semeado com todas as cópias executáveis', async () => {
    const combatCard = {
      ...combat,
      goodOutcome: { ...combat.goodOutcome, steps: [] },
      badOutcome: { ...combat.badOutcome, steps: [] },
    }
    const rngState = SeededRng.fromSeed(42).state()
    const game = setup({ combatCard, combatCopies: 2, rngState })
    const configured = [combatCard.id, combatCard.id, game.event.id]

    await game.start()

    expect(game.party().eventDecks).toEqual([
      {
        zoneType: 'urban',
        cards: shuffle(configured, SeededRng.fromState(rngState)),
        discard: [],
      },
    ])
    expect(game.party().rngState).toEqual(rngState)
  })

  it('REQ-117: permite antecipação quando o descarte do tipo de zona tem combate executável', async () => {
    const combatCard = {
      ...combat,
      goodOutcome: { ...combat.goodOutcome, steps: [] },
      badOutcome: { ...combat.badOutcome, steps: [] },
    }
    const urbanDeck = {
      zoneType: 'urban' as const,
      cards: [],
      discard: [combatCard.id],
    }
    const game = setup({
      combatCard,
      combatOnly: true,
      eventDecks: [urbanDeck],
    })

    await game.start()

    expect(game.party().eventDecks).toEqual([urbanDeck])
    expect(game.party()).toMatchObject({
      randomEventEncounter: { phase: 'anticipation', card: null },
    })
  })

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

  it.each(['compra', 'descarte'] as const)(
    'REQ-118: revela combate pela %s e identifica as duas cópias em ordem impressa com 0 PA',
    async (source) => {
      const enemy = combat.enemies[0]
      const combatCard = makeCombatEventCard({
        goodOutcome: emptyOutcome,
        badOutcome: emptyOutcome,
        enemies: [
          {
            ...enemy,
            modifiers: {
              ...enemy.modifiers,
              accuracy: 0,
              evasion: 0,
              celerity: 8,
            },
          },
        ],
      })
      const game = setup({
        combatCard,
        combatOnly: true,
        player: { peak: 0 },
        eventDecks: [
          {
            zoneType: 'urban',
            cards: source === 'compra' ? [combatCard.id] : [],
            discard: source === 'descarte' ? [combatCard.id] : [],
          },
        ],
      })

      await game.reveal()

      const party = game.party()
      expect(party).toMatchObject({
        randomEventEncounter: null,
        turn: { actionPoints: 0 },
        combat: {
          card: { id: combatCard.id },
          cycle: 1,
          turn: { actorId: 'member-1', phase: 'prepare' },
          enemies: [
            {
              id: expect.any(String),
              blockIndex: 0,
              copyIndex: 0,
              health: enemy.health,
            },
            {
              id: expect.any(String),
              blockIndex: 0,
              copyIndex: 1,
              health: enemy.health,
            },
          ],
        },
      })
      const state = party.combat
      if (!state) throw new Error('O combate deveria estar aberto')
      const enemyIds = state.enemies.map((copy) => copy.id)
      expect(new Set(enemyIds).size).toBe(2)
      expect(state.order).toEqual([...enemyIds, 'member-1'])
      expect(state.attackTargetIds).toEqual(enemyIds)
      expect(availableActions(party, party.turn.memberId, new Set())).toEqual([
        'combatAttack',
        'endCombatTurn',
      ])
      await game.refuse(
        {
          type: 'combatAttack',
          combatId: state.id,
          turnId: state.turn.id,
          targetId: 'missing',
        },
        { reason: 'combatTargetUnavailable' }
      )
      const passed = await game.accept({
        type: 'endCombatTurn',
        combatId: state.id,
        turnId: state.turn.id,
      })
      expect(passed.turn.actionPoints).toBe(0)
      expect(passed.combat).toMatchObject({
        cycle: 2,
        turn: { actorId: 'member-1' },
      })
      const next = passed.combat
      if (!next) throw new Error('O segundo ciclo deveria estar aberto')
      await game.refuse(
        { type: 'endCombatTurn', combatId: state.id, turnId: state.turn.id },
        { reason: 'staleCombatTurn' }
      )
      const attacked = await game.accept({
        type: 'combatAttack',
        combatId: next.id,
        turnId: next.turn.id,
        targetId: enemyIds[0],
      })
      expect(attacked.turn.actionPoints).toBe(0)
      expect(attacked.combat).toMatchObject({
        cycle: 3,
        enemies: [{ health: enemy.health - 4 }, { health: enemy.health }],
      })
    }
  )

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
