import { describe, expect, it } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import {
  PartyMember,
  type TPlayerState,
} from '@/domain/campaign/enterprise/entities/party-member'
import {
  makeParty,
  makePlayerState,
} from '../../../../../test/factories/make-party'
import { removePostV6Config } from '../../../../../test/factories/remove-post-v6-config'
import { DrizzlePartyMapper, type TPartyRow } from './drizzle-party-mapper'

// T-75: save v11 com `mount` (REQ-157, D-146); v2 a v5 ficam no arquivo principal (legacyRow).

const swordState = {
  refinement: 3,
  enchantments: [],
  repairMarks: 1,
  broken: false,
}
const MOUNT = {
  cardId: 'fixture.war-pony',
  inventory: [
    { cardId: 'fixture.healing-potion', quantity: 2 },
    {
      cardId: 'fixture.short-sword',
      quantity: 1,
      equipmentState: swordState,
    },
  ],
  tcgFolder: [{ cardId: 'fixture.strength-basic', copies: 3 }],
}

function partyWith(player: Partial<TPlayerState> & { mount?: unknown }) {
  const rng = SeededRng.fromSeed(7)
  for (let i = 0; i < 5; i++) rng.nextUint32()
  const base = makeParty({ status: 'inSession' })
  const member = base.members[0]
  return makeParty({
    status: 'inSession',
    rngState: rng.state(),
    members: [
      PartyMember.create(
        {
          characterName: member.characterName,
          kind: member.kind,
          player: makePlayerState(player as Partial<TPlayerState>),
        },
        member.id
      ),
    ],
  })
}

type TLooseRow = TPartyRow & {
  state: {
    schemaVersion: number
    config: unknown
    members: { player: Record<string, unknown> }[]
  }
}
const rowOf = (party: Party) =>
  JSON.parse(JSON.stringify(DrizzlePartyMapper.toDrizzle(party))) as TLooseRow
const read = (party: Party, row: TLooseRow) =>
  DrizzlePartyMapper.toDomain({
    ...row,
    createdAt: party.createdAt,
    savedAt: party.savedAt,
  })
const mountOf = (party: Party) =>
  (party.members[0].player as { mount?: unknown }).mount

describe('DrizzlePartyMapper — save v11 (REQ-157, D-146)', () => {
  it('REQ-157: grava como v11 com mount; ida e volta preserva a montaria e o equipmentState no inventário extra', () => {
    const party = partyWith({ mount: MOUNT })

    const row = rowOf(party)
    const restored = read(party, row)

    expect(row.state.schemaVersion).toBe(11)
    expect(row.state.members[0].player.mount).toEqual(MOUNT)
    expect(mountOf(restored)).toEqual(MOUNT)
    expect(restored.rngState).toEqual(party.rngState)
  })

  it('REQ-157: sem montaria, o v11 grava mount: null e lê null', () => {
    const party = partyWith({ mount: null })

    const row = rowOf(party)

    expect(row.state.schemaVersion).toBe(11)
    expect(row.state.members[0].player.mount).toBeNull()
    expect(mountOf(read(party, row))).toBeNull()
  })

  it.each([6, 7, 8, 9, 10])(
    'REQ-157/D-146: o save v%i (sem a chave mount) lê mount: null, sem usar o RNG, e regrava como v11',
    (version) => {
      const party = partyWith({})
      const row = rowOf(party)
      row.state.schemaVersion = version
      delete row.state.members[0].player.mount
      // Mesmo recorte dos testes existentes (REQ-107 para v6; REQ-138/REQ-147 para v8 a v10).
      const player = row.state.members[0].player
      if (version < 10) delete player.equipmentStates
      if (version < 10) delete player.expansions
      if (version <= 7) {
        delete player.lastKnockout
        delete player.skipNextTurn
      }
      if (version === 6) {
        const config = row.state.config as Record<string, number>
        removePostV6Config(config)
        delete config.escapeVigorPercent
        delete config.reserveDeck
        delete player.statuses
      }

      const restored = read(party, row)

      expect(mountOf(restored)).toBeNull()
      expect(restored.rngState).toEqual(party.rngState)
      expect(DrizzlePartyMapper.toDrizzle(restored).state.schemaVersion).toBe(
        11
      )
    }
  )
})
