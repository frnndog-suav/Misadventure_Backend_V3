import { describe, expect, it } from 'vitest'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng } from '@/core/rng/seeded-rng'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { makeParty } from '../../../../../test/factories/make-party'
import { DrizzlePartyMapper, type TPartyRow } from './drizzle-party-mapper'

function usedRngParty() {
  const rng = SeededRng.fromSeed(7)
  for (let i = 0; i < 5; i++) rng.nextUint32()
  return makeParty({
    status: 'inSession',
    rngState: rng.state(),
    config: { ...GAME_CONFIG_DEFAULTS, initialGold: 40 },
    savedAt: new Date('2026-11-15T09:30:00.000Z'),
  })
}

describe('DrizzlePartyMapper', () => {
  it('D-31/D-64: separa colunas consultáveis e o state com schemaVersion 3', () => {
    const party = usedRngParty()

    const row = DrizzlePartyMapper.toDrizzle(party)

    expect(row).toEqual({
      id: 'party-1',
      name: 'Os Teimosos',
      status: 'inSession',
      createdAt: party.createdAt,
      savedAt: party.savedAt,
      state: {
        schemaVersion: 3,
        members: [
          {
            id: 'member-1',
            characterName: 'Lia',
            kind: 'human',
            player: party.members[0].player,
          },
        ],
        hostMemberId: 'member-1',
        config: { ...GAME_CONFIG_DEFAULTS, initialGold: 40 },
        rngState: [...party.rngState],
        dimension: party.dimension,
        turnOrder: ['member-1'],
        turn: { round: 1, memberId: 'member-1', actionPoints: 3 },
      },
    })
  })

  it('REQ-22: ida e volta preserva o agregado e o próximo sorteio', () => {
    const party = usedRngParty()
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })

    expect(restored.id.toString()).toBe('party-1')
    expect(restored.name).toBe(party.name)
    expect(restored.status).toBe('inSession')
    expect(
      restored.members.map((m) => [m.id.toString(), m.characterName, m.kind])
    ).toEqual([['member-1', 'Lia', 'human']])
    expect(restored.hostMemberId.equals(new UniqueEntityID('member-1'))).toBe(
      true
    )
    expect(restored.config).toEqual(party.config)
    expect(restored.dimension).toEqual(party.dimension)
    expect(restored.turnOrder).toEqual(party.turnOrder)
    expect(restored.turn).toEqual(party.turn)
    expect(restored.members[0].player).toEqual(party.members[0].player)
    expect(restored.rngState).toEqual(party.rngState)
    expect(restored.createdAt).toEqual(party.createdAt)
    expect(restored.savedAt).toEqual(party.savedAt)
    expect(SeededRng.fromState(restored.rngState).nextUint32()).toBe(
      SeededRng.fromState(party.rngState).nextUint32()
    )
    expect(restored.pullDomainEvents()).toEqual([])
  })

  it('REQ-59: ida e volta preserva a vez no meio de uma rodada', () => {
    const party = makeParty({
      turn: {
        round: 4,
        memberId: new UniqueEntityID('member-1'),
        actionPoints: 1,
      },
    })
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })

    expect(restored.turn).toEqual(party.turn)
  })

  it('REQ-59/D-64: save v2 é lido como v3 (rodada 1, 1º de turnOrder, pontos do config) e regravado como v3', () => {
    const party = usedRngParty()
    const v3 = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow & { state: Record<string, unknown> }
    const rest = { ...v3.state }
    delete rest.turn
    const v2: TPartyRow = {
      ...v3,
      state: {
        ...rest,
        schemaVersion: 2,
        config: { ...GAME_CONFIG_DEFAULTS, actionPointsPerTurn: 5 },
      },
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    }

    const restored = DrizzlePartyMapper.toDomain(v2)

    expect(restored.turn.round).toBe(1)
    expect(restored.turn.memberId.toString()).toBe('member-1')
    expect(restored.turn.actionPoints).toBe(5)
    expect(restored.pullDomainEvents()).toEqual([])
    const rewritten = DrizzlePartyMapper.toDrizzle(restored).state
    expect(rewritten.schemaVersion).toBe(3)
    expect(rewritten.turn).toEqual({
      round: 1,
      memberId: 'member-1',
      actionPoints: 5,
    })
  })

  const validRow = () =>
    JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(usedRngParty()))
    ) as {
      status: string
      state: Record<string, unknown>
    }

  it.each([
    [
      'schemaVersion desconhecida',
      (r: ReturnType<typeof validRow>) => (r.state.schemaVersion = 99),
    ],
    [
      'rngState com valor fora de uint32',
      (r: ReturnType<typeof validRow>) => (r.state.rngState = [0, 1, 2, -1]),
    ],
    [
      'rngState com 3 posições',
      (r: ReturnType<typeof validRow>) => (r.state.rngState = [0, 1, 2]),
    ],
    [
      'config sem chave',
      (r: ReturnType<typeof validRow>) => (r.state.config = { minPlayers: 1 }),
    ],
    [
      'host fora dos membros',
      (r: ReturnType<typeof validRow>) => (r.state.hostMemberId = 'x'),
    ],
    ['v3 sem turn', (r: ReturnType<typeof validRow>) => delete r.state.turn],
    [
      'turn com membro fora de turnOrder',
      (r: ReturnType<typeof validRow>) =>
        (r.state.turn = { round: 1, memberId: 'x', actionPoints: 3 }),
    ],
    [
      'turn com pontos negativos',
      (r: ReturnType<typeof validRow>) =>
        (r.state.turn = { round: 1, memberId: 'member-1', actionPoints: -1 }),
    ],
    [
      'status desconhecido',
      (r: ReturnType<typeof validRow>) => (r.status = 'frozen'),
    ],
    [
      'state não objeto',
      (r: ReturnType<typeof validRow>) =>
        ((r as { state: unknown }).state = 'oops'),
    ],
  ])('D-31: save corrompido (%s) lança erro na leitura', (_label, corrupt) => {
    const row = validRow()
    corrupt(row)

    expect(() =>
      DrizzlePartyMapper.toDomain({
        ...row,
        id: 'party-1',
        name: 'Os Teimosos',
        createdAt: new Date(),
        savedAt: new Date(),
      })
    ).toThrow()
  })
})
