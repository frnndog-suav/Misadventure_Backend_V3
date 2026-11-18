import { z } from 'zod'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { RngState } from '@/core/rng/seeded-rng'
import { Party } from '@/domain/campaign/enterprise/entities/party'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import { DIRECTIONS } from '@/domain/campaign/enterprise/map-assembly'
import { sortedByCardId } from '@/domain/campaign/enterprise/starting-player'
import { emptyVault } from '@/domain/campaign/enterprise/vault'
import {
  emptyEquipment,
  type TPlayerState,
} from '@/domain/campaign/enterprise/entities/party-member'
import {
  EQUIPMENT_SLOTS,
  MODIFIERS,
  type TEquipmentSlot,
  PLAYER_CLASSES,
  type TModifier,
  ZONE_TYPES,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  GAME_CONFIG_DEFAULTS,
  type TGameConfigKey,
  type TGameConfigValues,
} from '@/domain/lab/enterprise/value-objects/game-config/defaults'

// D-87: save v6 (FEAT-32). Os v5 (D-79), v4 (D-70), v3 (D-64) e v2 (D-43) são
// lidos e atualizados em memória; os saves v1 são apagados pela migração 0002 (T-17).
const SCHEMA_VERSION = 6

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

// As chaves que a FEAT-10 acrescentou (REQ-69): saves v2 a v4 não as têm.
const V5_CONFIG_KEYS = [
  'inventoryCapacity',
  'purseCapacity',
] as const satisfies readonly TGameConfigKey[]
type TV5ConfigKey = (typeof V5_CONFIG_KEYS)[number]

// As chaves que a FEAT-32 acrescentou (REQ-80): saves v2 a v5 não as têm.
const V6_CONFIG_KEYS = [
  'vaultCapacity',
  'vaultDeckSlots',
  'vaultGoldCapacity',
] as const satisfies readonly TGameConfigKey[]
type TV6ConfigKey = (typeof V6_CONFIG_KEYS)[number]

const isV4ConfigKey = (key: TGameConfigKey): key is TV4ConfigKey =>
  (V4_CONFIG_KEYS as readonly string[]).includes(key)
const isV5ConfigKey = (key: TGameConfigKey): key is TV5ConfigKey =>
  (V5_CONFIG_KEYS as readonly string[]).includes(key)
const isV6ConfigKey = (key: TGameConfigKey): key is TV6ConfigKey =>
  (V6_CONFIG_KEYS as readonly string[]).includes(key)

const configKeys = Object.keys(GAME_CONFIG_DEFAULTS) as TGameConfigKey[]

const configSchema = z.strictObject(
  Object.fromEntries(
    configKeys.map((key) => [key, z.number().int()])
  ) as Record<TGameConfigKey, z.ZodNumber>
)

const v5ConfigSchema = z.strictObject(
  Object.fromEntries(
    configKeys
      .filter((key) => !isV6ConfigKey(key))
      .map((key) => [key, z.number().int()])
  ) as Record<Exclude<TGameConfigKey, TV6ConfigKey>, z.ZodNumber>
)

const v4ConfigSchema = z.strictObject(
  Object.fromEntries(
    configKeys
      .filter((key) => !isV5ConfigKey(key) && !isV6ConfigKey(key))
      .map((key) => [key, z.number().int()])
  ) as Record<Exclude<TGameConfigKey, TV5ConfigKey | TV6ConfigKey>, z.ZodNumber>
)

const legacyConfigSchema = z.strictObject(
  Object.fromEntries(
    configKeys
      .filter(
        (key) =>
          !isV4ConfigKey(key) && !isV5ConfigKey(key) && !isV6ConfigKey(key)
      )
      .map((key) => [key, z.number().int()])
  ) as Record<
    Exclude<TGameConfigKey, TV4ConfigKey | TV5ConfigKey | TV6ConfigKey>,
    z.ZodNumber
  >
)

