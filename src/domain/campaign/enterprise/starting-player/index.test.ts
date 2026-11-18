import { describe, expect, it } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeAttributeCard,
  makeClassDefinition,
} from '../../../../../test/factories/make-card'

import { maxHealthOf } from '../entities/party-member'
import { createStartingPlayer, type TStartingPlayerInput } from '.'

const strength = makeAttributeCard()
const endurance = makeAttributeCard({
  id: 'fixture.endurance-basic',
  name: 'Resistência',
  attributes: ['endurance'],
})
/** O `warrior` da fixture (CONTRATO FEAT-06): 30 + 30, essenciais força e resistência. */
const warrior = makeClassDefinition({
  essentialAttributes: ['strength', 'endurance'],
  starterDeck: [
    { cardId: 'fixture.endurance-basic', copies: 30 },
    { cardId: 'fixture.strength-basic', copies: 30 },
  ],
})

function input(
  override: Partial<TStartingPlayerInput> = {}
): TStartingPlayerInput {
  return {
    config: { ...GAME_CONFIG_DEFAULTS },
    classDefinition: warrior,
    attributeCards: [strength, endurance],
    startingCityZoneId: 'fixture.gray-harbor',
    rng: SeededRng.fromSeed(42),
    ...override,
  }
}

describe('createStartingPlayer', () => {
  it('REQ-83: o cofre nasce vazio (slots, decks e ouro)', () => {
    expect(createStartingPlayer(input()).vault).toEqual({
      slots: [],
      decks: [],
      gold: 0,
    })
  })

  it('REQ-34: valores iniciais dos padrões, na cidade inicial, com a classe ativa', () => {
    const player = createStartingPlayer(input())

    expect(player).toMatchObject({
      playerClasses: [{ playerClass: 'warrior', deckLockMet: true }],
      build: warrior.starterDeck,
      discard: [],
      gold: 10,
      baseHealth: 20,
      health: 22,
      peak: 10,
      vigor: 10,
      modifiers: warrior.baseModifiers,
      zoneId: 'fixture.gray-harbor',
      respawnZoneId: 'fixture.gray-harbor',
    })
    expect(maxHealthOf(player)).toBe(22)
  })

  it('REQ-70 (9.1): nasce com inventário vazio e as 8 categorias de equipamento null', () => {
    const player = createStartingPlayer(input())

    expect(player.inventory).toEqual([])
    expect(player.equipment).toEqual({
      head: null,
      torso: null,
      legs: null,
      feet: null,
      cape: null,
      weapon: null,
      shield: null,
      accessory: null,
    })
  })

  it('REQ-70 (5.3): gold = min(initialGold, purseCapacity); o excedente é perdido', () => {
    const player = createStartingPlayer(
      input({
        config: {
          ...GAME_CONFIG_DEFAULTS,
          initialGold: 500,
          purseCapacity: 300,
        },
      })
    )

    expect(player.gold).toBe(300)
  })

  it('REQ-34: mão = as 7 primeiras do deck embaralhado; o deck fica com as 53 restantes', () => {
    const player = createStartingPlayer(input())

    expect(player.hand).toHaveLength(7)
    expect(player.deck).toHaveLength(53)
    const all = [...player.hand, ...player.deck]
    expect(all.filter((id) => id === 'fixture.strength-basic')).toHaveLength(30)
    expect(all.filter((id) => id === 'fixture.endurance-basic')).toHaveLength(
      30
    )
  })

  it('REQ-34: o deck é embaralhado pelo RNG (não sai na ordem da build) e é reprodutível', () => {
    const first = createStartingPlayer(input({ rng: SeededRng.fromSeed(5) }))
    const second = createStartingPlayer(input({ rng: SeededRng.fromSeed(5) }))
    const ordered = [
      ...Array.from({ length: 30 }, () => 'fixture.endurance-basic'),
      ...Array.from({ length: 30 }, () => 'fixture.strength-basic'),
    ]

    expect([...first.hand, ...first.deck]).not.toEqual(ordered)
    expect(second).toEqual(first)
  })

  it('REQ-34: initialHandSize da config do grupo define a mão', () => {
    const player = createStartingPlayer(
      input({ config: { ...GAME_CONFIG_DEFAULTS, initialHandSize: 3 } })
    )

    expect(player.hand).toHaveLength(3)
    expect(player.deck).toHaveLength(57)
  })

  it('REQ-34: vida máxima = ⌊baseHealth × (100 + peak) ÷ 100⌋, e a atual começa nela', () => {
    const player = createStartingPlayer(
      input({
        config: { ...GAME_CONFIG_DEFAULTS, baseHealth: 33, initialPeak: 15 },
      })
    )

    // 33 × 115 / 100 = 37,95 → 37
    expect(maxHealthOf(player)).toBe(37)
    expect(player.health).toBe(37)
  })

  it('REQ-34: lockTwoEssentials acima do deck pré-pronto (31) → trava desligada e modificadores padrão', () => {
    const player = createStartingPlayer(
      input({ config: { ...GAME_CONFIG_DEFAULTS, lockTwoEssentials: 31 } })
    )

    expect(player.playerClasses).toEqual([
      { playerClass: 'warrior', deckLockMet: false },
    ])
    expect(player.modifiers).toEqual({
      attack: 5,
      defense: 3,
      accuracy: 50,
      evasion: 20,
      celerity: 10,
      piercing: 0,
      reflection: 0,
    })
  })

  it('REQ-34: carta do starterDeck ausente no catálogo não conta na trava', () => {
    const player = createStartingPlayer(input({ attributeCards: [strength] }))

    expect(player.playerClasses[0].deckLockMet).toBe(false)
    expect([...player.hand, ...player.deck]).toHaveLength(60)
  })

  it('REQ-34: modificadores padrão vêm da config do grupo (não de constantes)', () => {
    const player = createStartingPlayer(
      input({
        config: {
          ...GAME_CONFIG_DEFAULTS,
          lockTwoEssentials: 31,
          defaultAttack: 9,
        },
      })
    )

    expect(player.modifiers.attack).toBe(9)
  })
})
