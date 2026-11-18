import { describe, expect, it } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import {
  makeDimensionCard,
  makeEquipmentCard,
  makeItemCard,
  makeUrbanZoneCard,
  makeZoneCard,
} from '../../../../../test/factories/make-card'
import { makePlayerState } from '../../../../../test/factories/make-party'

import { shuffle } from '../shuffle'
import { assembleRewardDecks, scavengeTargets } from '.'

const ROD = makeItemCard({
  id: 'fixture.fishing-rod',
  itemCategory: 'tool',
  toolKind: 'fishing-rod',
  scavengeZoneTypes: ['coastal', 'urban'],
})
const PICKAXE = makeItemCard({
  id: 'fixture.pickaxe',
  itemCategory: 'tool',
  toolKind: 'pickaxe',
  scavengeZoneTypes: ['underground'],
})
const FISH = makeItemCard({
  id: 'fixture.silver-fish',
  itemCategory: 'material',
  scavengeTool: 'fishing-rod',
})
const ORE = makeItemCard({
  id: 'fixture.iron-ore',
  itemCategory: 'material',
  scavengeTool: 'pickaxe',
})
const BOOT = makeEquipmentCard({
  id: 'fixture.old-boot',
  scavengeTool: 'fishing-rod',
})
const POTION = makeItemCard({ id: 'fixture.healing-potion' })
const CARDS = [ROD, PICKAXE, FISH, ORE, BOOT, POTION]

const HARBOR = makeUrbanZoneCard({
  zoneActions: ['startEvent', 'scavenge', 'useVault', 'saveRespawnPoint'],
})
const DIMENSION = makeDimensionCard({
  rewardDecks: [
    {
      zoneType: 'urban',
      cards: [
        { cardId: FISH.id, copies: 2 },
        { cardId: ORE.id, copies: 1 },
        { cardId: BOOT.id, copies: 1 },
        { cardId: POTION.id, copies: 3 },
      ],
    },
    { zoneType: 'underground', cards: [{ cardId: ORE.id, copies: 2 }] },
  ],
})

const slot = (cardId: string) => ({ cardId, quantity: 1 })
const targets = (
  inventory: { cardId: string; quantity: number }[],
  zone = HARBOR
) =>
  scavengeTargets({
    player: makePlayerState({ inventory }),
    zone,
    dimension: DIMENSION,
    cards: CARDS,
  })

describe('scavengeTargets (REQ-90)', () => {
  it('REQ-90: ferramenta que vasculha o tipo da zona → cartas do deck daquele tipo coletadas por ela, distintas e em ordem de cardId', () => {
    expect(targets([slot(ROD.id)])).toEqual([BOOT.id, FISH.id])
  })

  it('REQ-90: ferramenta que não vasculha o tipo da zona → vazio', () => {
    expect(targets([slot(PICKAXE.id)])).toEqual([])
  })

  it('REQ-90: sem ferramenta no inventário → vazio (equipamento em uso não conta)', () => {
    expect(targets([])).toEqual([])
    expect(
      scavengeTargets({
        player: makePlayerState({
          equipment: { ...makePlayerState().equipment, weapon: ROD.id },
        }),
        zone: HARBOR,
        dimension: DIMENSION,
        cards: CARDS,
      })
    ).toEqual([])
  })

  it('REQ-90: zona sem scavenge em zoneActions → vazio', () => {
    expect(targets([slot(ROD.id)], makeUrbanZoneCard())).toEqual([])
  })

  it('REQ-90: tipo de zona sem entrada em rewardDecks → vazio', () => {
    const coast = makeZoneCard({ id: 'fixture.coast', zoneType: 'coastal' })
    expect(targets([slot(ROD.id)], coast)).toEqual([])
  })

  it('REQ-90: duas ferramentas → a união; zona ou dimensão ausentes → vazio', () => {
    const mine = makeZoneCard({
      id: 'fixture.old-mine',
      zoneType: 'underground',
    })
    expect(targets([slot(ROD.id), slot(PICKAXE.id)], mine)).toEqual([ORE.id])
    expect(
      scavengeTargets({
        player: makePlayerState({ inventory: [slot(ROD.id)] }),
        zone: null,
        dimension: DIMENSION,
        cards: CARDS,
      })
    ).toEqual([])
    expect(
      scavengeTargets({
        player: makePlayerState({ inventory: [slot(ROD.id)] }),
        zone: HARBOR,
        dimension: null,
        cards: CARDS,
      })
    ).toEqual([])
  })
})

describe('assembleRewardDecks (REQ-89)', () => {
  it('REQ-89: um deck por entrada, na ordem da carta; cópias expandidas na ordem listada e embaralhadas (Fisher–Yates)', () => {
    const rng = SeededRng.fromSeed(7)
    const decks = assembleRewardDecks(DIMENSION.rewardDecks, rng)

    const expected = SeededRng.fromSeed(7)
    const urban = shuffle(
      [FISH.id, FISH.id, ORE.id, BOOT.id, POTION.id, POTION.id, POTION.id],
      expected
    )
    const underground = shuffle([ORE.id, ORE.id], expected)
    expect(decks).toEqual([
      { zoneType: 'urban', cards: urban },
      { zoneType: 'underground', cards: underground },
    ])
    expect(rng.state()).toEqual(expected.state())
  })

  it('REQ-89: sem rewardDecks → nenhum deck e o RNG não é usado', () => {
    const rng = SeededRng.fromSeed(7)
    expect(assembleRewardDecks([], rng)).toEqual([])
    expect(rng.state()).toEqual(SeededRng.fromSeed(7).state())
  })
})
