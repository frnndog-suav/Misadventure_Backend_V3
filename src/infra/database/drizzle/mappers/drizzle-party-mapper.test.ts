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
  it('D-31/D-43: separa colunas consultáveis e o state com schemaVersion 2', () => {
    const party = usedRngParty()

    const row = DrizzlePartyMapper.toDrizzle(party)

    expect(row).toEqual({
      id: 'party-1',
      name: 'Os Teimosos',
      status: 'inSession',
      createdAt: party.createdAt,
      savedAt: party.savedAt,
      state: {
        schemaVersion: 2,
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
    expect(restored.members[0].player).toEqual(party.members[0].player)
    expect(restored.rngState).toEqual(party.rngState)
    expect(restored.createdAt).toEqual(party.createdAt)
    expect(restored.savedAt).toEqual(party.savedAt)
    expect(SeededRng.fromState(restored.rngState).nextUint32()).toBe(
      SeededRng.fromState(party.rngState).nextUint32()
    )
    expect(restored.pullDomainEvents()).toEqual([])
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
