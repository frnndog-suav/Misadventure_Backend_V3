import { describe, expect, it } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TAttributeCard,
  TDimensionCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { makeFixtureContent } from '../../../../../../test/factories/make-card'
import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'

import { assembleMap } from '../../map-assembly'
import { createStartingPlayer } from '../../starting-player'
import { Party, type TCreatePartyInput } from '.'

const NOW = fixedClock('2026-11-14T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-14T13:00:00.000Z').now()

const FIXTURE = makeFixtureContent()
const warrior = FIXTURE.classes[0]
const dimension =
  FIXTURE.cards.find((c): c is TDimensionCard => c.type === 'dimension') ?? null
const zones = FIXTURE.cards.filter((c): c is TZoneCard => c.type === 'zone')
const attributeCards = FIXTURE.cards.filter(
  (c): c is TAttributeCard => c.type === 'attribute'
)

function input(override: Partial<TCreatePartyInput> = {}): TCreatePartyInput {
  return {
    name: 'Os Teimosos',
    characterName: 'Lia',
    playerClass: 'warrior',
    classDefinition: warrior,
    attributeCards,
    dimension,
    zones,
    config: { ...GAME_CONFIG_DEFAULTS },
    rngState: SeededRng.fromSeed(42).state(),
    now: NOW,
    ...override,
  }
}

