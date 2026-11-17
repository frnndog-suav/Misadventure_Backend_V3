import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeCollection,
  makeDimensionCard,
  makeFixtureContent,
  makeUrbanZoneCard,
} from '../../../../../../test/factories/make-card'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { fixedSeed } from '../../../../../../test/fakes/fixed-seed'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryGameConfigRepository } from '../../../../../../test/repositories/in-memory-game-config-repository'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { DimensionInvalidError } from '../_errors/dimension-invalid-error'
import { PartyInvalidError } from '../_errors/party-invalid-error'
import { CreatePartyUseCase } from '.'

const NOW = '2026-11-14T12:00:00.000Z'
const BODY = {
  name: 'Os Teimosos',
  characterName: 'Lia',
  playerClass: 'warrior',
}

let parties: InMemoryPartiesRepository
let configs: InMemoryGameConfigRepository
let catalog: InMemoryCardCatalog
let sut: CreatePartyUseCase

describe('CreatePartyUseCase', () => {
  beforeEach(() => {
    parties = new InMemoryPartiesRepository()
    configs = new InMemoryGameConfigRepository()
    catalog = new InMemoryCardCatalog()
    const fixture = makeFixtureContent()
    catalog.collections = fixture.collections
    catalog.cards = fixture.cards
    catalog.classes = fixture.classes
    sut = new CreatePartyUseCase(
      parties,
      new GetGameConfigUseCase(configs),
      catalog,
      fixedClock(NOW),
      sequentialIds('p'),
      fixedSeed(42)
    )
  })

  it('REQ-16: cria e grava o grupo de 1', async () => {
    const result = await sut.execute({ body: BODY })

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    const { party } = result.value
    expect(party.name).toBe('Os Teimosos')
    expect(party.status).toBe('idle')
    expect(party.members.map((m) => m.characterName)).toEqual(['Lia'])
    expect(party.createdAt.toISOString()).toBe(NOW)
    expect(party.savedAt.toISOString()).toBe(NOW)
    const stored = await parties.findById(party.id.toString())
    expect(stored?.name).toBe('Os Teimosos')
    expect(stored?.rngState).toEqual(party.rngState)
    expect(stored?.config).toEqual(party.config)
  })

  it('REQ-31: preparado na dimensão da fixture com o warrior; RNG gravado depois dos sorteios', async () => {
    const result = await sut.execute({ body: BODY })
    if (!result.isRight()) throw new Error('esperava sucesso')
    const { party } = result.value

    expect(party.dimension.dimensionCardId).toBe('fixture.test-dimension')
    expect(party.dimension.startingCityZoneId).toBe('fixture.gray-harbor')
    expect(party.dimension.map.zones).toHaveLength(4)
    expect(party.turnOrder.map((id) => id.toString())).toEqual(['p-2'])
    expect(party.members[0].player).toMatchObject({
      playerClasses: [{ playerClass: 'warrior', deckLockMet: true }],
      gold: 10,
      baseHealth: 20,
      health: 22,
      peak: 10,
      vigor: 10,
      modifiers: {
        attack: 6,
        defense: 5,
        accuracy: 45,
        evasion: 15,
        celerity: 8,
        piercing: 0,
        reflection: 0,
      },
      zoneId: 'fixture.gray-harbor',
      respawnZoneId: 'fixture.gray-harbor',
    })
    expect(party.members[0].player.hand).toHaveLength(7)
    expect(party.members[0].player.deck).toHaveLength(53)
    expect(party.rngState).not.toEqual(SeededRng.fromSeed(42).state())
  })

  it('REQ-31: eventos na ordem PartyCreated, MapAssembled, StarterDeckGiven, TurnOrderDecided, PlayersArrived', async () => {
    const result = await sut.execute({ body: BODY })
    if (!result.isRight()) throw new Error('esperava sucesso')

    expect(result.value.party.pullDomainEvents().map((e) => e.type)).toEqual([
      'PartyCreated',
      'MapAssembled',
      'StarterDeckGiven',
      'TurnOrderDecided',
      'PlayersArrived',
      'TurnStarted',
    ])
  })

  it('REQ-31: usa a Carta de Dimensão de menor releaseOrder, com as zonas da coleção dela', async () => {
    catalog.collections.push(makeCollection({ id: 'zeta', name: 'Zeta' }))
    catalog.cards.push(
      makeDimensionCard({
        id: 'zeta.dim',
        collectionId: 'zeta',
        releaseOrder: 2,
        arrivalZoneTitle: null,
      }),
      makeUrbanZoneCard({ id: 'zeta.city', collectionId: 'zeta' })
    )

    const result = await sut.execute({ body: BODY })
    if (!result.isRight()) throw new Error('esperava sucesso')

    expect(result.value.party.dimension.dimensionCardId).toBe(
      'fixture.test-dimension'
    )
    expect(
      result.value.party.dimension.map.zones.every((z) =>
        z.zoneId.startsWith('fixture.')
      )
    ).toBe(true)
  })

  it('REQ-34: lockTwoEssentials = 31 → deckLockMet false e modificadores padrão', async () => {
    configs.item = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      lockTwoEssentials: 31,
    })

    const result = await sut.execute({ body: BODY })
    if (!result.isRight()) throw new Error('esperava sucesso')

    const { player } = result.value.party.members[0]
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

  it.each([null, 'texto', 42, ['a']])(
    'REQ-17: corpo que não é objeto (%j) → invalidBody',
    async (body) => {
      const result = await sut.execute({ body })

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value).toBeInstanceOf(PartyInvalidError)
        expect(result.value.details).toEqual({
          fields: [{ field: null, reason: 'invalidBody' }],
        })
      }
    }
  )

  it('REQ-17: campos inválidos → PARTY_INVALID e nada é gravado', async () => {
    const result = await sut.execute({
      body: {
        ...BODY,
        name: '   ',
        characterName: 'Um nome com mais de vinte e quatro letras',
      },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value.code).toBe('PARTY_INVALID')
      expect(result.value.message).toBe('Dados do grupo inválidos.')
      expect(result.value.details).toEqual({
        fields: [
          { field: 'name', reason: 'blank' },
          { field: 'characterName', reason: 'tooLong' },
        ],
      })
    }
    expect(parties.items).toEqual([])
  })

  it('REQ-17: minPlayers = 2 → belowMinPlayers', async () => {
    configs.item = GameConfig.create({ ...GAME_CONFIG_DEFAULTS, minPlayers: 2 })

    const result = await sut.execute({ body: BODY })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value.details).toEqual({
        fields: [{ field: 'members', reason: 'belowMinPlayers' }],
      })
    expect(parties.items).toEqual([])
  })

  it('REQ-35: playerClass ausente → required', async () => {
    const result = await sut.execute({
      body: { name: 'Os Teimosos', characterName: 'Lia' },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value.details).toEqual({
        fields: [{ field: 'playerClass', reason: 'required' }],
      })
  })

  it('REQ-35: classe sem publicação no catálogo (mage) → unknownClass e nada é gravado', async () => {
    const result = await sut.execute({ body: { ...BODY, playerClass: 'mage' } })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(PartyInvalidError)
      expect(result.value.details).toEqual({
        fields: [{ field: 'playerClass', reason: 'unknownClass' }],
      })
    }
    expect(parties.items).toEqual([])
  })

  it('REQ-36: sem Carta de Dimensão publicada → DIMENSION_INVALID com dimensionCardId null; nada é gravado', async () => {
    catalog.cards = catalog.cards.filter((card) => card.type !== 'dimension')

    const result = await sut.execute({ body: BODY })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(DimensionInvalidError)
      expect(result.value.code).toBe('DIMENSION_INVALID')
      expect(result.value.message).toBe(
        'Não foi possível preparar a dimensão. Avise o designer da coleção.'
      )
      expect(result.value.details).toEqual({
        dimensionCardId: null,
        problems: [
          'A coleção precisa de 1 Carta de Dimensão publicada.',
          'A coleção precisa de pelo menos 1 zona Urbana publicada.',
        ],
      })
    }
    expect(parties.items).toEqual([])
  })

  it('REQ-36: composição inválida → DIMENSION_INVALID com os problemas', async () => {
    catalog.cards = catalog.cards.map((card) =>
      card.type === 'dimension'
        ? { ...card, arrivalZoneTitle: 'Atlântida' }
        : card
    )

    const result = await sut.execute({ body: BODY })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value.details).toEqual({
        dimensionCardId: 'fixture.test-dimension',
        problems: [
          'A zona de chegada "Atlântida" da Carta de Dimensão não é uma zona Urbana publicada da coleção.',
        ],
      })
    expect(parties.items).toEqual([])
  })

  it('REQ-37: gravado e lido (memória) → mapa, ordem, jogador (com a ordem do deck) e RNG iguais', async () => {
    const result = await sut.execute({ body: BODY })
    if (!result.isRight()) throw new Error('esperava sucesso')
    const { party } = result.value

    const stored = await parties.findById(party.id.toString())

    expect(stored).not.toBeNull()
    if (!stored) return
    expect(stored).not.toBe(party)
    expect(stored.dimension).toEqual(party.dimension)
    expect(stored.turnOrder).toEqual(party.turnOrder)
    expect(stored.members[0].player).toEqual(party.members[0].player)
    expect(stored.members[0].player.deck).toEqual(party.members[0].player.deck)
    expect(stored.rngState).toEqual(party.rngState)
    expect(SeededRng.fromState(stored.rngState).nextUint32()).toBe(
      SeededRng.fromState(party.rngState).nextUint32()
    )
  })

  it('REQ-23: grupo guarda a config da criação; o laboratório muda depois', async () => {
    const first = await sut.execute({ body: { ...BODY, name: 'Antes' } })
    configs.item = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      actionPointsPerTurn: 4,
    })
    const second = await sut.execute({ body: { ...BODY, name: 'Depois' } })
    configs.item = null

    if (!first.isRight() || !second.isRight())
      throw new Error('esperava sucesso')
    expect(first.value.party.config.actionPointsPerTurn).toBe(3)
    expect(second.value.party.config.actionPointsPerTurn).toBe(4)
  })

  it('REQ-25: sucesso grava uma vez; erro não grava', async () => {
    const create = vi.spyOn(parties, 'create')

    await sut.execute({ body: { ...BODY, name: '' } })
    expect(create).not.toHaveBeenCalled()

    await sut.execute({ body: BODY })
    expect(create).toHaveBeenCalledTimes(1)
  })
})
