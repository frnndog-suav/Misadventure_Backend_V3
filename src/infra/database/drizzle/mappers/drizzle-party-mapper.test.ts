import { describe, expect, it } from 'vitest'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng } from '@/core/rng/seeded-rng'
import {
  BLACKSMITH_DEFAULTS,
  GAME_CONFIG_DEFAULTS,
  MOUNT_DEFAULTS,
} from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import { noExpansions } from '@/domain/campaign/enterprise/markets'
import { PartyPresenter } from '@/infra/http/presenters/party-presenter'
import { removePostV6Config } from '../../../../../test/factories/remove-post-v6-config'
import {
  makeCombatEventCard,
  makeItemCard,
} from '../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../test/factories/make-party'
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
  it('REQ-172: preserva quantidades de conclusão no save e na projeção HTTP', () => {
    const party = usedRngParty()
    const card = makeItemCard({ id: 'fixture.shard', completionItem: true })
    const completionItems = [{ cardId: card.id, quantity: 3 }]
    expect(
      party
        .grant(
          party.members[0].id,
          { type: 'card', card, quantity: 3 },
          party.savedAt
        )
        .isRight()
    ).toBe(true)

    const row = DrizzlePartyMapper.toDrizzle(party)
    expect(row.state.members[0].player).toMatchObject({ completionItems })

    const restored = DrizzlePartyMapper.toDomain(row)
    expect(restored.rngState).toEqual(party.rngState)
    expect(restored.members[0].player).toMatchObject({ completionItems })
    expect(
      PartyPresenter.toHTTP(restored, new Map()).members[0].player
    ).toMatchObject({ completionItems })
  })

  it('REQ-172: save sem o campo de conclusão abre com a lista vazia', () => {
    const row = DrizzlePartyMapper.toDrizzle(usedRngParty())
    expect(row.state.members[0].player).not.toHaveProperty('completionItems')

    const restored = DrizzlePartyMapper.toDomain(row)
    expect(
      PartyPresenter.toHTTP(restored, new Map()).members[0].player
    ).toMatchObject({ completionItems: [] })
  })

  it('REQ-135: lê um save v9 com padrões de missão e projeções vazias', () => {
    const party = usedRngParty()
    const row = DrizzlePartyMapper.toDrizzle(party)
    const defaults = {
      questBoardSize: 3,
      maxOpenQuests: 3,
      trialMinPeak: 30,
      mentorBaseGoldCost: 150,
      trialRandomEventTarget: 3,
      trialCombatTarget: 3,
      mentorRandomEventTarget: 5,
      mentorCombatTarget: 5,
      lockSpecializationAdditional: 6,
      lockSpecializationReinforcement: 4,
    }
    const state = { ...row.state, schemaVersion: 9 }
    state.config = { ...state.config }
    const legacyConfig: Record<string, unknown> = state.config
    for (const key of Object.keys(defaults)) delete legacyConfig[key]
    state.members = state.members.map((member) => {
      const player = { ...member.player }
      const legacyPlayer: Record<string, unknown> = player
      for (const key of [
        'questBoard',
        'openQuests',
        'questChoices',
        'specializations',
      ]) {
        delete legacyPlayer[key]
      }
      return { ...member, player }
    })

    const restored = DrizzlePartyMapper.toDomain({ ...row, state })

    expect(restored.config).toMatchObject({ ...defaults, initialGold: 40 })
    expect(
      PartyPresenter.toHTTP(restored, new Map()).members[0].player
    ).toMatchObject({
      questBoard: [],
      openQuests: [],
      questChoices: [],
      specializations: [],
    })
  })

  it('REQ-137: snapshot sem as chaves do mercado ganha os padrões', () => {
    const party = usedRngParty()
    const row = DrizzlePartyMapper.toDrizzle(party)
    const defaults = {
      singlesShowcaseSlots: 4,
      marketFactorMinPercent: 80,
      marketFactorMaxPercent: 120,
      boosterChanceCommon: 600,
      boosterChanceLegendary: 5,
      vaultGoldExpansionPricePercent: 25,
    }
    const legacyConfig: Record<string, unknown> = { ...row.state.config }
    for (const key of Object.keys(GAME_CONFIG_DEFAULTS)) {
      if (key.match(/^(singles|market|scarcity|treasure|booster)|Expansion/))
        delete legacyConfig[key]
    }
    expect(legacyConfig).not.toHaveProperty('singlesPoolSize')
    const state = { ...row.state, config: legacyConfig }

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      state: state as typeof row.state,
    })

    expect(restored.config).toMatchObject({ ...defaults, initialGold: 40 })
  })

  it('REQ-146: snapshot sem as chaves do ferreiro ganha os padrões', () => {
    const row = DrizzlePartyMapper.toDrizzle(usedRngParty())
    const legacyConfig: Record<string, unknown> = { ...row.state.config }
    for (const key of Object.keys(BLACKSMITH_DEFAULTS)) {
      delete legacyConfig[key]
    }
    expect(legacyConfig).not.toHaveProperty('refineBonusPercent')

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      state: { ...row.state, config: legacyConfig } as typeof row.state,
    })

    expect(restored.config).toMatchObject({
      ...BLACKSMITH_DEFAULTS,
      initialGold: 40,
    })
  })

  it('REQ-156: snapshot sem as chaves da montaria ganha os padrões', () => {
    const row = DrizzlePartyMapper.toDrizzle(usedRngParty())
    const legacyConfig: Record<string, unknown> = { ...row.state.config }
    for (const key of Object.keys(MOUNT_DEFAULTS)) {
      delete legacyConfig[key]
    }
    expect(legacyConfig).not.toHaveProperty('mountFolderCapacity')

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      state: { ...row.state, config: legacyConfig } as typeof row.state,
    })

    expect(restored.config).toMatchObject({
      ...MOUNT_DEFAULTS,
      initialGold: 40,
    })
  })

  it('REQ-165: restaura os padrões de Pico em um save legado', () => {
    const row = DrizzlePartyMapper.toDrizzle(usedRngParty())
    const config: Record<string, unknown> = { ...row.state.config }
    delete config.dimensionCompletionPeakGain
    delete config.bossPeakGain

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      state: { ...row.state, config } as typeof row.state,
    })

    expect(restored.config).toMatchObject({
      dimensionCompletionPeakGain: 25,
      bossPeakGain: 15,
      initialGold: 40,
    })
  })

  it('REQ-123: preserva combate ativo, janela, avanço de habilidades e RNG no save', () => {
    const card = makeCombatEventCard({
      goodOutcome: { text: 'Vitória.', steps: [] },
      badOutcome: { text: 'Derrota.', steps: [] },
    })
    const combat = {
      id: 'fight',
      card,
      memberId: 'member-1',
      cycle: 2,
      maxCycles: 20,
      order: ['member-1', 'enemy-1'],
      turn: {
        id: 'fight:2:member-1',
        actorId: 'member-1',
        phase: 'attack' as const,
        attacksRemaining: 1,
      },
      enemies: [
        {
          id: 'enemy-1',
          blockIndex: 0,
          copyIndex: 0,
          health: 3,
          maxHealth: 10,
          vigor: null,
          element: null,
          effectiveModifiers: card.enemies[0].modifiers,
          statuses: [
            {
              statusId: 'enemy-status',
              sourceCardId: card.id,
              effectIndex: 0,
              text: 'Ataque reduzido.',
              mark: 'debuff' as const,
              activation: [
                {
                  kind: 'modifierFlat' as const,
                  changes: [{ modifier: 'attack' as const, amount: -1 }],
                },
              ],
              duration: { kind: 'forOwnCombatTurns' as const, turns: 2 },
              remaining: 1,
            },
          ],
        },
      ],
      abilityUsage: [
        {
          actorId: 'member-1',
          equipmentSlot: null,
          abilityId: 'channel',
          sourceCardId: 'fixture.channel',
          element: null,
          uses: 1,
          cooldown: 2,
          charges: 1,
          channelHealth: 8,
          activeUntilCycle: null,
        },
      ],
      actedThisCycle: ['enemy-1'],
    }
    const party = makeParty({
      status: 'inSession',
      combat,
      combatZone: 'urban',
      rngState: usedRngParty().rngState,
    })
    const row = DrizzlePartyMapper.toDrizzle(party)
    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      state: JSON.parse(JSON.stringify(row.state)),
    })

    expect(restored.combat).toEqual(party.combat)
    expect(DrizzlePartyMapper.toDrizzle(restored).state).toMatchObject({
      schemaVersion: 11,
      combat,
      combatZone: 'urban',
      rngState: [...party.rngState],
    })
  })

  it('REQ-123: preserva recompensa de vitória pendente e queda por Reflexão', () => {
    const card = makeCombatEventCard({
      goodOutcome: {
        text: 'Compre uma recompensa.',
        steps: [{ type: 'drawRewards', count: 1 }],
      },
      badOutcome: { text: 'Derrota.', steps: [] },
    })
    const party = makeParty({
      status: 'inSession',
      members: [
        PartyMember.create(
          {
            characterName: 'Lia',
            kind: 'human',
            player: makePlayerState({ health: 0, down: true }),
          },
          new UniqueEntityID('member-1')
        ),
      ],
      lastCombatResult: {
        combatId: 'fight',
        cardId: card.id,
        memberId: 'member-1',
        resolution: 'victory',
        cause: 'enemiesDefeated',
        playerDown: true,
        peakDelta: 0,
      },
      combatOutcome: {
        card,
        zoneType: 'urban',
        cursor: { nextStep: 0, nextCopy: 1 },
        startingPeak: 10,
        victoryPeak: 12,
      },
      pendingReward: {
        id: 'reward',
        memberId: 'member-1',
        cardId: 'fixture.iron-ore',
        source: { type: 'combatEvent', combatId: 'fight' },
        origin: { type: 'rewardDeck', zoneType: 'urban' },
        destination: 'inventory',
        discardOptions: [
          { cardId: 'fixture.silver-fish', space: 'inventory', maxCopies: 1 },
        ],
        decisionDeadlineAt: null,
      },
      eventDecks: [{ zoneType: 'urban', cards: [], discard: [] }],
    })
    const row = DrizzlePartyMapper.toDrizzle(party)
    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      state: JSON.parse(JSON.stringify(row.state)),
    })

    expect(restored.members[0].player.down).toBe(true)
    expect(restored.lastCombatResult).toEqual(party.lastCombatResult)
    expect(restored.pendingRewards).toEqual(party.pendingRewards)
    expect(restored.eventDecks).toEqual(party.eventDecks)
    expect(DrizzlePartyMapper.toDrizzle(restored).state).toMatchObject({
      combatOutcome: { card, cursor: { nextStep: 0, nextCopy: 1 } },
    })
  })

  it('REQ-111/REQ-116: preserva a ordem dos decks e descartes de evento e o RNG ao recarregar', () => {
    const party = makeParty({
      eventDecks: [
        {
          zoneType: 'urban',
          cards: ['fixture.wounded-traveler', 'fixture.howling-wolves'],
          discard: ['fixture.wounded-traveler'],
        },
      ],
      rngState: usedRngParty().rngState,
    })
    const row = DrizzlePartyMapper.toDrizzle(party)
    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      state: JSON.parse(JSON.stringify(row.state)),
    })

    expect(restored.eventDecks).toEqual(party.eventDecks)
    expect(restored.rngState).toEqual(party.rngState)
  })

  it('D-31/D-87/REQ-103: guarda o state v11 com a lista de status', () => {
    const party = usedRngParty()
    const { completionItems, lastKnockout, skipNextTurn, ...storedPlayer } =
      party.members[0].player

    const row = DrizzlePartyMapper.toDrizzle(party)

    expect(storedPlayer.statuses).toEqual([])
    expect(completionItems).toEqual([])
    expect(lastKnockout).toBeNull()
    expect(skipNextTurn).toBe(false)
    expect(row).toEqual({
      id: 'party-1',
      name: 'Os Teimosos',
      status: 'inSession',
      createdAt: party.createdAt,
      savedAt: party.savedAt,
      state: {
        schemaVersion: 11,
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

  it('REQ-107: save v6 preserva os decks e inicia sem status', () => {
    const party = makeParty({
      rewardDecks: [{ zoneType: 'urban', cards: ['fixture.healing-potion'] }],
    })
    const row = DrizzlePartyMapper.toDrizzle(party)
    const legacyConfig = { ...row.state.config }
    removePostV6Config(legacyConfig)
    delete legacyConfig.escapeVigorPercent
    delete legacyConfig.reserveDeck
    const v6 = {
      ...row.state,
      schemaVersion: 6,
      config: legacyConfig,
      members: row.state.members.map(({ player, ...member }) => {
        const legacyPlayer: Partial<typeof player> = { ...player }
        delete legacyPlayer.statuses
        delete legacyPlayer.expansions
        return { ...member, player: legacyPlayer }
      }),
    }
    const upgraded = DrizzlePartyMapper.toDomain({ ...row, state: v6 })
    expect(upgraded.members[0].player.statuses).toEqual([])
    expect(upgraded.rewardDecks).toEqual(party.rewardDecks)
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
    removePostV6Config(config)
    const removedKeys = [
      'vaultCapacity',
      'vaultDeckSlots',
      'vaultGoldCapacity',
      'escapeVigorPercent',
      'reserveDeck',
    ]
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
      delete member.player.statuses
      delete member.player.expansions
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

  it.each([2, 3, 4, 5] as const)(
    'REQ-157/D-146: o save v%i lê mount: null sem usar o RNG',
    (version) => {
      const { party, row } = legacyRow(version)

      const restored = DrizzlePartyMapper.toDomain(row)

      expect(
        (restored.members[0].player as { mount?: unknown }).mount
      ).toBeNull()
      expect(restored.rngState).toEqual(party.rngState)
    }
  )

  it('REQ-59/D-64: save v2 é lido (rodada 1, 1º de turnOrder, pontos do config) e regravado como v11', () => {
    const { row } = legacyRow(2, 5)

    const restored = DrizzlePartyMapper.toDomain(row)

    expect(restored.turn.round).toBe(1)
    expect(restored.turn.memberId.toString()).toBe('member-1')
    expect(restored.turn.actionPoints).toBe(5)
    expect(restored.pullDomainEvents()).toEqual([])
    const rewritten = DrizzlePartyMapper.toDrizzle(restored).state
    expect(rewritten.schemaVersion).toBe(11)
    expect(rewritten.turn).toEqual({
      round: 1,
      memberId: 'member-1',
      actionPoints: 5,
    })
  })

  it('REQ-68/D-70: save v3 é lido com a pasta vazia, a vez intacta e as chaves novas nos padrões; regravado como v11', () => {
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
    expect(rewritten.schemaVersion).toBe(11)
    expect(rewritten.members[0].player.tcgFolder).toEqual([])
  })

  it('REQ-79/D-79: save v4 é lido com inventário vazio, nada equipado e as chaves de REQ-69 nos padrões; regravado como v11', () => {
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
    expect(rewritten.schemaVersion).toBe(11)
    expect(rewritten.members[0].player.inventory).toEqual([])
  })

  it('REQ-95/D-87: save v5 é lido com cofre vazio e as chaves de REQ-80 nos padrões; regravado como v11', () => {
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
    expect(rewritten.schemaVersion).toBe(11)
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
      delivery: 'none',
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

  it('REQ-143: o ouro acima de purseCapacity é limitado pela bolsa efetiva (600 com purse 1 mantém 450; sem expansão, 300)', () => {
    const load = (expansions: { purse: number }) => {
      const party = makeParty({
        status: 'inSession',
        members: [
          PartyMember.create(
            {
              characterName: 'Lia',
              kind: 'human',
              player: makePlayerState({
                gold: 450,
                expansions: { ...noExpansions(), ...expansions },
              }),
            },
            new UniqueEntityID('member-1')
          ),
        ],
      })
      const row = JSON.parse(
        JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
      ) as TPartyRow
      return DrizzlePartyMapper.toDomain({
        ...row,
        createdAt: party.createdAt,
        savedAt: party.savedAt,
      }).members[0].player.gold
    }

    expect(load({ purse: 1 })).toBe(450)
    expect(load({ purse: 0 })).toBe(300)
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
    ['v9 sem turn', (r: ReturnType<typeof validRow>) => delete r.state.turn],
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

  const MARKET_STATE = {
    markets: [
      {
        zoneId: 'fixture.gray-harbor',
        factorPercent: 113,
        singles: true,
        stock: [
          { cardId: 'fixture.a-card', copies: 2 },
          { cardId: 'fixture.b-card', copies: 1 },
        ],
        showcase: ['fixture.b-card', null, 'fixture.a-card', null],
      },
      {
        zoneId: 'fixture.old-mine',
        factorPercent: 87,
        singles: false,
        stock: [],
        showcase: [],
      },
    ],
    pool: [
      { cardId: 'fixture.a-card', departed: 3 },
      { cardId: 'fixture.b-card', departed: 0 },
    ],
  }

  it('REQ-138/REQ-143: ida e volta preserva mercados, pool, saídas e expansões', () => {
    const party = makeParty({
      status: 'inSession',
      markets: MARKET_STATE.markets,
      marketPool: MARKET_STATE.pool,
      members: [
        PartyMember.create(
          {
            characterName: 'Lia',
            kind: 'human',
            player: makePlayerState({
              expansions: {
                vaultSlots: 2,
                deckSlots: 1,
                tcgFolder: 0,
                purse: 1,
                vaultGold: 0,
              },
            }),
          },
          new UniqueEntityID('member-1')
        ),
      ],
    })
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })

    expect(restored.markets).toEqual(MARKET_STATE.markets)
    expect(restored.marketPool).toEqual(MARKET_STATE.pool)
    expect(restored.members[0].player.expansions).toEqual({
      vaultSlots: 2,
      deckSlots: 1,
      tcgFolder: 0,
      purse: 1,
      vaultGold: 0,
    })
    expect(DrizzlePartyMapper.toDrizzle(restored).state.schemaVersion).toBe(11)
  })

  it('REQ-140: ida e volta preserva lastMarketVisit; save sem ele lê undefined', () => {
    const lastMarketVisit = {
      zoneId: 'fixture.gray-harbor',
      goldLost: 15,
      results: [
        {
          operation: 'buyStock' as const,
          cardId: 'fixture.arrows',
          quantity: 2,
          copiesReceived: 20,
          gold: -8,
        },
        {
          operation: 'buyBooster' as const,
          cardId: 'fixture.booster',
          quantity: 1,
          gold: -30,
        },
        {
          operation: 'buySingle' as const,
          slotIndex: 1,
          cardId: 'fixture.short-sword',
          destination: 'inventory' as const,
          gold: -6,
        },
        {
          operation: 'sell' as const,
          source: 'tcgFolder' as const,
          cardId: 'fixture.strength-basic',
          quantity: 2,
          gold: 4,
        },
        {
          operation: 'buyExpansion' as const,
          expansion: 'purse' as const,
          capacity: 600,
          gold: -150,
        },
      ],
    }
    const withVisit = makeParty({
      status: 'inSession',
      members: [
        PartyMember.create(
          {
            characterName: 'Lia',
            kind: 'human',
            player: makePlayerState({ lastMarketVisit }),
          },
          new UniqueEntityID('member-1')
        ),
      ],
    })
    const withoutVisit = makeParty({ status: 'inSession' })
    const toRow = (party: Party) =>
      ({
        ...JSON.parse(JSON.stringify(DrizzlePartyMapper.toDrizzle(party))),
        createdAt: party.createdAt,
        savedAt: party.savedAt,
      }) as TPartyRow

    expect(
      DrizzlePartyMapper.toDomain(toRow(withVisit)).members[0].player
        .lastMarketVisit
    ).toEqual(lastMarketVisit)
    expect(
      DrizzlePartyMapper.toDomain(toRow(withoutVisit)).members[0].player
        .lastMarketVisit
    ).toBeUndefined()
  })

  it('REQ-149: ida e volta preserva lastBlacksmithVisit no save v10; save sem ele lê undefined', () => {
    const lastBlacksmithVisit = {
      source: 'blacksmith' as const,
      zoneId: 'fixture.gray-harbor',
      actionPointsSpent: 3,
      results: [
        {
          operation: 'refine' as const,
          target: { location: 'inventory' as const, inventorySlotIndex: 0 },
          cardId: 'fixture.short-sword',
          targetLevel: 7,
          gold: -70,
          roll: 11,
          d20Bonus: 2,
          threshold: 12,
          success: true,
          broke: false,
          skipped: false,
        },
        {
          operation: 'repair' as const,
          target: { location: 'equipment' as const, slot: 'weapon' as const },
          cardId: 'fixture.blade-of-dusk',
          gold: 0,
          repairMarks: 0,
          skipped: true,
        },
        {
          operation: 'craft' as const,
          recipeCardId: 'fixture.sword-blueprint',
          equipmentId: 'fixture.short-sword',
          gold: -15,
          inventorySlotIndex: 2,
          skipped: false,
        },
      ],
    }
    const toRow = (party: Party) =>
      ({
        ...JSON.parse(JSON.stringify(DrizzlePartyMapper.toDrizzle(party))),
        createdAt: party.createdAt,
        savedAt: party.savedAt,
      }) as TPartyRow
    const withVisit = makeParty({
      status: 'inSession',
      members: [
        PartyMember.create(
          {
            characterName: 'Lia',
            kind: 'human',
            player: makePlayerState({ lastBlacksmithVisit }),
          },
          new UniqueEntityID('member-1')
        ),
      ],
    })

    expect(
      DrizzlePartyMapper.toDomain(toRow(withVisit)).members[0].player
        .lastBlacksmithVisit
    ).toEqual(lastBlacksmithVisit)
    expect(
      DrizzlePartyMapper.toDomain(toRow(makeParty({ status: 'inSession' })))
        .members[0].player.lastBlacksmithVisit
    ).toBeUndefined()
  })

  it('CONTRATO v0.86: replaced do enchant guarda o active; save anterior sem ele lê active true (D-139 b)', () => {
    const emberEdge = {
      id: 'ember-edge',
      name: 'Fio de Brasa',
      kind: 'element' as const,
      element: 'fire' as const,
      bonusPercent: 10,
      materials: [],
    }
    const replaced = {
      enchantment: emberEdge,
      zoneId: 'fixture.gray-harbor',
      slotIndex: 0,
      active: true,
    }
    const lastBlacksmithVisit = {
      source: 'blacksmith' as const,
      zoneId: 'fixture.gray-harbor',
      actionPointsSpent: 3,
      results: [
        {
          operation: 'enchant' as const,
          target: { location: 'inventory' as const, inventorySlotIndex: 0 },
          cardId: 'fixture.short-sword',
          enchantmentId: 'ember-edge',
          gold: -50,
          roll: 11,
          threshold: 10,
          success: true,
          replaced,
          skipped: false,
        },
      ],
    }
    const row = {
      ...JSON.parse(
        JSON.stringify(
          DrizzlePartyMapper.toDrizzle(
            makeParty({
              status: 'inSession',
              members: [
                PartyMember.create(
                  {
                    characterName: 'Lia',
                    kind: 'human',
                    player: makePlayerState({ lastBlacksmithVisit }),
                  },
                  new UniqueEntityID('member-1')
                ),
              ],
            })
          )
        )
      ),
    } as TPartyRow
    const visitOf = (r: TPartyRow) =>
      DrizzlePartyMapper.toDomain(r).members[0].player.lastBlacksmithVisit

    expect(visitOf(row)).toEqual(lastBlacksmithVisit)
    const stored = row.state as unknown as {
      members: { player: { lastBlacksmithVisit: typeof lastBlacksmithVisit } }[]
    }
    const legacy = stored.members[0].player.lastBlacksmithVisit.results[0]
      .replaced as Partial<typeof replaced>
    delete legacy.active
    expect(visitOf(row)).toEqual(lastBlacksmithVisit)
  })

  it('REQ-144: ida e volta preserva lastBoosterOpening, a entrega pendente do booster e a fila; save sem eles lê undefined', () => {
    const lastBoosterOpening = {
      boosterCardId: 'fixture.booster',
      via: 'prepare' as const,
      cards: [
        { cardId: 'fixture.focus', destination: 'tcgFolder' as const },
        { cardId: 'fixture.short-sword', destination: 'inventory' as const },
        { cardId: 'fixture.short-sword', destination: 'pending' as const },
        { cardId: 'fixture.short-sword', destination: 'vault' as const },
      ],
    }
    const withBooster = makeParty({
      status: 'inSession',
      members: [
        PartyMember.create(
          {
            characterName: 'Lia',
            kind: 'human',
            player: makePlayerState({ lastBoosterOpening }),
          },
          new UniqueEntityID('member-1')
        ),
      ],
      pendingReward: {
        id: 'reward-1',
        memberId: 'member-1',
        cardId: 'fixture.short-sword',
        origin: { type: 'fixed' },
        source: { type: 'booster', boosterCardId: 'fixture.booster' },
        destination: 'inventory',
        discardOptions: [
          { cardId: 'fixture.pickaxe', space: 'inventory', maxCopies: 1 },
        ],
        decisionDeadlineAt: null,
      },
      boosterQueue: {
        boosterCardId: 'fixture.booster',
        remaining: ['fixture.short-sword', 'fixture.short-sword'],
      },
    })
    const without = makeParty({ status: 'inSession' })
    const toRow = (party: Party) =>
      ({
        ...JSON.parse(JSON.stringify(DrizzlePartyMapper.toDrizzle(party))),
        createdAt: party.createdAt,
        savedAt: party.savedAt,
      }) as TPartyRow

    const restored = DrizzlePartyMapper.toDomain(toRow(withBooster))
    expect(restored.members[0].player.lastBoosterOpening).toEqual(
      lastBoosterOpening
    )
    expect(restored.pendingRewards[0].source).toEqual({
      type: 'booster',
      boosterCardId: 'fixture.booster',
    })
    expect(restored.boosterQueue).toEqual({
      boosterCardId: 'fixture.booster',
      remaining: ['fixture.short-sword', 'fixture.short-sword'],
    })
    expect(DrizzlePartyMapper.toDrizzle(restored).state.schemaVersion).toBe(11)

    const plain = DrizzlePartyMapper.toDomain(toRow(without))
    expect(plain.members[0].player.lastBoosterOpening).toBeUndefined()
    expect(plain.boosterQueue).toBeUndefined()
  })

  it('REQ-159 (D-152): save de antes da T-77 — opção de descarte sem space lê o espaço principal', () => {
    const party = makeParty({
      status: 'inSession',
      pendingReward: {
        id: 'reward-1',
        memberId: 'member-1',
        cardId: 'fixture.focus',
        origin: { type: 'fixed' },
        source: { type: 'scavenge' },
        destination: 'tcgFolder',
        discardOptions: [
          { cardId: 'fixture.focus', space: 'tcgFolder', maxCopies: 2 },
        ],
        decisionDeadlineAt: null,
      },
    })
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow
    const state = row.state as unknown as {
      pendingReward: { discardOptions: Record<string, unknown>[] }
    }
    delete state.pendingReward.discardOptions[0].space
    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })
    expect(restored.pendingRewards[0].discardOptions).toEqual([
      { cardId: 'fixture.focus', space: 'tcgFolder', maxCopies: 2 },
    ])
  })

  /** Linha como era gravada antes da FEAT-16: sem `expansions` nos jogadores. */
  function rowBeforeMarkets(
    party: ReturnType<typeof usedRngParty>,
    schemaVersion: number
  ) {
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow & {
      state: {
        schemaVersion: number
        members: { player: Record<string, unknown> }[]
      }
    }
    row.state.schemaVersion = schemaVersion
    for (const member of row.state.members) delete member.player.expansions
    return row
  }

  it('REQ-138: o save v9 de antes da FEAT-16 lê mercados vazios e expansões em 0, sem usar o RNG', () => {
    const party = usedRngParty()
    const row = rowBeforeMarkets(party, 9)

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })

    expect(restored.markets).toEqual([])
    expect(restored.marketPool).toEqual([])
    expect(restored.members[0].player.expansions).toEqual({
      vaultSlots: 0,
      deckSlots: 0,
      tcgFolder: 0,
      purse: 0,
      vaultGold: 0,
    })
    expect(restored.rngState).toEqual(party.rngState)
  })

  it.each([2, 3, 4, 5] as const)(
    'REQ-138: o save v%i lê mercados vazios e expansões em 0, sem usar o RNG, e regrava como v11',
    (version) => {
      const { party, row } = legacyRow(version)

      const restored = DrizzlePartyMapper.toDomain(row)

      expect(restored.markets).toEqual([])
      expect(restored.marketPool).toEqual([])
      expect(restored.members[0].player.expansions).toEqual({
        vaultSlots: 0,
        deckSlots: 0,
        tcgFolder: 0,
        purse: 0,
        vaultGold: 0,
      })
      expect(restored.rngState).toEqual(party.rngState)
      expect(DrizzlePartyMapper.toDrizzle(restored).state.schemaVersion).toBe(
        11
      )
    }
  )

  it('REQ-138: o save v8 lê mercados vazios e expansões em 0, sem usar o RNG', () => {
    const party = usedRngParty()
    const row = rowBeforeMarkets(party, 8)

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })

    expect(restored.markets).toEqual([])
    expect(restored.marketPool).toEqual([])
    expect(restored.members[0].player.expansions?.purse).toBe(0)
    expect(restored.rngState).toEqual(party.rngState)
  })
})

describe('DrizzlePartyMapper — save v10 (REQ-147, D-131)', () => {
  const ember = {
    id: 'ember-edge',
    name: 'Fio de Brasa',
    kind: 'element' as const,
    element: 'fire' as const,
    bonusPercent: 10,
    materials: [{ cardId: 'fixture.ember-shard', quantity: 1 }],
  }
  const state = {
    refinement: 3,
    enchantments: [
      { enchantment: ember, zoneId: 'fixture.gray-harbor', slotIndex: 0 },
      { enchantment: ember, zoneId: 'fixture.gray-harbor', slotIndex: null },
    ],
    repairMarks: 1,
    broken: false,
  }

  function partyWith(player: Record<string, unknown>) {
    const base = makeParty({ status: 'inSession' })
    const member = base.members[0]
    return makeParty({
      status: 'inSession',
      members: [
        PartyMember.create(
          {
            characterName: member.characterName,
            kind: member.kind,
            player: { ...member.player, ...player },
          },
          member.id
        ),
      ],
    })
  }
  const roundTrip = (party: Party) => {
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow
    return {
      row,
      restored: DrizzlePartyMapper.toDomain({
        ...row,
        createdAt: party.createdAt,
        savedAt: party.savedAt,
      }),
    }
  }

  it('REQ-147: ida e volta preserva o estado do equipamento em uso, no inventário e no cofre; o quebrado vai no estado', () => {
    const player = {
      equipment: {
        ...makePlayerState().equipment,
        weapon: 'fixture.short-sword',
        head: 'fixture.iron-helm',
      },
      equipmentStates: {
        weapon: {
          refinement: 3,
          enchantments: state.enchantments,
          repairMarks: 1,
        },
      },
      brokenEquipment: ['head'],
      inventory: [
        { cardId: 'fixture.short-sword', quantity: 1, equipmentState: state },
        { cardId: 'fixture.short-sword', quantity: 1 },
      ],
      vault: {
        slots: [
          {
            cardId: 'fixture.short-sword',
            quantity: 1,
            equipmentState: { ...state, broken: true },
          },
        ],
        decks: [],
        gold: 0,
      },
    }
    const party = partyWith(player)

    const { row, restored } = roundTrip(party)

    const stored = row.state as unknown as {
      schemaVersion: number
      members: { player: Record<string, unknown> }[]
    }
    expect(stored.schemaVersion).toBe(11)
    expect(stored.members[0].player.brokenEquipment).toBeUndefined()
    expect(stored.members[0].player.equipmentStates).toEqual({
      weapon: state,
      head: {
        refinement: 0,
        enchantments: [],
        repairMarks: 0,
        broken: true,
      },
    })
    const restoredPlayer = restored.members[0].player
    expect(restoredPlayer.equipmentStates).toEqual(player.equipmentStates)
    expect(restoredPlayer.brokenEquipment).toEqual(['head'])
    expect(restoredPlayer.inventory).toEqual(player.inventory)
    expect(restoredPlayer.vault).toEqual(player.vault)
  })

  it('REQ-147: sem estado nenhum, o save v10 não grava campo de estado', () => {
    const { row } = roundTrip(partyWith({}))

    const stored = row.state as unknown as {
      members: { player: Record<string, unknown> }[]
    }
    expect(stored.members[0].player.equipmentStates).toBeUndefined()
    expect(stored.members[0].player.brokenEquipment).toBeUndefined()
  })

  it('REQ-147: o save v9 lê estado padrão em tudo, exceto broken nos slots de brokenEquipment, e regrava como v11 sem usar o RNG', () => {
    const party = partyWith({
      equipment: {
        ...makePlayerState().equipment,
        weapon: 'fixture.short-sword',
      },
      brokenEquipment: ['weapon'],
      inventory: [{ cardId: 'fixture.short-sword', quantity: 1 }],
    })
    const row = JSON.parse(
      JSON.stringify(DrizzlePartyMapper.toDrizzle(party))
    ) as TPartyRow & {
      state: {
        schemaVersion: number
        members: { player: Record<string, unknown> }[]
      }
    }
    row.state.schemaVersion = 9
    delete row.state.members[0].player.equipmentStates
    row.state.members[0].player.brokenEquipment = ['weapon']

    const restored = DrizzlePartyMapper.toDomain({
      ...row,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    })

    const player = restored.members[0].player
    expect(player.equipmentStates).toBeUndefined()
    expect(player.brokenEquipment).toEqual(['weapon'])
    expect(player.inventory).toEqual([
      { cardId: 'fixture.short-sword', quantity: 1 },
    ])
    expect(restored.rngState).toEqual(party.rngState)
    const rewritten = DrizzlePartyMapper.toDrizzle(restored).state
    expect(rewritten.schemaVersion).toBe(11)
    expect(rewritten.members[0].player.equipmentStates).toEqual({
      weapon: {
        refinement: 0,
        enchantments: [],
        repairMarks: 0,
        broken: true,
      },
    })
  })

  it('REQ-147: estado com refino fora de 0 a 10 é save corrompido', () => {
    const row = JSON.parse(
      JSON.stringify(
        DrizzlePartyMapper.toDrizzle(
          partyWith({
            inventory: [
              {
                cardId: 'fixture.short-sword',
                quantity: 1,
                equipmentState: { ...state, refinement: 11 },
              },
            ],
          })
        )
      )
    ) as TPartyRow

    expect(() => DrizzlePartyMapper.toDomain(row)).toThrow()
  })
})