describe('Party', () => {
  it('REQ-16: cria grupo de 1 com o host, idle e datas iguais', () => {
    const result = Party.create(input(), sequentialIds('p'))

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    const party = result.value
    expect(party.id.toString()).toBe('p-1')
    expect(party.name).toBe('Os Teimosos')
    expect(party.status).toBe('idle')
    expect(party.members).toHaveLength(1)
    expect(party.members[0].id.toString()).toBe('p-2')
    expect(party.members[0].characterName).toBe('Lia')
    expect(party.members[0].kind).toBe('human')
    expect(party.isHost(party.members[0])).toBe(true)
    expect(party.createdAt.toISOString()).toBe(NOW.toISOString())
    expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
  })

  it('REQ-16/REQ-31: registra PartyCreated e os eventos da preparação, na ordem', () => {
    const result = Party.create(input(), sequentialIds('p'))
    if (!result.isRight()) throw new Error('esperava sucesso')

    const events = result.value.pullDomainEvents()
    expect(events.map((e) => e.type)).toEqual([
      'PartyCreated',
      'MapAssembled',
      'StarterDeckGiven',
      'TurnOrderDecided',
      'PlayersArrived',
    ])
    const given = events[2]
    if (given.type !== 'StarterDeckGiven') throw new Error('evento errado')
    expect(given.memberId.toString()).toBe('p-2')
    expect(events[0].aggregateId.equals(result.value.id)).toBe(true)
    expect(events[0].occurredAt.toISOString()).toBe(NOW.toISOString())
  })

  it('REQ-17: nomes são gravados sem espaços nas pontas', () => {
    const result = Party.create(
      input({ name: '  Os Teimosos ', characterName: '\tLia  ' }),
      sequentialIds()
    )
    if (!result.isRight()) throw new Error('esperava sucesso')

    expect(result.value.name).toBe('Os Teimosos')
    expect(result.value.members[0].characterName).toBe('Lia')
  })

  it('REQ-17: limites aceitos (40 e 24 caracteres)', () => {
    const result = Party.create(
      input({ name: 'a'.repeat(40), characterName: 'b'.repeat(24) }),
      sequentialIds()
    )

    expect(result.isRight()).toBe(true)
  })

  it.each([
    ['required', undefined],
    ['notString', 42],
    ['notString', null],
    ['blank', '   '],
    ['blank', ''],
    ['tooLong', 'a'.repeat(41)],
  ])('REQ-17: name inválido → %s', (reason, name) => {
    const result = Party.create(input({ name }), sequentialIds())

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual({
        type: 'invalid',
        issues: [{ field: 'name', reason }],
      })
  })

  it.each([
    ['required', undefined],
    ['notString', ['Lia']],
    ['blank', ' '],
    ['tooLong', 'b'.repeat(25)],
  ])('REQ-17: characterName inválido → %s', (reason, characterName) => {
    const result = Party.create(input({ characterName }), sequentialIds())

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual({
        type: 'invalid',
        issues: [{ field: 'characterName', reason }],
      })
  })

  it('REQ-17: minPlayers > 1 → belowMinPlayers, depois dos campos', () => {
    const result = Party.create(
      input({
        name: '   ',
        characterName: 'Um nome com mais de vinte e quatro letras',
        config: { ...GAME_CONFIG_DEFAULTS, minPlayers: 2 },
      }),
      sequentialIds()
    )

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual({
        type: 'invalid',
        issues: [
          { field: 'name', reason: 'blank' },
          { field: 'characterName', reason: 'tooLong' },
          { field: 'members', reason: 'belowMinPlayers' },
        ],
      })
  })

  it('REQ-17: criação inválida não consome ids', () => {
    const ids = sequentialIds('p')
    Party.create(input({ name: '' }), ids)

    expect(ids.next().toString()).toBe('p-1')
  })

  it('REQ-23: guarda uma cópia da configuração', () => {
    const config = { ...GAME_CONFIG_DEFAULTS, actionPointsPerTurn: 3 }
    const result = Party.create(input({ config }), sequentialIds())
    if (!result.isRight()) throw new Error('esperava sucesso')

    config.actionPointsPerTurn = 4

    expect(result.value.config.actionPointsPerTurn).toBe(3)
  })

  it('REQ-31: o grupo nasce preparado: dimensão, mapa, ordem e jogador na cidade inicial', () => {
    const result = Party.create(input(), sequentialIds('p'))
    if (!result.isRight()) throw new Error('esperava sucesso')
    const party = result.value

    expect(party.dimension.dimensionCardId).toBe('fixture.test-dimension')
    expect(party.dimension.startingCityZoneId).toBe('fixture.gray-harbor')
    expect(party.dimension.map.zones.map((z) => z.zoneId).sort()).toEqual(
      zones.map((z) => z.id).sort()
    )
    expect(party.turnOrder.map((id) => id.toString())).toEqual(['p-2'])
    const { player } = party.members[0]
    expect(player.playerClasses).toEqual([
      { playerClass: 'warrior', deckLockMet: true },
    ])
    expect(player.hand).toHaveLength(7)
    expect(player.deck).toHaveLength(53)
    expect(player.zoneId).toBe('fixture.gray-harbor')
    expect(player.respawnZoneId).toBe('fixture.gray-harbor')
    expect(party.members[0].maxHealth).toBe(22)
  })

  it('REQ-31: sorteios na ordem mapa → deck → ordem; o save guarda o RNG depois deles', () => {
    const result = Party.create(input(), sequentialIds('p'))
    if (!result.isRight()) throw new Error('esperava sucesso')

    const rng = SeededRng.fromSeed(42)
    const map = assembleMap({
      zones,
      arrivalZoneTitle: 'Porto Cinzento',
      rng,
      maxAttempts: GAME_CONFIG_DEFAULTS.mapMaxAttempts,
    })
    const player = createStartingPlayer({
      config: { ...GAME_CONFIG_DEFAULTS },
      classDefinition: warrior,
      attributeCards,
      startingCityZoneId: 'fixture.gray-harbor',
      rng,
    })
    rng.nextInt(1, 20)

    if (map.isLeft()) throw new Error('esperava mapa')
    expect(result.value.dimension.map).toEqual(map.value.map)
    expect(result.value.members[0].player).toEqual(player)
    expect(result.value.rngState).toEqual(rng.state())
  })

  it('REQ-31: mesmo estado do RNG → mesmo grupo preparado', () => {
    const a = Party.create(input(), sequentialIds('p'))
    const b = Party.create(input(), sequentialIds('p'))
    if (!a.isRight() || !b.isRight()) throw new Error('esperava sucesso')

    expect(b.value.dimension).toEqual(a.value.dimension)
    expect(b.value.members[0].player).toEqual(a.value.members[0].player)
    expect(b.value.rngState).toEqual(a.value.rngState)
  })

  it.each([
    ['required', undefined],
    ['notString', 7],
    ['unknownClass', 'mage'],
  ])('REQ-35: playerClass inválido → %s', (reason, playerClass) => {
    const result = Party.create(
      input({
        playerClass,
        classDefinition: playerClass === 'mage' ? null : warrior,
      }),
      sequentialIds()
    )

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual({
        type: 'invalid',
        issues: [{ field: 'playerClass', reason }],
      })
  })

  it('REQ-35: classDefinition de outro playerClass → unknownClass', () => {
    const result = Party.create(
      input({ playerClass: 'rogue' }),
      sequentialIds()
    )

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual({
        type: 'invalid',
        issues: [{ field: 'playerClass', reason: 'unknownClass' }],
      })
  })

  it('REQ-35: problemas na ordem name, characterName, playerClass, members', () => {
    const result = Party.create(
      input({
        name: '',
        characterName: 42,
        playerClass: 'nope',
        classDefinition: null,
        config: { ...GAME_CONFIG_DEFAULTS, minPlayers: 2 },
      }),
      sequentialIds()
    )

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual({
        type: 'invalid',
        issues: [
          { field: 'name', reason: 'blank' },
          { field: 'characterName', reason: 'notString' },
          { field: 'playerClass', reason: 'unknownClass' },
          { field: 'members', reason: 'belowMinPlayers' },
        ],
      })
  })

  it('REQ-35: pedido inválido vem antes da dimensão inválida', () => {
    const result = Party.create(
      input({ name: '', dimension: null }),
      sequentialIds()
    )

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value.type).toBe('invalid')
  })

  it('REQ-36: sem Carta de Dimensão publicada → dimensionInvalid com dimensionCardId null', () => {
    const result = Party.create(
      input({ dimension: null, zones: [] }),
      sequentialIds()
    )

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual({
        type: 'dimensionInvalid',
        dimensionCardId: null,
        problems: [
          'A coleção precisa de 1 Carta de Dimensão publicada.',
          'A coleção precisa de pelo menos 1 zona Urbana publicada.',
        ],
      })
  })

  it('REQ-36: composição com problemas → dimensionInvalid com os textos de checkDimensionComposition', () => {
    const result = Party.create(
      input({ zones: zones.filter((z) => z.zoneType !== 'urban') }),
      sequentialIds()
    )

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual({
        type: 'dimensionInvalid',
        dimensionCardId: 'fixture.test-dimension',
        problems: ['A coleção precisa de pelo menos 1 zona Urbana publicada.'],
      })
  })

  it('REQ-36: gerador acima de mapMaxAttempts → dimensionInvalid com o texto do limite; não consome ids', () => {
    // Cidade de 1 seta, duas zonas de 1 seta e uma de 3: a composição passa
    // (6 setas ≥ 2 × 3), mas só monta se a de 3 sair primeiro. Procura a
    // primeira semente em que 1 tentativa não basta.
    const city = { ...zones[0], connectionArrows: 1, arrowLayout: null }
    const others = [1, 1, 3].map((arrows, n) => ({
      ...zones[3],
      id: `fixture.z-${n}`,
      title: `Z ${n}`,
      connectionArrows: arrows,
      arrowLayout: null,
    }))
    const blocked = [city, ...others]
    const seed = Array.from({ length: 100 }, (_, i) => i + 1).find((s) =>
      assembleMap({
        zones: blocked,
        arrivalZoneTitle: 'Porto Cinzento',
        rng: SeededRng.fromSeed(s),
        maxAttempts: 1,
      }).isLeft()
    )
    if (seed === undefined) throw new Error('nenhuma semente falhou')
    const ids = sequentialIds('p')

    const result = Party.create(
      input({
        zones: blocked,
        rngState: SeededRng.fromSeed(seed).state(),
        config: { ...GAME_CONFIG_DEFAULTS, mapMaxAttempts: 1 },
      }),
      ids
    )

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual({
        type: 'dimensionInvalid',
        dimensionCardId: 'fixture.test-dimension',
        problems: [
          'O gerador não montou o mapa dentro do limite de tentativas (mapMaxAttempts = 1).',
        ],
      })
    expect(ids.next().toString()).toBe('p-1')
  })

  it('REQ-20: startSession em idle → inSession, savedAt e SessionStarted', () => {
    const party = makeParty({ status: 'idle', savedAt: NOW })

    expect(party.startSession(LATER)).toBe(true)

    expect(party.status).toBe('inSession')
    expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    expect(party.pullDomainEvents().map((e) => e.type)).toEqual([
      'SessionStarted',
    ])
  })

  it('REQ-20 (D-29): startSession em inSession não muda nada', () => {
    const party = makeParty({ status: 'inSession', savedAt: NOW })

    expect(party.startSession(LATER)).toBe(false)

    expect(party.status).toBe('inSession')
    expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-21: endSession em inSession → idle, savedAt e SessionEnded', () => {
    const party = makeParty({ status: 'inSession', savedAt: NOW })

    const result = party.endSession(LATER)

    expect(result.isRight()).toBe(true)
    expect(party.status).toBe('idle')
    expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    expect(party.pullDomainEvents().map((e) => e.type)).toEqual([
      'SessionEnded',
    ])
  })

  it('REQ-21: endSession em idle é rejeitado e nada muda', () => {
    const party = makeParty({ status: 'idle', savedAt: NOW })

    const result = party.endSession(LATER)

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toBe('sessionNotActive')
    expect(party.status).toBe('idle')
    expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-24: abandon registra PartyAbandoned', () => {
    const party = makeParty()

    party.abandon(fixedClock().now())

    expect(party.pullDomainEvents().map((e) => e.type)).toEqual([
      'PartyAbandoned',
    ])
  })
})
