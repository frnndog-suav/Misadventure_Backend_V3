import { z } from 'zod'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { RngState } from '@/core/rng/seeded-rng'
import { Party } from '@/domain/campaign/enterprise/entities/party'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import {
  GAME_CONFIG_DEFAULTS,
  type TGameConfigKey,
  type TGameConfigValues,
} from '@/domain/lab/enterprise/value-objects/game-config/defaults'

const SCHEMA_VERSION = 1

const uint32 = z
  .number()
  .int()
  .min(0)
  .max(2 ** 32 - 1)

const configSchema = z.strictObject(
  Object.fromEntries(
    (Object.keys(GAME_CONFIG_DEFAULTS) as TGameConfigKey[]).map((key) => [
      key,
      z.number().int(),
    ])
  ) as Record<TGameConfigKey, z.ZodNumber>
)

// D-31: o banco não valida o jsonb; o mapper valida antes de `SeededRng.fromState` (D-32).
const stateSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    members: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          characterName: z.string().min(1),
          kind: z.literal('human'),
        })
      )
      .min(1),
    hostMemberId: z.string().min(1),
    config: configSchema,
    rngState: z.tuple([uint32, uint32, uint32, uint32]),
  })
  .refine((state) => state.members.some((m) => m.id === state.hostMemberId), {
    message: 'hostMemberId fora dos membros',
  })

const statusSchema = z.enum(['idle', 'inSession'])

type TPartyState = z.infer<typeof stateSchema>

export interface TPartyRow {
  id: string
  name: string
  status: string
  state: unknown
  createdAt: Date
  savedAt: Date
}

export class DrizzlePartyMapper {
  /** Save corrompido lança: é falha de infraestrutura, não regra do jogo. */
  static toDomain(row: TPartyRow): Party {
    const status = statusSchema.parse(row.status)
    const state = stateSchema.parse(row.state)

    return Party.restore(
      {
        name: row.name,
        members: state.members.map((m) =>
          PartyMember.create(
            { characterName: m.characterName, kind: m.kind },
            new UniqueEntityID(m.id)
          )
        ),
        hostMemberId: new UniqueEntityID(state.hostMemberId),
        status,
        config: state.config satisfies TGameConfigValues,
        rngState: state.rngState satisfies RngState,
        createdAt: row.createdAt,
        savedAt: row.savedAt,
      },
      new UniqueEntityID(row.id)
    )
  }

  static toDrizzle(party: Party): TPartyRow & { state: TPartyState } {
    const [a, b, c, d] = party.rngState
    return {
      id: party.id.toString(),
      name: party.name,
      status: party.status,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
      state: {
        schemaVersion: SCHEMA_VERSION,
        members: party.members.map((m) => ({
          id: m.id.toString(),
          characterName: m.characterName,
          kind: m.kind,
        })),
        hostMemberId: party.hostMemberId.toString(),
        config: party.config,
        rngState: [a, b, c, d],
      },
    }
  }
}
