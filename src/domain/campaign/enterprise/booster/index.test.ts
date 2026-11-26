import { describe, expect, it } from 'vitest'

import type { SeededRng } from '@/core/rng/seeded-rng'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import {
  makeAttributeCard,
  makeItemCard,
} from '../../../../../test/factories/make-card'

import { boosterCandidatesOf, drawBoosterCards, isBooster } from '.'

type TStep = readonly [min: number, max: number, value: number]

/** RNG com chamadas `nextInt(min, max)` roteirizadas (confere faixa e fim do roteiro). */
function scriptedRng(steps: readonly TStep[]) {
  const queue = [...steps]
  const rng = {
    nextInt: (min: number, max: number) => {
      const next = queue.shift()
      if (!next) throw new Error(`chamada extra: nextInt(${min}, ${max})`)
      expect([min, max]).toEqual([next[0], next[1]])
      return next[2]
    },
  } as unknown as SeededRng
  return { rng, remaining: () => queue.length }
}

const config = (cardCount: number) => ({
  ...GAME_CONFIG_DEFAULTS,
  boosterCardCount: cardCount,
})

const candidate = (cardId: string, rarity: string) =>
  ({ cardId, rarity }) as { cardId: string; rarity: 'common' }

const COMMON = [candidate('a.c1', 'common'), candidate('a.c2', 'common')]
const UNCOMMON = [candidate('a.u1', 'uncommon')]
const RARE = [candidate('a.r1', 'rare')]

describe('drawBoosterCards (REQ-144; D-122)', () => {
  it('REQ-144: raridade pelas chances (600/250/110/35/5) e carta uniforme; a última carta é o slot garantido sem a Comum', () => {
    const { rng, remaining } = scriptedRng([
      [0, 999, 700], // 600–849 → Incomum
      [0, 0, 0], // 1 elegível Incomum
      [0, 999, 599], // 0–599 → Comum
      [0, 1, 1], // 2 elegíveis Comuns
      [0, 399, 300], // garantido: 250–359 → Rara (sem a Comum)
      [0, 0, 0],
    ])

    const drawn = drawBoosterCards(
      [...COMMON, ...UNCOMMON, ...RARE],
      config(3),
      rng
    )

    expect(drawn).toEqual(['a.u1', 'a.c2', 'a.r1'])
    expect(remaining()).toBe(0)
  })

  it('D-122: raridade sorteada sem elegíveis → refaz só entre as com elegíveis, na proporção das chances', () => {
    // só Comum (600) e Rara (110) têm elegíveis; total 710
    const { rng, remaining } = scriptedRng([
      [0, 999, 700], // Incomum, sem elegíveis → refaz
      [0, 709, 650], // 600–709 → Rara
      [0, 0, 0],
      [0, 399, 300], // garantido: 250–359 → Rara
      [0, 0, 0],
    ])

    const drawn = drawBoosterCards([...COMMON, ...RARE], config(2), rng)

    expect(drawn).toEqual(['a.r1', 'a.r1'])
    expect(remaining()).toBe(0)
  })

  it('D-122: slot garantido sem elegível de Incomum em diante → sorteado como slot comum', () => {
    const { rng, remaining } = scriptedRng([
      [0, 999, 10], // slot 1 comum
      [0, 1, 0],
      [0, 999, 20], // garantido sem Incomum+ → como slot comum
      [0, 1, 1],
    ])

    const drawn = drawBoosterCards(COMMON, config(2), rng)

    expect(drawn).toEqual(['a.c1', 'a.c2'])
    expect(remaining()).toBe(0)
  })

  it('D-122: coleção sem nenhuma elegível → null, sem usar o RNG', () => {
    const { rng, remaining } = scriptedRng([])

    expect(drawBoosterCards([], config(8), rng)).toBeNull()
    expect(remaining()).toBe(0)
  })

  it('REQ-144: a quantidade vem de boosterCardCount (1 carta = só o slot garantido)', () => {
    const { rng } = scriptedRng([
      [0, 399, 0],
      [0, 0, 0],
    ])

    expect(drawBoosterCards([...COMMON, ...UNCOMMON], config(1), rng)).toEqual([
      'a.u1',
    ])
  })
})

describe('boosterCandidatesOf (REQ-144, mesmo filtro da REQ-138)', () => {
  it('REQ-166: exclui itens de conclusão do booster', () => {
    const ordinary = makeItemCard({ id: 'fixture.ordinary' })
    const shard = makeItemCard({ id: 'fixture.shard', completionItem: true })

    expect(boosterCandidatesOf([shard, ordinary], 'fixture')).toMatchObject([
      { cardId: ordinary.id },
    ])
  })

  it('só a coleção do booster; sem tesouro nem booster; ordenadas por id', () => {
    const cards = [
      makeAttributeCard({ id: 'fixture.b' }),
      makeAttributeCard({ id: 'fixture.a' }),
      makeItemCard({ id: 'fixture.coin', itemCategory: 'treasure' }),
      makeItemCard({ id: 'fixture.pack', itemCategory: 'booster' }),
      makeItemCard({ id: 'fixture.potion' }),
      makeAttributeCard({ id: 'other.x', collectionId: 'other' }),
    ]

    expect(boosterCandidatesOf(cards, 'fixture').map((c) => c.cardId)).toEqual([
      'fixture.a',
      'fixture.b',
      'fixture.potion',
    ])
  })

  it('isBooster: só item da categoria booster', () => {
    expect(isBooster(makeItemCard({ itemCategory: 'booster' }))).toBe(true)
    expect(isBooster(makeItemCard())).toBe(false)
    expect(isBooster(makeAttributeCard())).toBe(false)
    expect(isBooster(undefined)).toBe(false)
  })
})
