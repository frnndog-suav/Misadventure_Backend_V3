import { describe, expect, it } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TAttributeCard,
  TDimensionCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { makeFixtureContent } from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { assembleMap } from '../../map-assembly'
import { PartyMember, type TPlayerState } from '../party-member'
import { shuffle } from '../../shuffle'
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
      'TurnStarted',
    ])
    const given = events[2]
    if (given.type !== 'StarterDeckGiven') throw new Error('evento errado')
    expect(given.memberId.toString()).toBe('p-2')
    const started = events[5]
    if (started.type !== 'TurnStarted') throw new Error('evento errado')
    expect(started.memberId.toString()).toBe('p-2')
    expect(started.round).toBe(1)
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
          { field: 'aiHelperCount', reason: 'belowMinPlayers' },
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

  it('REQ-55: a primeira vez é do 1º da ordem, na rodada 1, com os pontos da config (3 no padrão)', () => {
    const result = Party.create(input(), sequentialIds('p'))
    if (!result.isRight()) throw new Error('esperava sucesso')

    const { turn } = result.value
    expect(turn.round).toBe(1)
    expect(turn.memberId.equals(result.value.turnOrder[0])).toBe(true)
    expect(turn.actionPoints).toBe(3)
  })

  it('REQ-54: os pontos por vez vêm da config do grupo, mesmo que a config de origem mude depois', () => {
    const config = { ...GAME_CONFIG_DEFAULTS, actionPointsPerTurn: 5 }
    const result = Party.create(input({ config }), sequentialIds('p'))
    if (!result.isRight()) throw new Error('esperava sucesso')
    const party = result.value

    config.actionPointsPerTurn = 2
    expect(party.turn.actionPoints).toBe(5)
    party.startSession(LATER)
    party.endTurn(LATER)

    expect(party.turn.actionPoints).toBe(5)
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
          { field: 'aiHelperCount', reason: 'belowMinPlayers' },
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

  describe('move (REQ-51, REQ-52)', () => {
    const HARBOR = 'fixture.gray-harbor'
    const MINE = 'fixture.old-mine'
    // Mapa de 3 zonas: porto—mina com travessia; a ilha está no mapa sem travessia.
    const dimension = {
      dimensionCardId: 'fixture.test-dimension',
      startingCityZoneId: HARBOR,
      map: {
        zones: [
          { zoneId: HARBOR, x: 0, y: 0, arrows: ['east'] as const },
          { zoneId: MINE, x: 1, y: 0, arrows: ['west'] as const },
          { zoneId: 'fixture.island', x: 5, y: 5, arrows: [] as const },
        ],
        crossings: [{ zoneIds: [HARBOR, MINE] as const }],
      },
    }
    const inSession = () =>
      makeParty({ status: 'inSession', dimension, savedAt: NOW })

    it('REQ-51: move para zona conectada: zoneId muda, o resto do jogador não', () => {
      const party = inSession()
      const before = party.members[0].player

      const result = party.move(MINE, LATER)

      expect(result.isRight()).toBe(true)
      const after = party.members[0].player
      expect(after.zoneId).toBe(MINE)
      expect(after.respawnZoneId).toBe(HARBOR)
      expect({ ...after, zoneId: before.zoneId }).toEqual(before)
      expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    })

    it('REQ-51: PlayerMoved com membro, origem e destino', () => {
      const party = inSession()

      party.move(MINE, LATER)

      const events = party.pullDomainEvents()
      expect(events.map((e) => e.type)).toEqual(['PlayerMoved'])
      const moved = events[0]
      if (moved.type !== 'PlayerMoved') throw new Error('evento errado')
      expect(moved.memberId.toString()).toBe('member-1')
      expect(moved.fromZoneId).toBe(HARBOR)
      expect(moved.toZoneId).toBe(MINE)
      expect(moved.aggregateId.equals(party.id)).toBe(true)
      expect(moved.occurredAt.toISOString()).toBe(LATER.toISOString())
    })

    it('REQ-51: mover de novo, inclusive de volta, é aceito; eventos em ordem', () => {
      const party = inSession()

      expect(party.move(MINE, LATER).isRight()).toBe(true)
      expect(party.move(HARBOR, LATER).isRight()).toBe(true)
      expect(party.move(MINE, LATER).isRight()).toBe(true)

      expect(party.members[0].player.zoneId).toBe(MINE)
      const route = party
        .pullDomainEvents()
        .map((e) =>
          e.type === 'PlayerMoved' ? `${e.fromZoneId}>${e.toZoneId}` : e.type
        )
      expect(route).toEqual([
        `${HARBOR}>${MINE}`,
        `${MINE}>${HARBOR}`,
        `${HARBOR}>${MINE}`,
      ])
    })

    it('REQ-51 (D-63): quem move é o membro da vez, não o host', () => {
      const base = inSession()
      const host = base.members[0]
      const other = PartyMember.create(
        { characterName: 'Bo', kind: 'human', player: host.player },
        new UniqueEntityID('member-0')
      )
      const party = makeParty({
        status: 'inSession',
        dimension,
        members: [host, other],
        hostMemberId: host.id,
        turnOrder: [other.id, host.id],
      })

      party.move(MINE, LATER)

      expect(party.members[0].player.zoneId).toBe(HARBOR)
      expect(party.members[1].player.zoneId).toBe(MINE)
      const moved = party.pullDomainEvents()[0]
      if (moved.type !== 'PlayerMoved') throw new Error('evento errado')
      expect(moved.memberId.equals(other.id)).toBe(true)
    })

    it('REQ-56: cada move gasta 1 ponto (3 → 2 → 1 → 0)', () => {
      const party = inSession()

      party.move(MINE, LATER)
      expect(party.turn.actionPoints).toBe(2)
      party.move(HARBOR, LATER)
      expect(party.turn.actionPoints).toBe(1)
      party.move(MINE, LATER)
      expect(party.turn.actionPoints).toBe(0)
    })

    it('REQ-56: o 4º move (mesmo para zona conectada) → noActionPoints; nada muda, nenhum evento', () => {
      const party = inSession()
      party.move(MINE, LATER)
      party.move(HARBOR, LATER)
      party.move(MINE, LATER)
      party.pullDomainEvents()
      const savedAt = party.savedAt

      const result = party.move(
        HARBOR,
        fixedClock('2026-11-14T18:00:00.000Z').now()
      )

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) expect(result.value).toBe('noActionPoints')
      expect(party.members[0].player.zoneId).toBe(MINE)
      expect(party.turn.actionPoints).toBe(0)
      expect(party.savedAt.toISOString()).toBe(savedAt.toISOString())
      expect(party.pullDomainEvents()).toEqual([])
    })

    it('REQ-56: ordem zoneNotInMap → noActionPoints → notConnected', () => {
      const party = inSession()
      party.move(MINE, LATER)
      party.move(HARBOR, LATER)
      party.move(MINE, LATER)

      const outside = party.move('fixture.nowhere', LATER)
      const notConnected = party.move('fixture.island', LATER)

      expect(outside.isLeft() && outside.value).toBe('zoneNotInMap')
      expect(notConnected.isLeft() && notConnected.value).toBe('noActionPoints')
    })

    it('REQ-56: recusado por notConnected, o ponto não é gasto', () => {
      const party = inSession()

      party.move('fixture.island', LATER)

      expect(party.turn.actionPoints).toBe(3)
    })

    it('REQ-51: o RNG não é consumido', () => {
      const party = inSession()
      const before = [...party.rngState]

      party.move(MINE, LATER)

      expect([...party.rngState]).toEqual(before)
    })

    it('REQ-52: zona que não é do mapa → zoneNotInMap, nada muda', () => {
      const party = inSession()

      const result = party.move('fixture.nowhere', LATER)

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) expect(result.value).toBe('zoneNotInMap')
      expect(party.members[0].player.zoneId).toBe(HARBOR)
      expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
      expect(party.pullDomainEvents()).toEqual([])
    })

    it('REQ-52: zona do mapa sem travessia → notConnected, nada muda', () => {
      const party = inSession()

      const result = party.move('fixture.island', LATER)

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) expect(result.value).toBe('notConnected')
      expect(party.members[0].player.zoneId).toBe(HARBOR)
      expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
      expect(party.pullDomainEvents()).toEqual([])
    })

    it('REQ-52: a própria zona atual → notConnected', () => {
      const party = inSession()

      const result = party.move(HARBOR, LATER)

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) expect(result.value).toBe('notConnected')
      expect(party.pullDomainEvents()).toEqual([])
    })

    it('REQ-53: fora de sessão → sessionNotActive, antes de conferir a zona', () => {
      const party = makeParty({ status: 'idle', dimension, savedAt: NOW })

      const result = party.move('fixture.nowhere', LATER)

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) expect(result.value).toBe('sessionNotActive')
      expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
      expect(party.pullDomainEvents()).toEqual([])
    })
  })

  describe('endTurn (REQ-57)', () => {
    const member = (id: string) =>
      PartyMember.create(
        { characterName: id, kind: 'human', player: makePlayerState() },
        new UniqueEntityID(id)
      )
    const trio = () => {
      const [a, b, c] = [member('m-a'), member('m-b'), member('m-c')]
      return makeParty({
        status: 'inSession',
        members: [a, b, c],
        hostMemberId: a.id,
        turnOrder: [b.id, c.id, a.id],
        savedAt: NOW,
      })
    }

    it('REQ-57: 1 membro → mesmo membro, rodada + 1, pontos cheios; os que sobraram se perdem', () => {
      const party = makeParty({ status: 'inSession', savedAt: NOW })
      party.move('fixture.old-mine', LATER)

      const result = party.endTurn(LATER)

      expect(result.isRight()).toBe(true)
      expect(party.turn.round).toBe(2)
      expect(party.turn.memberId.toString()).toBe('member-1')
      expect(party.turn.actionPoints).toBe(3)
      expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    })

    it('REQ-57: vários membros → o seguinte em turnOrder, mesma rodada, pontos cheios', () => {
      const party = trio()

      party.endTurn(LATER)

      expect(party.turn.memberId.toString()).toBe('m-c')
      expect(party.turn.round).toBe(1)
      expect(party.turn.actionPoints).toBe(3)
    })

    it('REQ-57: do último para o primeiro, a rodada sobe 1', () => {
      const party = trio()

      party.endTurn(LATER)
      party.endTurn(LATER)
      expect(party.turn.memberId.toString()).toBe('m-a')
      expect(party.turn.round).toBe(1)
      party.endTurn(LATER)

      expect(party.turn.memberId.toString()).toBe('m-b')
      expect(party.turn.round).toBe(2)
    })

    it('REQ-57 (K2): aceito com 0 pontos', () => {
      const party = makeParty({ status: 'inSession', savedAt: NOW })
      party.move('fixture.old-mine', LATER)
      party.move('fixture.gray-harbor', LATER)
      party.move('fixture.old-mine', LATER)
      expect(party.turn.actionPoints).toBe(0)

      const result = party.endTurn(LATER)

      expect(result.isRight()).toBe(true)
      expect(party.turn.actionPoints).toBe(3)
    })

    it('REQ-57: TurnEnded (vez que acabou) e TurnStarted (nova), nesta ordem', () => {
      const party = trio()

      party.endTurn(LATER)

      const events = party.pullDomainEvents()
      expect(events.map((e) => e.type)).toEqual(['TurnEnded', 'TurnStarted'])
      const [ended, started] = events
      if (ended.type !== 'TurnEnded' || started.type !== 'TurnStarted')
        throw new Error('evento errado')
      expect(ended.memberId.toString()).toBe('m-b')
      expect(ended.round).toBe(1)
      expect(started.memberId.toString()).toBe('m-c')
      expect(started.round).toBe(1)
      expect(ended.occurredAt.toISOString()).toBe(LATER.toISOString())
      expect(started.aggregateId.equals(party.id)).toBe(true)
    })

    it('REQ-57: na virada, TurnStarted traz a rodada nova e TurnEnded a antiga', () => {
      const party = makeParty({ status: 'inSession', savedAt: NOW })

      party.endTurn(LATER)

      const [ended, started] = party.pullDomainEvents()
      if (ended.type !== 'TurnEnded' || started.type !== 'TurnStarted')
        throw new Error('evento errado')
      expect(ended.round).toBe(1)
      expect(started.round).toBe(2)
    })

    it('REQ-57: o RNG não é consumido', () => {
      const party = trio()
      const before = [...party.rngState]

      party.endTurn(LATER)

      expect([...party.rngState]).toEqual(before)
    })

    it('REQ-57: fora de sessão → sessionNotActive; nada muda', () => {
      const party = makeParty({ status: 'idle', savedAt: NOW })

      const result = party.endTurn(LATER)

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) expect(result.value).toBe('sessionNotActive')
      expect(party.turn.round).toBe(1)
      expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
      expect(party.pullDomainEvents()).toEqual([])
    })
  })

  describe('REQ-62: build e pasta no estado do jogador', () => {
    it('a criação põe a build do deck pré-pronto em ordem de cardId e a pasta vazia; o invariante vale', () => {
      const rogue = FIXTURE.classes[1]
      const result = Party.create(
        input({ playerClass: 'rogue', classDefinition: rogue }),
        sequentialIds('p')
      )
      if (!result.isRight()) throw new Error('esperava sucesso')
      const { player } = result.value.members[0]

      expect(player.build).toEqual([
        { cardId: 'fixture.dexterity-basic', copies: 40 },
        { cardId: 'fixture.strength-basic', copies: 20 },
      ])
      expect(player.tcgFolder).toEqual([])
      expect(
        player.deck.length + player.hand.length + player.discard.length
      ).toBe(60)
    })
  })

  describe('recover (REQ-63, REQ-64)', () => {
    const PLAYER = (override: Partial<TPlayerState> = {}) =>
      makePlayerState(override)
    const partyOf = (
      player: Partial<TPlayerState> = {},
      config: Partial<typeof GAME_CONFIG_DEFAULTS> = {},
      status: 'idle' | 'inSession' = 'inSession'
    ) => {
      const host = PartyMember.create(
        { characterName: 'Lia', kind: 'human', player: PLAYER(player) },
        new UniqueEntityID('member-1')
      )
      return makeParty({
        status,
        members: [host],
        hostMemberId: host.id,
        config: { ...GAME_CONFIG_DEFAULTS, ...config },
        savedAt: NOW,
      })
    }
    const playerOf = (party: Party) => party.members[0].player

    it('REQ-63: gasta 1 ponto, grava savedAt e registra PlayerRecovered com valores efetivos', () => {
      const party = partyOf({ health: 10, vigor: 5 })

      const result = party.recover('drawToHand', LATER)

      expect(result.isRight()).toBe(true)
      expect(party.turn.actionPoints).toBe(2)
      expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
      const [event] = party.pullDomainEvents()
      expect(event).toMatchObject({
        type: 'PlayerRecovered',
        memberId: new UniqueEntityID('member-1'),
        option: 'drawToHand',
        healthRestored: 3,
        vigorRestored: 1,
        cardsDrawn: 0,
        occurredAt: LATER,
      })
    })

    it('REQ-63: vida +⌊22×15÷100⌋ = 3 e Vigor +⌊10×5÷100⌋→mínimo 1', () => {
      const party = partyOf({ health: 10, vigor: 5 })

      party.recover('drawToHand', LATER)

      expect(playerOf(party).health).toBe(13)
      expect(playerOf(party).vigor).toBe(6)
    })

    it('REQ-63: não passa de maxHealth nem do Pico; o evento traz o efetivo', () => {
      const party = partyOf({ health: 21, vigor: 10 })

      party.recover('shuffleDiscard', LATER)

      expect(playerOf(party).health).toBe(22)
      expect(playerOf(party).vigor).toBe(10)
      expect(party.pullDomainEvents()[0]).toMatchObject({
        healthRestored: 1,
        vigorRestored: 0,
      })
    })

    it('REQ-63: percentual que dá 0 ainda restaura o mínimo de 1 (12.5, 7.3)', () => {
      const party = partyOf(
        { health: 10, vigor: 5 },
        { recoverHealthPercent: 1, recoverVigorPercent: 0 }
      )

      party.recover('drawToHand', LATER)

      expect(playerOf(party).health).toBe(11)
      expect(playerOf(party).vigor).toBe(6)
    })

    it('REQ-63: usa os percentuais da config do grupo', () => {
      const party = partyOf(
        { health: 1, vigor: 0, peak: 10 },
        { recoverHealthPercent: 50, recoverVigorPercent: 50 }
      )

      party.recover('drawToHand', LATER)

      expect(playerOf(party).health).toBe(12)
      expect(playerOf(party).vigor).toBe(5)
    })

    it('REQ-63 (a): compra do topo até a mão ter recoverHandSize; o RNG fica intacto', () => {
      const deck = ['d1', 'd2', 'd3', 'd4', 'd5']
      const party = partyOf({ hand: ['h1', 'h2', 'h3'], deck })
      const before = [...party.rngState]

      party.recover('drawToHand', LATER)

      expect(playerOf(party).hand).toEqual([
        'h1',
        'h2',
        'h3',
        'd1',
        'd2',
        'd3',
        'd4',
      ])
      expect(playerOf(party).deck).toEqual(['d5'])
      expect([...party.rngState]).toEqual(before)
      expect(party.pullDomainEvents()[0]).toMatchObject({ cardsDrawn: 4 })
    })

    it('REQ-63 (a): deck que acaba antes compra só o que há (9.2)', () => {
      const party = partyOf({ hand: ['h1', 'h2', 'h3'], deck: ['d1', 'd2'] })

      const result = party.recover('drawToHand', LATER)

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).hand).toEqual(['h1', 'h2', 'h3', 'd1', 'd2'])
      expect(playerOf(party).deck).toEqual([])
    })

    it('REQ-63 (a): mão com recoverHandSize ou mais não compra; ainda é aceito e gasta o ponto', () => {
      const party = partyOf({}, {})
      const hand = [...playerOf(party).hand]

      const result = party.recover('drawToHand', LATER)

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).hand).toEqual(hand)
      expect(party.turn.actionPoints).toBe(2)
      expect(party.pullDomainEvents()[0]).toMatchObject({ cardsDrawn: 0 })
    })

    it('REQ-63 (a): recoverHandSize da config do grupo (10)', () => {
      const party = partyOf({}, { recoverHandSize: 10 })

      party.recover('drawToHand', LATER)

      expect(playerOf(party).hand).toHaveLength(10)
      expect(playerOf(party).deck).toHaveLength(50)
    })

    it('REQ-63 (b): a mão inteira vai para o deck, que é embaralhado pelo RNG; a mão fica vazia', () => {
      const party = partyOf()
      const { deck, hand } = playerOf(party)
      const rng = SeededRng.fromState(party.rngState)
      const expected = shuffle([...deck, ...hand], rng)

      party.recover('shuffleHand', LATER)

      expect(playerOf(party).hand).toEqual([])
      expect(playerOf(party).deck).toEqual(expected)
      expect(party.rngState).toEqual(rng.state())
      expect(party.pullDomainEvents()[0]).toMatchObject({
        option: 'shuffleHand',
        cardsDrawn: 0,
      })
    })

    it('REQ-63 (c): a pilha de descarte inteira vai para o deck, embaralhado; a mão não muda', () => {
      const party = partyOf({ discard: ['x1', 'x2', 'x3'] })
      const { deck, hand } = playerOf(party)
      const rng = SeededRng.fromState(party.rngState)
      const expected = shuffle([...deck, 'x1', 'x2', 'x3'], rng)

      party.recover('shuffleDiscard', LATER)

      expect(playerOf(party).discard).toEqual([])
      expect(playerOf(party).deck).toEqual(expected)
      expect(playerOf(party).hand).toEqual(hand)
      expect(party.rngState).toEqual(rng.state())
    })

    it('REQ-63: é repetível enquanto houver pontos', () => {
      const party = partyOf()

      party.recover('shuffleHand', LATER)
      party.recover('drawToHand', LATER)
      party.recover('drawToHand', LATER)

      expect(party.turn.actionPoints).toBe(0)
      expect(playerOf(party).hand).toHaveLength(7)
    })

    it('REQ-64: 0 pontos → noActionPoints; nada muda e nenhum evento', () => {
      const zero = partyOf({ health: 10 }, { actionPointsPerTurn: 1 })
      zero.recover('drawToHand', NOW)
      zero.pullDomainEvents()
      const before = [...zero.rngState]

      const result = zero.recover('shuffleHand', LATER)

      expect(result.isLeft() && result.value).toBe('noActionPoints')
      expect(playerOf(zero).hand).toHaveLength(7)
      expect(playerOf(zero).health).toBe(13)
      expect([...zero.rngState]).toEqual(before)
      expect(zero.savedAt.toISOString()).toBe(NOW.toISOString())
      expect(zero.pullDomainEvents()).toEqual([])
    })

    it('REQ-64: fora de sessão → sessionNotActive; nada muda', () => {
      const party = partyOf({ health: 10 }, {}, 'idle')

      const result = party.recover('drawToHand', LATER)

      expect(result.isLeft() && result.value).toBe('sessionNotActive')
      expect(playerOf(party).health).toBe(10)
      expect(party.turn.actionPoints).toBe(3)
      expect(party.pullDomainEvents()).toEqual([])
    })
  })

  describe('adjustDeck (REQ-65, REQ-66)', () => {
    const S = 'fixture.strength-basic'
    const E = 'fixture.endurance-basic'
    const D = 'fixture.dexterity-basic'
    const Y = 'fixture.warrior-synergy'
    const synergy = {
      ...attributeCards[0],
      id: Y,
      name: 'Sinergia',
      attributeKind: 'synergy' as const,
      attributes: ['strength', 'endurance'] as TAttributeCard['attributes'],
    }
    const catalog = {
      cards: [...attributeCards, synergy],
      classes: [warrior],
    }
    const DEFAULT_MODIFIERS = {
      attack: 5,
      defense: 3,
      accuracy: 50,
      evasion: 20,
      celerity: 10,
      piercing: 0,
      reflection: 0,
    }
    const copies = (cardId: string, n: number) => ({ cardId, copies: n })

    const partyOf = (
      player: Partial<TPlayerState> = {},
      config: Partial<typeof GAME_CONFIG_DEFAULTS> = {},
      status: 'idle' | 'inSession' = 'inSession'
    ) => {
      const host = PartyMember.create(
        {
          characterName: 'Lia',
          kind: 'human',
          player: makePlayerState(player),
        },
        new UniqueEntityID('member-1')
      )
      return makeParty({
        status,
        members: [host],
        hostMemberId: host.id,
        config: { ...GAME_CONFIG_DEFAULTS, ...config },
        savedAt: NOW,
      })
    }
    const playerOf = (party: Party) => party.members[0].player

    it('REQ-65: sem mudar nada: gasta 1 ponto, deck embaralhado de novo, mesma quantidade na mão', () => {
      const party = partyOf()
      const rng = SeededRng.fromState(party.rngState)
      const expanded = [
        ...Array.from({ length: 30 }, () => E),
        ...Array.from({ length: 30 }, () => S),
      ]
      const shuffled = shuffle(expanded, rng)

      const result = party.adjustDeck(
        [copies(E, 30), copies(S, 30)],
        catalog,
        LATER
      )

      expect(result.isRight()).toBe(true)
      expect(party.turn.actionPoints).toBe(2)
      expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
      expect(playerOf(party).build).toEqual([copies(E, 30), copies(S, 30)])
      expect(playerOf(party).tcgFolder).toEqual([])
      expect(playerOf(party).hand).toEqual(shuffled.slice(0, 7))
      expect(playerOf(party).deck).toEqual(shuffled.slice(7))
      expect(playerOf(party).discard).toEqual([])
      expect(party.rngState).toEqual(rng.state())
    })

    it('REQ-65: mão e descarte voltam ao deck; compra H (a mão que tinha)', () => {
      const party = partyOf({
        hand: [S, E, S],
        discard: [E, E, S, S],
        deck: [
          ...Array.from({ length: 27 }, () => E),
          ...Array.from({ length: 26 }, () => S),
        ],
      })

      party.adjustDeck([copies(E, 30), copies(S, 30)], catalog, LATER)

      expect(playerOf(party).hand).toHaveLength(3)
      expect(playerOf(party).discard).toEqual([])
      expect(playerOf(party).deck).toHaveLength(57)
    })

    it('REQ-65: mão vazia → continua vazia', () => {
      const party = partyOf({
        hand: [],
        deck: [
          ...Array.from({ length: 30 }, () => E),
          ...Array.from({ length: 30 }, () => S),
        ],
      })

      party.adjustDeck([copies(E, 30), copies(S, 30)], catalog, LATER)

      expect(playerOf(party).hand).toEqual([])
      expect(playerOf(party).deck).toHaveLength(60)
    })

    it('REQ-65: troca com a pasta: build nova em ordem de cardId; a pasta = pool − build nova', () => {
      const party = partyOf({ tcgFolder: [copies(D, 10)] })

      const result = party.adjustDeck(
        [copies(S, 20), copies(D, 10), copies(E, 30)],
        catalog,
        LATER
      )

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).build).toEqual([
        copies(D, 10),
        copies(E, 30),
        copies(S, 20),
      ])
      expect(playerOf(party).tcgFolder).toEqual([copies(S, 10)])
      const all = [
        ...playerOf(party).deck,
        ...playerOf(party).hand,
        ...playerOf(party).discard,
      ]
      expect(all.filter((c) => c === D)).toHaveLength(10)
      expect(all).toHaveLength(60)
    })

    it('REQ-65: tirar cartas da build para a pasta (cartas com 0 cópias saem da pasta)', () => {
      const party = partyOf({
        build: [copies(E, 35), copies(S, 30)],
        tcgFolder: [copies(D, 2)],
      })

      party.adjustDeck(
        [copies(D, 2), copies(E, 30), copies(S, 30)],
        catalog,
        LATER
      )

      expect(playerOf(party).build).toEqual([
        copies(D, 2),
        copies(E, 30),
        copies(S, 30),
      ])
      expect(playerOf(party).tcgFolder).toEqual([copies(E, 5)])
    })

    it('REQ-65: o invariante deck + mão + descarte = soma da build vale depois do ajuste', () => {
      const party = partyOf({ tcgFolder: [copies(D, 10)] })

      party.adjustDeck(
        [copies(D, 10), copies(E, 30), copies(S, 20)],
        catalog,
        LATER
      )

      const p = playerOf(party)
      expect(p.deck.length + p.hand.length + p.discard.length).toBe(60)
    })

    it('REQ-65: a trava é recalculada: build que não cumpre desliga a classe e volta aos modificadores padrão', () => {
      const party = partyOf({
        build: [copies(E, 30), copies(S, 30)],
        tcgFolder: [copies(D, 25)],
      })

      const result = party.adjustDeck(
        [copies(D, 25), copies(E, 30), copies(S, 5)],
        catalog,
        LATER
      )

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).playerClasses).toEqual([
        { playerClass: 'warrior', deckLockMet: false },
      ])
      expect(playerOf(party).modifiers).toEqual(DEFAULT_MODIFIERS)
    })

    it('REQ-65: build que volta a cumprir a trava religa a classe e restaura os modificadores da classe', () => {
      const party = partyOf({
        build: [copies(D, 25), copies(E, 30), copies(S, 5)],
        tcgFolder: [copies(S, 25)],
        playerClasses: [{ playerClass: 'warrior', deckLockMet: false }],
        modifiers: DEFAULT_MODIFIERS,
      })

      party.adjustDeck([copies(E, 30), copies(S, 30)], catalog, LATER)

      expect(playerOf(party).playerClasses).toEqual([
        { playerClass: 'warrior', deckLockMet: true },
      ])
      expect(playerOf(party).modifiers).toEqual(warrior.baseModifiers)
    })

    it('REQ-65: eventos em ordem — DeckAdjusted e, por classe cuja trava mudou, DeckLockChanged', () => {
      const party = partyOf({
        build: [copies(E, 30), copies(S, 30)],
        tcgFolder: [copies(D, 25)],
      })

      party.adjustDeck(
        [copies(D, 25), copies(E, 30), copies(S, 5)],
        catalog,
        LATER
      )

      const events = party.pullDomainEvents()
      expect(events.map((e) => e.type)).toEqual([
        'DeckAdjusted',
        'DeckLockChanged',
      ])
      expect(events[0]).toMatchObject({
        memberId: new UniqueEntityID('member-1'),
        buildSize: 60,
        handSize: 7,
        occurredAt: LATER,
      })
      expect(events[1]).toMatchObject({
        memberId: new UniqueEntityID('member-1'),
        playerClass: 'warrior',
        deckLockMet: false,
      })
    })

    it('REQ-65: trava que não mudou → só DeckAdjusted', () => {
      const party = partyOf()

      party.adjustDeck([copies(E, 30), copies(S, 30)], catalog, LATER)

      expect(party.pullDomainEvents().map((e) => e.type)).toEqual([
        'DeckAdjusted',
      ])
    })

    describe('recusas, nesta ordem, sem gravar nem emitir evento (REQ-66)', () => {
      const expectUntouched = (party: Party, before: Party) => {
        expect(playerOf(party)).toEqual(playerOf(before))
        expect(party.turn.actionPoints).toBe(before.turn.actionPoints)
        expect(party.rngState).toEqual(before.rngState)
        expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
        expect(party.pullDomainEvents()).toEqual([])
      }

      it('fora de sessão → sessionNotActive (antes de conferir pontos e cartas)', () => {
        const party = partyOf({}, { actionPointsPerTurn: 1 }, 'idle')
        const before = partyOf({}, { actionPointsPerTurn: 1 }, 'idle')

        const result = party.adjustDeck([copies(S, 999)], catalog, LATER)

        expect(result.isLeft() && result.value).toBe('sessionNotActive')
        expectUntouched(party, before)
      })

      it('0 pontos → noActionPoints (antes de notOwned)', () => {
        const party = partyOf({}, { actionPointsPerTurn: 1 })
        party.recover('drawToHand', NOW)
        party.pullDomainEvents()

        const result = party.adjustDeck([copies(S, 999)], catalog, LATER)

        expect(result.isLeft() && result.value).toBe('noActionPoints')
        expect(party.turn.actionPoints).toBe(0)
      })

      it('mais cópias do que build + pasta → notOwned com a 1ª carta, em ordem de índice', () => {
        const party = partyOf()
        const before = partyOf()

        const result = party.adjustDeck(
          [copies(E, 30), copies(S, 31), copies(D, 1)],
          catalog,
          LATER
        )

        expect(result.isLeft() && result.value).toEqual({
          reason: 'notOwned',
          cardId: S,
        })
        expectUntouched(party, before)
      })

      it('carta que o jogador não tem → notOwned', () => {
        const party = partyOf()

        const result = party.adjustDeck(
          [copies(E, 30), copies(S, 30), copies(D, 1)],
          catalog,
          LATER
        )

        expect(result.isLeft() && result.value).toEqual({
          reason: 'notOwned',
          cardId: D,
        })
      })

      it('notOwned vem antes de copyLimitExceeded', () => {
        const party = partyOf({ tcgFolder: [copies(Y, 5)] })

        const result = party.adjustDeck(
          [copies(Y, 5), copies(D, 1)],
          catalog,
          LATER
        )

        expect(result.isLeft() && result.value).toEqual({
          reason: 'notOwned',
          cardId: D,
        })
      })

      it('o pool soma build + pasta: a carta da pasta é "do jogador"', () => {
        const party = partyOf({ tcgFolder: [copies(D, 1)] })

        const result = party.adjustDeck(
          [copies(E, 30), copies(S, 30), copies(D, 1)],
          catalog,
          LATER
        )

        expect(result.isRight()).toBe(true)
      })

      it('synergy acima de maxCopiesPerCard → copyLimitExceeded (antes do tamanho mínimo)', () => {
        const party = partyOf({ tcgFolder: [copies(Y, 5)] })
        const before = partyOf({ tcgFolder: [copies(Y, 5)] })

        const result = party.adjustDeck([copies(Y, 5)], catalog, LATER)

        expect(result.isLeft() && result.value).toEqual({
          reason: 'copyLimitExceeded',
          cardId: Y,
        })
        expectUntouched(party, before)
      })

      it('o limite vem da config do grupo; basic não tem limite; até o limite é aceito', () => {
        const ok = partyOf(
          { tcgFolder: [copies(Y, 5)] },
          { maxCopiesPerCard: 5 }
        )
        const refused = partyOf(
          { tcgFolder: [copies(Y, 2)] },
          { maxCopiesPerCard: 1 }
        )

        expect(
          ok
            .adjustDeck(
              [copies(E, 30), copies(S, 25), copies(Y, 5)],
              catalog,
              LATER
            )
            .isRight()
        ).toBe(true)
        const result = refused.adjustDeck(
          [copies(E, 30), copies(S, 28), copies(Y, 2)],
          catalog,
          LATER
        )
        expect(result.isLeft() && result.value).toEqual({
          reason: 'copyLimitExceeded',
          cardId: Y,
        })
      })

      it('soma abaixo de minDeckSize → buildBelowMinimum (build vazia também)', () => {
        const party = partyOf()
        const before = partyOf()

        const result = party.adjustDeck(
          [copies(E, 30), copies(S, 29)],
          catalog,
          LATER
        )
        const empty = party.adjustDeck([], catalog, LATER)

        expect(result.isLeft() && result.value).toBe('buildBelowMinimum')
        expect(empty.isLeft() && empty.value).toBe('buildBelowMinimum')
        expectUntouched(party, before)
      })

      it('minDeckSize vem da config do grupo', () => {
        const party = partyOf({}, { minDeckSize: 50 })

        const result = party.adjustDeck(
          [copies(E, 30), copies(S, 29)],
          catalog,
          LATER
        )

        expect(result.isRight()).toBe(true)
        expect(playerOf(party).tcgFolder).toEqual([copies(S, 1)])
      })

      it('o que vai para a pasta não cabe → tcgFolderFull; cabendo exatamente é aceito', () => {
        const full = partyOf(
          { build: [copies(E, 35), copies(S, 30)] },
          { tcgFolderCapacity: 4 }
        )
        const exact = partyOf(
          { build: [copies(E, 35), copies(S, 30)] },
          { tcgFolderCapacity: 5 }
        )

        const refused = full.adjustDeck(
          [copies(E, 30), copies(S, 30)],
          catalog,
          LATER
        )
        const accepted = exact.adjustDeck(
          [copies(E, 30), copies(S, 30)],
          catalog,
          LATER
        )

        expect(refused.isLeft() && refused.value).toBe('tcgFolderFull')
        expect(accepted.isRight()).toBe(true)
      })

      it('buildBelowMinimum vem antes de tcgFolderFull', () => {
        const party = partyOf({}, { tcgFolderCapacity: 0 })

        const result = party.adjustDeck(
          [copies(E, 30), copies(S, 29)],
          catalog,
          LATER
        )

        expect(result.isLeft() && result.value).toBe('buildBelowMinimum')
      })

      it('build que não cumpre a trava NÃO é recusada (8.2)', () => {
        const party = partyOf({ tcgFolder: [copies(D, 30)] })

        const result = party.adjustDeck(
          [copies(D, 30), copies(E, 30)],
          catalog,
          LATER
        )

        expect(result.isRight()).toBe(true)
      })
    })
  })
})