/** D-70, D-79: o grupo antigo não tinha cópia destas chaves; valem os padrões. */
const V4_CONFIG_DEFAULTS = Object.fromEntries(
  V4_CONFIG_KEYS.map((key) => [key, GAME_CONFIG_DEFAULTS[key]])
) as Record<TV4ConfigKey, number>
const V5_CONFIG_DEFAULTS = Object.fromEntries(
  V5_CONFIG_KEYS.map((key) => [key, GAME_CONFIG_DEFAULTS[key]])
) as Record<TV5ConfigKey, number>
const V6_CONFIG_DEFAULTS = Object.fromEntries(
  V6_CONFIG_KEYS.map((key) => [key, GAME_CONFIG_DEFAULTS[key]])
) as Record<TV6ConfigKey, number>

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
const v4PlayerSchema = z.strictObject({
  ...playerFields,
  tcgFolder: cardCopies,
})
const slotQuantities = z.array(
  z.strictObject({ cardId: id, quantity: z.number().int().min(1) })
)
const v5PlayerFields = {
  ...playerFields,
  tcgFolder: cardCopies,
  inventory: slotQuantities,
  equipment: z.strictObject(
    Object.fromEntries(
      EQUIPMENT_SLOTS.map((slot) => [slot, id.nullable()])
    ) as Record<TEquipmentSlot, z.ZodNullable<typeof id>>
  ),
}
const v5PlayerSchema = z.strictObject(v5PlayerFields)
const playerSchema = z.strictObject({
  ...v5PlayerFields,
  vault: z.strictObject({
    slots: slotQuantities,
    decks: z.array(cardCopies),
    gold: z.number().int().min(0),
  }),
  // D-93: `lastScavenge` e `rewardDecks` opcionais só por causa dos saves v6
  // de desenvolvimento gravados na T-31.
  lastScavenge: z
    .strictObject({ cardId: id, found: z.boolean() })
    .nullable()
    .optional(),
})

const rewardDecksSchema = z.array(
  z.strictObject({ zoneType: z.enum(ZONE_TYPES), cards: z.array(id) })
)

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
      schemaVersion: z.literal(4),
      ...stateFields(v4ConfigSchema, v4PlayerSchema),
      turn: turnSchema,
    }),
    z.strictObject({
      schemaVersion: z.literal(5),
      ...stateFields(v5ConfigSchema, v5PlayerSchema),
      turn: turnSchema,
    }),
    z.strictObject({
      schemaVersion: z.literal(SCHEMA_VERSION),
      ...stateFields(configSchema, playerSchema),
      turn: turnSchema,
      rewardDecks: rewardDecksSchema.optional(),
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
    const config: TGameConfigValues =
      state.schemaVersion === SCHEMA_VERSION
        ? state.config
        : state.schemaVersion === 5
          ? { ...state.config, ...V6_CONFIG_DEFAULTS }
          : {
              ...V4_CONFIG_DEFAULTS,
              ...state.config,
              ...V5_CONFIG_DEFAULTS,
              ...V6_CONFIG_DEFAULTS,
            }

    return Party.restore(
      {
        name: row.name,
        members: state.members.map((m) =>
          PartyMember.create(
            {
              characterName: m.characterName,
              kind: m.kind,
              player: upgradePlayer(m.player, config.purseCapacity),
            },
            new UniqueEntityID(m.id)
          )
        ),
        hostMemberId: new UniqueEntityID(state.hostMemberId),
        status,
        config,
        rngState: state.rngState satisfies RngState,
        dimension: state.dimension,
        // D-87: save antigo fica sem decks de recompensas.
        rewardDecks:
          state.schemaVersion === SCHEMA_VERSION
            ? (state.rewardDecks ?? [])
            : [],
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
            inventory: m.player.inventory.map((e) => ({ ...e })),
            vault: {
              slots: m.player.vault.slots.map((e) => ({ ...e })),
              decks: m.player.vault.decks.map((deck) =>
                deck.map((e) => ({ ...e }))
              ),
              gold: m.player.vault.gold,
            },
            equipment: { ...m.player.equipment },
            lastScavenge:
              m.player.lastScavenge === null
                ? null
                : { ...m.player.lastScavenge },
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
        rewardDecks: party.rewardDecks.map((deck) => ({
          zoneType: deck.zoneType,
          cards: [...deck.cards],
        })),
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

type TStoredPlayer = z.infer<typeof legacyPlayerSchema> &
  Partial<
    Pick<
      TPlayerState,
      'tcgFolder' | 'inventory' | 'equipment' | 'vault' | 'lastScavenge'
    >
  >

/**
 * D-70: antes da FEAT-09 não havia pasta; a build vai em ordem de cardId
 * (REQ-62). D-79: antes da FEAT-10, inventário vazio e nada equipado, e o
 * ouro limitado à `purseCapacity` (REQ-70). D-87: antes da FEAT-32, cofre vazio.
 */
function upgradePlayer(
  player: TStoredPlayer,
  purseCapacity: number
): TPlayerState {
  return {
    ...player,
    gold: Math.min(player.gold, purseCapacity),
    build:
      player.tcgFolder === undefined
        ? sortedByCardId(player.build)
        : player.build,
    tcgFolder: player.tcgFolder ?? [],
    inventory: player.inventory ?? [],
    equipment: player.equipment ?? emptyEquipment(),
    vault: player.vault ?? emptyVault(),
    lastScavenge: player.lastScavenge ?? null,
  }
}
