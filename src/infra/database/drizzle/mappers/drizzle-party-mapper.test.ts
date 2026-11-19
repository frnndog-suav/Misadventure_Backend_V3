import { describe, expect, it } from 'vitest'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng } from '@/core/rng/seeded-rng'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
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
  it('D-31/D-87/REQ-103: guarda o state v6 sem a lista de status do domínio', () => {
    const party = usedRngParty()
    const { statuses, ...storedPlayer } = party.members[0].player

    const row = DrizzlePartyMapper.toDrizzle(party)

    expect(statuses).toEqual([])
    expect(row).toEqual({
      id: 'party-1',
      name: 'Os Teimosos',
      status: 'inSession',
      createdAt: party.createdAt,
      savedAt: party.savedAt,
      state: {
        schemaVersion: 6,
        members: [
          {
            id: 'member-1',
            characterName: 'Lia',
            kind: 'human',
            player: storedPlayer,
          },
        ],
        hostMemberId: 'member-1',
        config: { ...GAME_CONFIG_DEFAULTS, initialGold: 40 },
        rngState: [...party.rngState],
        dimension: party.dimension,
        rewardDecks: [],
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

  /**
   * Linha como as FEATs 06 a 10 gravavam: sem as chaves de REQ-80 e `vault`;
   * até a FEAT-09 (v2 a v4), também sem as de REQ-69, `inventory` e `equipment`;
   * até a FEAT-08 (v2, v3), também sem as de REQ-60 e `tcgFolder`.
   */
  function legacyRow(version: 2 | 3 | 4 | 5, actionPointsPerTurn = 3) {
    const party = usedRngParty()
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow & {
      state: {
        config: Record<string, number>
        members: { player: Record<string, unknown> }[]
        turn?: unknown
        rewardDecks?: unknown
      }
    }
    const config: Record<string, number> = {
      ...row.state.config,
      actionPointsPerTurn,
    }
    const removedKeys = ['vaultCapacity', 'vaultDeckSlots', 'vaultGoldCapacity']
    if (version < 5) removedKeys.push('inventoryCapacity', 'purseCapacity')
    if (version < 4) {
      removedKeys.push(
        'maxCopiesPerCard',
        'tcgFolderCapacity',
        'recoverHealthPercent',
        'recoverVigorPercent',
        'recoverHandSize'
      )
    }
    for (const key of removedKeys) delete config[key]
    for (const member of row.state.members) {
      delete member.player.vault
      delete member.player.lastScavenge
      if (version < 5) {
        delete member.player.inventory
        delete member.player.equipment
      }
      if (version < 4) delete member.player.tcgFolder
    }
    if (version === 2) delete row.state.turn
    delete row.state.rewardDecks
    return {
      party,
      row: {
        ...row,
        state: { ...row.state, schemaVersion: version, config },
        createdAt: party.createdAt,
        savedAt: party.savedAt,
      } satisfies TPartyRow,
    }
  }

  it('REQ-59/D-64: save v2 é lido como v6 (rodada 1, 1º de turnOrder, pontos do config) e regravado como v6', () => {
    const { row } = legacyRow(2, 5)

    const restored = DrizzlePartyMapper.toDomain(row)

    expect(restored.turn.round).toBe(1)
    expect(restored.turn.memberId.toString()).toBe('member-1')
    expect(restored.turn.actionPoints).toBe(5)
    expect(restored.pullDomainEvents()).toEqual([])
    const rewritten = DrizzlePartyMapper.toDrizzle(restored).state
    expect(rewritten.schemaVersion).toBe(6)
    expect(rewritten.turn).toEqual({
      round: 1,
      memberId: 'member-1',
      actionPoints: 5,
    })
  })

  it('REQ-68/D-70: save v3 é lido como v6 com a pasta vazia, a vez intacta e as chaves novas nos padrões; regravado como v6', () => {
    const { party, row } = legacyRow(3)

    const restored = DrizzlePartyMapper.toDomain(row)

    expect(restored.members[0].player.tcgFolder).toEqual([])
    expect(restored.members[0].player.build).toEqual(
      party.members[0].player.build
    )
    expect(restored.turn).toEqual(party.turn)
    expect(restored.config).toEqual({
      ...GAME_CONFIG_DEFAULTS,
      initialGold: 40,
      maxCopiesPerCard: 4,
      tcgFolderCapacity: 30,
      recoverHealthPercent: 15,
      recoverVigorPercent: 5,
      recoverHandSize: 7,
    })
    expect(restored.pullDomainEvents()).toEqual([])
    const rewritten = DrizzlePartyMapper.toDrizzle(restored).state
    expect(rewritten.schemaVersion).toBe(6)
    expect(rewritten.members[0].player.tcgFolder).toEqual([])
  })

  it('REQ-79/D-79: save v4 é lido como v6 com inventário vazio, nada equipado e as chaves de REQ-69 nos padrões; regravado como v6', () => {
    const { party, row } = legacyRow(4)

    const restored = DrizzlePartyMapper.toDomain(row)

    const { player } = restored.members[0]
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
    expect(player.tcgFolder).toEqual(party.members[0].player.tcgFolder)
    expect(restored.config).toEqual({
      ...GAME_CONFIG_DEFAULTS,
      initialGold: 40,
      inventoryCapacity: 10,
      purseCapacity: 300,
    })
    expect(restored.turn).toEqual(party.turn)
    const rewritten = DrizzlePartyMapper.toDrizzle(restored).state
    expect(rewritten.schemaVersion).toBe(6)
    expect(rewritten.members[0].player.inventory).toEqual([])
  })

  it('REQ-95/D-87: save v5 é lido como v6 com cofre vazio e as chaves de REQ-80 nos padrões; regravado como v6', () => {
    const { party, row } = legacyRow(5)
    row.state.config.inventoryCapacity = 12

    const restored = DrizzlePartyMapper.toDomain(row)

    const { player } = restored.members[0]
    expect(player.vault).toEqual({ slots: [], decks: [], gold: 0 })
    expect(player.lastScavenge).toBeNull()
    expect(restored.rewardDecks).toEqual([])
    expect(player.inventory).toEqual(party.members[0].player.inventory)
    expect(restored.config).toEqual({
      ...GAME_CONFIG_DEFAULTS,
      initialGold: 40,
      inventoryCapacity: 12,
      vaultCapacity: 30,
      vaultDeckSlots: 10,
      vaultGoldCapacity: 2000,
    })
    expect(restored.turn).toEqual(party.turn)
    expect(restored.pullDomainEvents()).toEqual([])
    const rewritten = DrizzlePartyMapper.toDrizzle(restored).state
    expect(rewritten.schemaVersion).toBe(6)
    expect(rewritten.members[0].player.vault).toEqual({
      slots: [],
      decks: [],
      gold: 0,
    })
  })

  it('REQ-95: ida e volta preserva o cofre (slots na ordem, decks, ouro) e as chaves de REQ-80', () => {
    const base = makeParty({ status: 'inSession' })
    const member = base.members[0]
    const player = {
      ...member.player,
      vault: {
        slots: [
          { cardId: 'fixture.pickaxe', quantity: 2 },
          { cardId: 'fixture.healing-potion', quantity: 7 },
        ],
        decks: [
          [
            { cardId: 'fixture.dexterity-basic', copies: 20 },
            { cardId: 'fixture.strength-basic', copies: 40 },
          ],
          [{ cardId: 'fixture.endurance-basic', copies: 1 }],
        ],
        gold: 1990,
      },
    }
    const party = makeParty({
      status: 'inSession',
      members: [
        PartyMember.create(
          { characterName: member.characterName, kind: member.kind, player },
          member.id
        ),
      ],
      config: {
        ...GAME_CONFIG_DEFAULTS,
        vaultCapacity: 12,
        vaultDeckSlots: 3,
        vaultGoldCapacity: 5000,
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

    expect(restored.members[0].player).toEqual(player)
    expect(restored.config).toMatchObject({
      vaultCapacity: 12,
      vaultDeckSlots: 3,
      vaultGoldCapacity: 5000,
    })
  })

  it('REQ-95/REQ-96: ida e volta preserva a ordem de cada deck de recompensas, lastScavenge e o próximo sorteio', () => {
    const base = usedRngParty()
    const member = base.members[0]
    const player = {
      ...member.player,
      lastScavenge: { cardId: 'fixture.silver-fish', found: false },
    }
    const rewardDecks = [
      {
        zoneType: 'urban' as const,
        cards: [
          'fixture.healing-potion',
          'fixture.iron-ore',
          'fixture.healing-potion',
        ],
      },
      { zoneType: 'coastal' as const, cards: ['fixture.silver-fish'] },
    ]
    const party = makeParty({
      status: 'inSession',
      rngState: base.rngState,
      members: [
        PartyMember.create(
          { characterName: member.characterName, kind: member.kind, player },
          member.id
        ),
      ],
      rewardDecks,
    })
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })

    expect(restored.rewardDecks).toEqual(rewardDecks)
    expect(restored.members[0].player.lastScavenge).toEqual({
      cardId: 'fixture.silver-fish',
      found: false,
    })
    expect(SeededRng.fromState(restored.rngState).nextUint32()).toBe(
      SeededRng.fromState(party.rngState).nextUint32()
    )
  })

  it('REQ-79/D-79: save v4 com ouro acima de purseCapacity é lido com o ouro limitado', () => {
    const { row } = legacyRow(4)
    row.state.members[0].player.gold = 450

    const restored = DrizzlePartyMapper.toDomain(row)

    expect(restored.members[0].player.gold).toBe(300)
  })

  it('REQ-79: ida e volta preserva inventário (com a ordem), equipamentos e ouro', () => {
    const base = makeParty({ status: 'inSession' })
    const member = base.members[0]
    const player = {
      ...member.player,
      gold: 250,
      inventory: [
        { cardId: 'fixture.healing-potion', quantity: 5 },
        { cardId: 'fixture.pickaxe', quantity: 1 },
      ],
      equipment: { ...member.player.equipment, weapon: 'fixture.short-sword' },
    }
    const party = makeParty({
      status: 'inSession',
      members: [
        PartyMember.create(
          { characterName: member.characterName, kind: member.kind, player },
          member.id
        ),
      ],
      config: { ...GAME_CONFIG_DEFAULTS, inventoryCapacity: 12 },
    })
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })

    expect(restored.members[0].player).toEqual(player)
    expect(restored.config.inventoryCapacity).toBe(12)
  })

  it('REQ-68/D-70: save v3 com build fora de ordem é lido com a build em ordem de cardId', () => {
    const { row } = legacyRow(3)
    row.state.members[0].player.build = [
      { cardId: 'fixture.strength-basic', copies: 30 },
      { cardId: 'fixture.endurance-basic', copies: 30 },
    ]

    const restored = DrizzlePartyMapper.toDomain(row)

    expect(restored.members[0].player.build).toEqual([
      { cardId: 'fixture.endurance-basic', copies: 30 },
      { cardId: 'fixture.strength-basic', copies: 30 },
    ])
  })

  it('REQ-68: ida e volta preserva build, pasta e as chaves novas da config', () => {
    const base = makeParty({ status: 'inSession' })
    const member = base.members[0]
    const party = makeParty({
      status: 'inSession',
      members: [
        PartyMember.create(
          {
            characterName: member.characterName,
            kind: member.kind,
            player: {
              ...member.player,
              tcgFolder: [{ cardId: 'fixture.dexterity-basic', copies: 3 }],
            },
          },
          member.id
        ),
      ],
      config: { ...GAME_CONFIG_DEFAULTS, recoverHandSize: 10 },
    })
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })

    expect(restored.members[0].player).toEqual(party.members[0].player)
    expect(restored.config.recoverHandSize).toBe(10)
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
    ['v6 sem turn', (r: ReturnType<typeof validRow>) => delete r.state.turn],
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
