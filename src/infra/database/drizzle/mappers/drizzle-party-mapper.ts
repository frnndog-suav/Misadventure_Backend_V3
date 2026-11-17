import { z } from 'zod'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { RngState } from '@/core/rng/seeded-rng'
import { Party } from '@/domain/campaign/enterprise/entities/party'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import { DIRECTIONS } from '@/domain/campaign/enterprise/map-assembly'
import {
  MODIFIERS,
  PLAYER_CLASSES,
  type TModifier,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  GAME_CONFIG_DEFAULTS,
  type TGameConfigKey,
  type TGameConfigValues,
} from '@/domain/lab/enterprise/value-objects/game-config/defaults'

// D-43: save v2 (FEAT-06). Os saves v1 são apagados pela migração 0002 (T-17).
const SCHEMA_VERSION = 2

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

const modifiersSchema = z.strictObject(
  Object.fromEntries(MODIFIERS.map((m) => [m, z.number().int()])) as Record<
    TModifier,
    z.ZodNumber
  >
)

const id = z.string().min(1)

const playerSchema = z.strictObject({
  playerClasses: z.array(
    z.strictObject({
      playerClass: z.enum(PLAYER_CLASSES),
      deckLockMet: z.boolean(),
    })
  ),
  build: z.array(
    z.strictObject({ cardId: id, copies: z.number().int().min(1) })
  ),
  deck: z.array(id),
  hand: z.array(id),
  discard: z.array(id),
  gold: z.number().int(),
  baseHealth: z.number().int(),
  health: z.number().int(),
  peak: z.number().int(),
  vigor: z.number().int(),
  modifiers: modifiersSchema,
  zoneId: id,
  respawnZoneId: id,
})

const dimensionSchema = z.strictObject({
  dimensionCardId: id,
  startingCityZoneId: id,
  map: z.strictObject({
    zones: z.array(
      z.strictObject({
        zoneId: id,
        x: z.number().int(),
        y: z.number().int(),
        arrows: z.array(z.enum(DIRECTIONS)),
      })
    ),
    crossings: z.array(z.strictObject({ zoneIds: z.tuple([id, id]) })),
  }),
})

// D-31: o banco não valida o jsonb; o mapper valida antes de `SeededRng.fromState` (D-32).
const stateSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    members: z
      .array(
        z.strictObject({
          id,
          characterName: z.string().min(1),
          kind: z.literal('human'),
          player: playerSchema,
        })
      )
      .min(1),
    hostMemberId: id,
    config: configSchema,
    rngState: z.tuple([uint32, uint32, uint32, uint32]),
    dimension: dimensionSchema,
    turnOrder: z.array(id),
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
    const turnOrder = state.turnOrder.map((m) => new UniqueEntityID(m))

    return Party.restore(
      {
        name: row.name,
        members: state.members.map((m) =>
          PartyMember.create(
            { characterName: m.characterName, kind: m.kind, player: m.player },
            new UniqueEntityID(m.id)
          )
        ),
        hostMemberId: new UniqueEntityID(state.hostMemberId),
        status,
        config: state.config satisfies TGameConfigValues,
        rngState: state.rngState satisfies RngState,
        dimension: state.dimension,
        turnOrder,
        // Provisório até a T-25 (save v3, D-64): lê como o save v2, sem gravar `turn`.
        turn: {
          round: 1,
          memberId: turnOrder[0],
          actionPoints: state.config.actionPointsPerTurn,
        },
        createdAt: row.createdAt,
        savedAt: row.savedAt,
      },
      new UniqueEntityID(row.id)
    )
  }

  static toDrizzle(party: Party): TPartyRow & { state: TPartyState } {
    const [a, b, c, d] = party.rngState
    const { dimensionCardId, startingCityZoneId, map } = party.dimension
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
          player: {
            ...m.player,
            playerClasses: m.player.playerClasses.map((c) => ({ ...c })),
            build: m.player.build.map((e) => ({ ...e })),
            deck: [...m.player.deck],
            hand: [...m.player.hand],
            discard: [...m.player.discard],
            modifiers: { ...m.player.modifiers },
          },
        })),
        hostMemberId: party.hostMemberId.toString(),
        config: party.config,
        rngState: [a, b, c, d],
        dimension: {
          dimensionCardId,
          startingCityZoneId,
          map: {
            zones: map.zones.map((z) => ({ ...z, arrows: [...z.arrows] })),
            crossings: map.crossings.map(({ zoneIds: [first, second] }) => ({
              zoneIds: [first, second],
            })),
          },
        },
        turnOrder: party.turnOrder.map((m) => m.toString()),
      },
    }
  }
}
