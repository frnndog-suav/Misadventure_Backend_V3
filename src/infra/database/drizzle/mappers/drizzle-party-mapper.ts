import { z } from 'zod'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { RngState } from '@/core/rng/seeded-rng'
import { Party } from '@/domain/campaign/enterprise/entities/party'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import { DIRECTIONS } from '@/domain/campaign/enterprise/map-assembly'
import { sortedByCardId } from '@/domain/campaign/enterprise/starting-player'
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

// D-70: save v4 (FEAT-09). Os v3 (D-64) e v2 (D-43) são lidos e atualizados em
// memória; os saves v1 são apagados pela migração 0002 (T-17).
const SCHEMA_VERSION = 4

const uint32 = z
  .number()
  .int()
  .min(0)
  .max(2 ** 32 - 1)

// As chaves que a FEAT-09 acrescentou (REQ-60): saves v2 e v3 não as têm.
const V4_CONFIG_KEYS = [
  'maxCopiesPerCard',
  'tcgFolderCapacity',
  'recoverHealthPercent',
  'recoverVigorPercent',
  'recoverHandSize',
] as const satisfies readonly TGameConfigKey[]
type TV4ConfigKey = (typeof V4_CONFIG_KEYS)[number]
type TLegacyConfigKey = Exclude<TGameConfigKey, TV4ConfigKey>

const isV4ConfigKey = (key: TGameConfigKey): key is TV4ConfigKey =>
  (V4_CONFIG_KEYS as readonly string[]).includes(key)

const configKeys = Object.keys(GAME_CONFIG_DEFAULTS) as TGameConfigKey[]

const configSchema = z.strictObject(
  Object.fromEntries(
    configKeys.map((key) => [key, z.number().int()])
  ) as Record<TGameConfigKey, z.ZodNumber>
)

const legacyConfigSchema = z.strictObject(
  Object.fromEntries(
    configKeys
      .filter((key) => !isV4ConfigKey(key))
      .map((key) => [key, z.number().int()])
  ) as Record<TLegacyConfigKey, z.ZodNumber>
)

/** D-70: o grupo antigo não tinha cópia destas chaves; valem os padrões. */
const V4_CONFIG_DEFAULTS = Object.fromEntries(
  V4_CONFIG_KEYS.map((key) => [key, GAME_CONFIG_DEFAULTS[key]])
) as Record<TV4ConfigKey, number>

const modifiersSchema = z.strictObject(
  Object.fromEntries(MODIFIERS.map((m) => [m, z.number().int()])) as Record<
    TModifier,
    z.ZodNumber
  >
)

const id = z.string().min(1)

const cardCopies = z.array(
  z.strictObject({ cardId: id, copies: z.number().int().min(1) })
)

const playerFields = {
  playerClasses: z.array(
    z.strictObject({
      playerClass: z.enum(PLAYER_CLASSES),
      deckLockMet: z.boolean(),
    })
  ),
  build: cardCopies,
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
}

const legacyPlayerSchema = z.strictObject(playerFields)
const playerSchema = z.strictObject({
  ...playerFields,
  tcgFolder: cardCopies,
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

const turnSchema = z.strictObject({
  round: z.number().int().min(1),
  memberId: id,
  actionPoints: z.number().int().min(0),
})

const stateFields = <TConfig extends z.ZodType, TPlayer extends z.ZodType>(
  config: TConfig,
  player: TPlayer
) => ({
  members: z
    .array(
      z.strictObject({
        id,
        characterName: z.string().min(1),
        kind: z.literal('human'),
        player,
      })
    )
    .min(1),
  hostMemberId: id,
  config,
  rngState: z.tuple([uint32, uint32, uint32, uint32]),
  dimension: dimensionSchema,
  turnOrder: z.array(id),
})

// D-31: o banco não valida o jsonb; o mapper valida antes de `SeededRng.fromState` (D-32).
const stateSchema = z
  .discriminatedUnion('schemaVersion', [
    z.strictObject({
      schemaVersion: z.literal(2),
      ...stateFields(legacyConfigSchema, legacyPlayerSchema),
    }),
    z.strictObject({
      schemaVersion: z.literal(3),
      ...stateFields(legacyConfigSchema, legacyPlayerSchema),
      turn: turnSchema,
    }),
    z.strictObject({
      schemaVersion: z.literal(SCHEMA_VERSION),
      ...stateFields(configSchema, playerSchema),
      turn: turnSchema,
    }),
  ])
  .refine((state) => state.members.some((m) => m.id === state.hostMemberId), {
    message: 'hostMemberId fora dos membros',
  })
  .refine(
    (state) =>
      state.schemaVersion === 2 ||
      state.turnOrder.includes(state.turn.memberId),
    { message: 'turn.memberId fora de turnOrder' }
  )

const statusSchema = z.enum(['idle', 'inSession'])

type TPartyState = Extract<
  z.infer<typeof stateSchema>,
  { schemaVersion: typeof SCHEMA_VERSION }
>

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
            {
              characterName: m.characterName,
              kind: m.kind,
              // D-70: antes da FEAT-09 não havia pasta; a build vai em ordem de cardId (REQ-62).
              player:
                'tcgFolder' in m.player
                  ? m.player
                  : {
                      ...m.player,
                      build: sortedByCardId(m.player.build),
                      tcgFolder: [],
                    },
            },
            new UniqueEntityID(m.id)
          )
        ),
        hostMemberId: new UniqueEntityID(state.hostMemberId),
        status,
        config:
          state.schemaVersion === SCHEMA_VERSION
            ? (state.config satisfies TGameConfigValues)
            : { ...state.config, ...V4_CONFIG_DEFAULTS },
        rngState: state.rngState satisfies RngState,
        dimension: state.dimension,
        turnOrder,
        // D-64: o save v2 ganha a vez na rodada 1, com o 1º de `turnOrder` e pontos cheios.
        turn:
          state.schemaVersion === 2
            ? {
                round: 1,
                memberId: turnOrder[0],
                actionPoints: state.config.actionPointsPerTurn,
              }
            : {
                round: state.turn.round,
                memberId: new UniqueEntityID(state.turn.memberId),
                actionPoints: state.turn.actionPoints,
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
            tcgFolder: m.player.tcgFolder.map((e) => ({ ...e })),
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
        turn: {
          round: party.turn.round,
          memberId: party.turn.memberId.toString(),
          actionPoints: party.turn.actionPoints,
        },
      },
    }
  }
}
