import { z } from 'zod'
import { activationSchema } from '@/infra/content/effect-schemas'
import {
  blacksmithEnchantment,
  cardFileSchemas,
  eventOutcome,
  eventRequirement,
} from '@/infra/content/card-schemas'
import {
  EFFECT_MARKS,
  EVENT_PHASES,
} from '@/domain/catalog/enterprise/value-objects/effect'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { RngState } from '@/core/rng/seeded-rng'
import {
  Party,
  type TPartyProps,
} from '@/domain/campaign/enterprise/entities/party'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import { DIRECTIONS } from '@/domain/campaign/enterprise/map-assembly'
import {
  capacitiesOf,
  MARKET_EXPANSIONS,
  noExpansions,
} from '@/domain/campaign/enterprise/markets'
import { sortedByCardId } from '@/domain/campaign/enterprise/starting-player'
import {
  isDefaultEquipmentState,
  withWornState,
  wornStateOf,
  type TEquipmentState,
} from '@/domain/campaign/enterprise/equipment-state'
import type { TInventorySlot } from '@/domain/campaign/enterprise/inventory'
import { emptyVault } from '@/domain/campaign/enterprise/vault'
import type { TEventEncounter } from '@/domain/campaign/enterprise/random-event'
import {
  emptyEquipment,
  type TPlayerState,
} from '@/domain/campaign/enterprise/entities/party-member'
import {
  ENEMY_ABILITY_PRIORITIES,
  ENEMY_BEHAVIORS,
  ELEMENTS,
  EQUIPMENT_SLOTS,
  MODIFIERS,
  type TEquipmentSlot,
  PLAYER_CLASSES,
  type TModifier,
  ZONE_TYPES,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  BLACKSMITH_LIMITS,
  MOUNT_LIMITS,
  COMBAT_NUMERIC_LIMITS,
  GAME_CONFIG_DEFAULTS,
  KNOCKOUT_NUMERIC_LIMITS,
  MARKET_LIMITS,
  QUEST_LIMITS,
  type TGameConfigKey,
  type TGameConfigValues,
  type TNumericGameConfigKey,
} from '@/domain/lab/enterprise/value-objects/game-config/defaults'

// REQ-107: saves v2 a v6 ganham a lista de status na leitura.
const SCHEMA_VERSION = 11

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

const optionalNumericConfigLimits = {
  ...COMBAT_NUMERIC_LIMITS,
  ...KNOCKOUT_NUMERIC_LIMITS,
  ...QUEST_LIMITS,
  ...MARKET_LIMITS,
  ...BLACKSMITH_LIMITS,
  ...MOUNT_LIMITS,
}
type TOptionalNumericConfigKey = keyof typeof optionalNumericConfigLimits
type TLegacyConfigKey = Exclude<
  TNumericGameConfigKey,
  'escapeVigorPercent' | TOptionalNumericConfigKey
>

const configKeys = Object.keys(GAME_CONFIG_DEFAULTS).filter(
  (key) =>
    key !== 'reserveDeck' &&
    key !== 'escapeVigorPercent' &&
    key !== 'enemyAbilityPriorities' &&
    !Object.hasOwn(optionalNumericConfigLimits, key)
) as TLegacyConfigKey[]

const configSchema = z.strictObject(
  Object.fromEntries(
    configKeys.map((key) => [key, z.number().int()])
  ) as Record<TLegacyConfigKey, z.ZodNumber>
)

const currentConfigSchema = configSchema.extend({
  ...(Object.fromEntries(
    Object.entries(optionalNumericConfigLimits).map(([key, { min, max }]) => [
      key,
      z.number().int().min(min).max(max).optional(),
    ])
  ) as Record<TOptionalNumericConfigKey, z.ZodOptional<z.ZodNumber>>),
  enemyAbilityPriorities: z
    .record(
      z.enum(ENEMY_BEHAVIORS),
      z
        .array(z.enum(ENEMY_ABILITY_PRIORITIES))
        .min(1)
        .refine((values) => new Set(values).size === values.length)
        .readonly()
    )
    .optional(),
  escapeVigorPercent: z.number().int().min(0).max(100).optional(),
  reserveDeck: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({
          type: z.literal('gold'),
          amount: z.number().int().positive(),
          weight: z.number().int().positive(),
        }),
        z.strictObject({
          type: z.literal('card'),
          cardId: z.string().min(1),
          weight: z.number().int().positive(),
        }),
      ])
    )
    .min(1)
    .optional(),
})

const v5ConfigSchema = z.strictObject(
  Object.fromEntries(
    configKeys
      .filter((key) => !isV6ConfigKey(key))
      .map((key) => [key, z.number().int()])
  ) as Record<Exclude<TLegacyConfigKey, TV6ConfigKey>, z.ZodNumber>
)

const v4ConfigSchema = z.strictObject(
  Object.fromEntries(
    configKeys
      .filter((key) => !isV5ConfigKey(key) && !isV6ConfigKey(key))
      .map((key) => [key, z.number().int()])
  ) as Record<
    Exclude<TLegacyConfigKey, TV5ConfigKey | TV6ConfigKey>,
    z.ZodNumber
  >
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
    Exclude<TLegacyConfigKey, TV4ConfigKey | TV5ConfigKey | TV6ConfigKey>,
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
  respawnZoneId: id.optional(),
  // REQ-157, D-146: antes do v11 não havia montaria; aceita só a ausência ou `null`.
  mount: z.null().optional(),
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
const v6PlayerFields = {
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
}
const v6PlayerSchema = z.strictObject(v6PlayerFields)
const statusSchema = z.strictObject({
  statusId: id,
  sourceCardId: id,
  effectIndex: z.number().int().nonnegative(),
  text: z.string().min(1),
  mark: z.enum(EFFECT_MARKS),
  activation: z.array(activationSchema).min(1),
  duration: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.enum([
        'untilEndOfTurn',
        'untilStartOfNextTurn',
        'untilEndOfRound',
        'untilLeaveZone',
        'infinite',
        'untilPartyEnd',
        'untilKnockout',
        'untilEventEnd',
        'untilOwnCombatTurnEnd',
        'untilDamageTaken',
        'untilAttackMade',
        'untilAttackMissed',
        'untilNextCombatEnd',
        'untilCombatWon',
      ]),
    }),
    z.strictObject({
      kind: z.literal('forOwnTurns'),
      turns: z.number().int().positive(),
    }),
    z.strictObject({
      kind: z.literal('forRounds'),
      rounds: z.number().int().positive(),
    }),
    z.strictObject({
      kind: z.literal('untilEventPhaseEnd'),
      phase: z.enum(EVENT_PHASES),
    }),
    z.strictObject({
      kind: z.literal('forOwnCombatTurns'),
      turns: z.number().int().positive(),
    }),
    z.strictObject({
      kind: z.literal('forCombatCycles'),
      cycles: z.number().int().positive(),
    }),
    z.strictObject({
      kind: z.enum(['forAbilitiesUsed', 'forCombats']),
      count: z.number().int().positive(),
    }),
    z.strictObject({
      kind: z.literal('untilAbilityUsed'),
      element: z.enum(ELEMENTS).nullable(),
    }),
    z.strictObject({ kind: z.literal('whileAbilityActive'), cardId: id }),
  ]),
  remaining: z.number().int().positive().nullable(),
})
const v7PlayerSchema = z.strictObject({
  ...v6PlayerFields,
  statuses: z.array(statusSchema),
})

const count = z.number().int().nonnegative()
const copies = z.number().int().positive()
const zoneType = z.enum(ZONE_TYPES)
const handCopy = z.strictObject({ copyId: id, cardId: id })
const rewardDiscard = z.strictObject({ cardId: id, copies })
const receipt = z.strictObject({
  requirementId: id,
  gold: count.optional(),
  health: count.optional(),
  vigor: count.optional(),
  handCards: z.array(handCopy).optional(),
  movedAttributeCards: z.array(handCopy).optional(),
  equipment: z
    .array(
      z.strictObject({
        slot: z.enum(EQUIPMENT_SLOTS),
        cardId: id,
      })
    )
    .optional(),
  resources: z.array(rewardDiscard).optional(),
})
const escapeReceipt = z.strictObject({
  vigorSpent: count,
  naturalRoll: z.number().int().min(1).max(20).nullable(),
  total: z.number().nullable(),
  threshold: z.number(),
  succeeded: z.boolean(),
  actionPointsLost: count,
  nextTurnActionPointDebtAdded: count,
})
const cause = z.enum([
  'requirementsMet',
  'gaveUp',
  'escapeSucceeded',
  'escapeFailed',
])
const eventResult = z.strictObject({
  encounterId: id,
  cardId: id,
  resolution: z.enum(['success', 'setback', 'escaped']),
  cause,
  payments: z.array(receipt),
  peakDelta: z.number().int(),
  replacement: z.strictObject({ requested: count, drawn: count }),
  escape: escapeReceipt.nullable(),
})
const eventCard = cardFileSchemas.randomEvent.omit({ status: true }).extend({
  type: z.literal('randomEvent'),
  collectionId: id,
  requirements: z.array(eventRequirement).min(1),
  goodOutcome: eventOutcome,
  badOutcome: eventOutcome,
})
const eventEncounter = z.strictObject({
  id,
  memberId: id,
  zoneType,
  phase: z.enum(EVENT_PHASES),
  card: eventCard.nullable(),
  payments: z.array(receipt),
  decisionDeadlineAt: z.null(),
  outcome: z
    .strictObject({
      nextStep: count,
      nextCopy: count.optional(),
      startingPeak: count,
      cause,
      escape: escapeReceipt.nullable(),
    })
    .optional(),
})
const rewardOrigin = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('rewardDeck'), zoneType }),
  z.strictObject({ type: z.literal('reserveDeck') }),
  z.strictObject({ type: z.literal('fixed') }),
])
const pendingReward = z.strictObject({
  id,
  memberId: id,
  cardId: id,
  origin: rewardOrigin,
  source: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('scavenge') }),
    z.strictObject({ type: z.literal('randomEvent'), encounterId: id }),
    z.strictObject({ type: z.literal('combatEvent'), combatId: id }),
    z.strictObject({ type: z.literal('quest'), questId: id, questCardId: id }),
    z.strictObject({ type: z.literal('booster'), boosterCardId: id }),
  ]),
  destination: z.enum(['inventory', 'tcgFolder']),
  discardOptions: z.array(z.strictObject({ cardId: id, maxCopies: copies })),
  decisionDeadlineAt: z.null(),
})
const boosterQueue = z.strictObject({
  boosterCardId: id,
  remaining: z.array(id).min(1),
})
const boosterOpeningSchema = z.strictObject({
  boosterCardId: id,
  via: z.enum(['prepare', 'useVault']),
  cards: z
    .array(
      z.strictObject({
        cardId: id,
        destination: z.enum(['tcgFolder', 'inventory', 'vault', 'pending']),
      })
    )
    .readonly(),
})
const questRewardDelivery = z.strictObject({
  zoneType,
  steps: cardFileSchemas.zoneQuest.shape.rewards,
  cursor: z.strictObject({ nextStep: count, nextCopy: count.optional() }),
})
const playerSchema = v7PlayerSchema.extend({
  completedZoneQuests: z
    .array(z.strictObject({ dimensionCardId: id, questCardId: id }))
    .optional(),
  openGenericQuests: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({
          questId: id,
          type: z.literal('trialQuest'),
          classId: z.enum(PLAYER_CLASSES),
          specializationId: id,
          randomEventSuccesses: count.optional(),
          combatVictories: count.optional(),
        }),
        z.strictObject({
          questId: id,
          type: z.literal('mentorQuest'),
          classId: z.enum(PLAYER_CLASSES),
          randomEventSuccesses: count.optional(),
          combatVictories: count.optional(),
        }),
      ])
    )
    .optional(),
  questOrder: z.array(id).optional(),
  specializations: z
    .array(
      z.strictObject({
        playerClass: z.enum(PLAYER_CLASSES),
        specializationId: id,
        deckLockMet: z.boolean(),
      })
    )
    .optional(),
  openZoneQuests: z
    .array(
      z.strictObject({
        questId: id,
        questCardId: id,
        originZoneId: id,
        stageIndex: count,
        status: z.enum(['ready', 'inProgress', 'completed']).optional(),
        randomEventSuccesses: count.optional(),
        combatVictories: count.optional(),
      })
    )
    .optional(),
  lastScavenge: z
    .strictObject({
      cardId: id,
      found: z.boolean(),
      delivery: z.enum(['inventory', 'pending', 'left', 'none']),
    })
    .nullable()
    .optional(),
  handCopies: z.array(handCopy).optional(),
  handCopySequence: count.optional(),
  nextTurnActionPointDebt: count.optional(),
  automaticEventEscape: z.boolean().optional(),
  lastRandomEvent: eventResult.nullable().optional(),
  lastRewardSearch: z
    .strictObject({
      encounterId: id,
      cardId: id,
      found: z.boolean(),
    })
    .nullable()
    .optional(),
  lastRewardDelivery: z
    .strictObject({
      rewardId: id,
      cardId: id,
      origin: rewardOrigin,
      disposition: z.enum(['kept', 'returnedToDeck', 'removed', 'sentToLimbo']),
    })
    .nullable()
    .optional(),
})

const slot = z.enum(EQUIPMENT_SLOTS)
const element = z.enum(ELEMENTS)
const combatCard = cardFileSchemas.combatEvent.omit({ status: true }).extend({
  type: z.literal('combatEvent'),
  collectionId: id,
})
const combat = z.strictObject({
  id,
  card: combatCard,
  memberId: id,
  cycle: count,
  maxCycles: count,
  order: z.array(id),
  turn: z.strictObject({
    id,
    actorId: id,
    phase: z.enum(['prepare', 'attack']),
    attacksRemaining: count,
    enemyAbilitiesResolved: count.optional(),
  }),
  enemies: z.array(
    z.strictObject({
      id,
      blockIndex: count,
      copyIndex: count,
      health: count,
      maxHealth: count,
      vigor: count.nullable(),
      element: element.nullable(),
      effectiveModifiers: modifiersSchema,
      statuses: z.array(statusSchema),
      skippedTurns: count.optional(),
    })
  ),
  abilityUsage: z
    .array(
      z.strictObject({
        actorId: id,
        equipmentSlot: slot.nullable(),
        mountAbility: z.literal(true).optional(),
        abilityId: id,
        sourceCardId: id,
        element: element.nullable(),
        uses: count,
        cooldown: count,
        charges: count.nullable(),
        channelHealth: count.nullable(),
        activeUntilCycle: count.nullable(),
      })
    )
    .optional(),
  actedThisCycle: z.array(id).optional(),
})
const combatOutcome = z.strictObject({
  card: combatCard,
  zoneType,
  cursor: z.strictObject({ nextStep: count, nextCopy: count.optional() }),
  startingPeak: count,
  victoryPeak: count,
})
const combatResult = z.strictObject({
  combatId: id,
  cardId: id,
  memberId: id,
  resolution: z.enum(['victory', 'defeat', 'escaped']),
  cause: z.enum([
    'enemiesDefeated',
    'playerDown',
    'escapeSucceeded',
    'cycleLimit',
  ]),
  playerDown: z.boolean(),
  peakDelta: z.number().int(),
})
const triggeredEffects = z.strictObject({
  effects: z.array(
    z.strictObject({
      sourceKey: id,
      effectIndex: count,
      effectId: id,
      usedAbility: z
        .strictObject({
          slot: z.union([slot, z.literal('mount')]),
          abilityId: id,
        })
        .optional(),
      targetIds: z.array(id).optional(),
    })
  ),
  choice: z.strictObject({
    choiceId: id,
    memberId: id,
    decisionDeadlineAt: z.null(),
    effects: z.array(
      z
        .object({
          effectId: id,
          origin: z.discriminatedUnion('type', [
            z.strictObject({
              type: z.literal('inventory'),
              cardId: id,
              effectIndex: count,
            }),
            z.strictObject({
              type: z.literal('equipment'),
              cardId: id,
              equipmentSlot: slot,
              effectIndex: count,
            }),
            z.strictObject({
              type: z.literal('equipmentAbility'),
              cardId: id,
              equipmentSlot: slot,
              abilityId: id,
              effectIndex: count,
            }),
            z.strictObject({
              type: z.literal('mount'),
              cardId: id,
              effectIndex: count,
            }),
            z.strictObject({
              type: z.literal('mountAbility'),
              cardId: id,
              abilityId: id,
              effectIndex: count,
            }),
          ]),
          text: z.string(),
        })
        .and(
          z.discriminatedUnion('mode', [
            z.object({
              mode: z.literal('automatic'),
              paymentCosts: z.tuple([]),
            }),
            z.object({
              mode: z.literal('optional'),
              canPay: z.boolean(),
              paymentCosts: z.array(
                z.discriminatedUnion('type', [
                  z.object({
                    type: z.literal('automatic'),
                    costIndex: count,
                    text: z.string(),
                  }),
                  z.object({
                    type: z.literal('handCards'),
                    costIndex: count,
                    text: z.string(),
                    count,
                    eligibleCopyIds: z.array(id),
                  }),
                  z.object({
                    type: z.literal('equipmentSlots'),
                    costIndex: count,
                    text: z.string(),
                    count,
                    eligibleSlots: z.array(slot),
                  }),
                  z.object({
                    type: z.literal('resources'),
                    costIndex: count,
                    text: z.string(),
                    count,
                    eligibleResources: z.array(
                      z.object({ cardId: id, maxCopies: count })
                    ),
                  }),
                ])
              ),
            }),
          ])
        )
    ),
  }),
  continuation: z
    .discriminatedUnion('type', [
      z.strictObject({ type: z.enum(['combatTurn', 'combatEscape']) }),
      z.strictObject({ type: z.literal('combatEntry'), id, card: combatCard }),
    ])
    .optional(),
  defeats: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({ type: z.literal('enemyDefeated'), id }),
        z.strictObject({
          type: z.literal('enemyAttack'),
          behavior: z.enum(ENEMY_BEHAVIORS),
        }),
        z.strictObject({ type: z.literal('elementDamage'), element }),
        z.strictObject({ type: z.literal('elementalAdvantage') }),
      ])
    )
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
        questDeck: z.array(id).readonly().optional(),
        questBoard: z.array(id.nullable()).readonly().optional(),
        questDrawPile: z.array(id).readonly().optional(),
        questReferenceIds: z.array(id).readonly().optional(),
      })
    ),
    crossings: z.array(z.strictObject({ zoneIds: z.tuple([id, id]) })),
  }),
})

const expansionsSchema = z.strictObject({
  vaultSlots: count,
  deckSlots: count,
  tcgFolder: count,
  purse: count,
  vaultGold: count,
})

const marketGold = z.number().int()
const marketQuantity = z.number().int().min(1)
const marketVisitSchema = z.strictObject({
  zoneId: id,
  results: z
    .array(
      z.discriminatedUnion('operation', [
        z.strictObject({
          operation: z.literal('buyStock'),
          cardId: id,
          quantity: marketQuantity,
          copiesReceived: marketQuantity,
          gold: marketGold,
        }),
        z.strictObject({
          operation: z.literal('buyBooster'),
          cardId: id,
          quantity: marketQuantity,
          gold: marketGold,
        }),
        z.strictObject({
          operation: z.literal('buySingle'),
          slotIndex: count,
          cardId: id,
          destination: z.enum(['inventory', 'tcgFolder']),
          gold: marketGold,
        }),
        z.strictObject({
          operation: z.literal('sell'),
          source: z.enum(['inventory', 'tcgFolder']),
          cardId: id,
          quantity: marketQuantity,
          gold: marketGold,
        }),
        z.strictObject({
          operation: z.literal('buyExpansion'),
          expansion: z.enum(MARKET_EXPANSIONS),
          capacity: count,
          gold: marketGold,
        }),
      ])
    )
    .readonly(),
  goldLost: count,
})

const marketSchema = z.strictObject({
  zoneId: id,
  factorPercent: z.number().int().min(1),
  singles: z.boolean(),
  stock: z.array(
    z.strictObject({ cardId: id, copies: z.number().int().min(1) })
  ),
  showcase: z.array(id.nullable()),
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

// REQ-147, D-131: estado por cópia de equipamento (save v10).
const appliedEnchantmentSchema = z.strictObject({
  enchantment: blacksmithEnchantment,
  zoneId: id,
  slotIndex: z.number().int().min(0).nullable(),
})
const equipmentStateSchema = z.strictObject({
  refinement: z.number().int().min(0).max(10),
  enchantments: z.array(appliedEnchantmentSchema),
  repairMarks: z.number().int().min(0),
  broken: z.boolean(),
})
const stateSlot = z.strictObject({
  cardId: id,
  quantity: z.number().int().min(1),
  equipmentState: equipmentStateSchema.optional(),
})
// REQ-149: resultado do último Ir ao Ferreiro (save v10; ausente = `null`).
const equipmentTarget = z.discriminatedUnion('location', [
  z.strictObject({
    location: z.literal('equipment'),
    slot: z.enum(EQUIPMENT_SLOTS),
  }),
  z.strictObject({
    location: z.literal('inventory'),
    inventorySlotIndex: count,
  }),
])
const blacksmithVisitSchema = z.strictObject({
  source: z.enum(['blacksmith', 'workshop']),
  zoneId: id,
  actionPointsSpent: z.number().int().min(1),
  results: z
    .array(
      z.discriminatedUnion('operation', [
        z.strictObject({
          operation: z.literal('repair'),
          target: equipmentTarget,
          cardId: id,
          gold: z.number().int(),
          repairMarks: count,
          skipped: z.boolean(),
        }),
        z.strictObject({
          operation: z.literal('refine'),
          target: equipmentTarget,
          cardId: id,
          targetLevel: z.number().int().min(1).max(10),
          gold: z.number().int(),
          roll: z.number().int().min(1).max(20).nullable(),
          d20Bonus: count,
          threshold: count,
          success: z.boolean(),
          broke: z.boolean(),
          skipped: z.boolean(),
        }),
        // REQ-151 (T-70).
        z.strictObject({
          operation: z.literal('enchant'),
          target: equipmentTarget,
          cardId: id,
          enchantmentId: id,
          gold: z.number().int(),
          roll: z.number().int().min(1).max(20).nullable(),
          threshold: count,
          success: z.boolean(),
          // CONTRATO v0.86: com o `active` de antes da troca. Saves anteriores
          // não o gravavam; só se substitui encantamento ligado (D-139 b), então
          // o ausente é `true`.
          replaced: appliedEnchantmentSchema
            .extend({ active: z.boolean().default(true) })
            .nullable(),
          skipped: z.boolean(),
        }),
        z.strictObject({
          operation: z.literal('craft'),
          recipeCardId: id,
          equipmentId: id,
          gold: z.number().int(),
          inventorySlotIndex: count,
          skipped: z.boolean(),
        }),
      ])
    )
    .readonly(),
})
const v10PlayerFields = {
  lastBlacksmithVisit: blacksmithVisitSchema.nullable().optional(),
  inventory: z.array(stateSlot),
  vault: z.strictObject({
    slots: z.array(stateSlot),
    decks: z.array(cardCopies),
    gold: z.number().int().min(0),
  }),
  equipmentStates: z
    .strictObject(
      Object.fromEntries(
        EQUIPMENT_SLOTS.map((slot) => [slot, equipmentStateSchema.optional()])
      ) as Record<TEquipmentSlot, z.ZodOptional<typeof equipmentStateSchema>>
    )
    .optional(),
}

// D-31: o banco não valida o jsonb; o mapper valida antes de `SeededRng.fromState` (D-32).
const v8State = z.strictObject({
  schemaVersion: z.literal(8),
  ...stateFields(currentConfigSchema, playerSchema),
  turn: turnSchema,
  rewardDecks: rewardDecksSchema.optional(),
  eventDecks: z
    .array(
      z.strictObject({
        zoneType,
        cards: z.array(id),
        discard: z.array(id),
      })
    )
    .optional(),
  eventEncounter: eventEncounter.nullable().optional(),
  pendingReward: pendingReward.nullable().optional(),
  rewardSequence: count.optional(),
})

const v9PlayerSchema = playerSchema.extend({
  expansions: expansionsSchema.optional(),
  lastMarketVisit: marketVisitSchema.nullable().optional(),
  lastBoosterOpening: boosterOpeningSchema.nullable().optional(),
  down: z.boolean().optional(),
  skipNextTurn: z.boolean().optional(),
  lastKnockout: z
    .strictObject({
      id,
      combatId: id.nullable(),
      respawnZoneId: id,
      healthRestored: count,
      peakLost: count,
      vigorLost: count,
      purseGoldLost: count,
      roundAtKnockout: count,
      roundAfterRespawn: count,
    })
    .nullable()
    .optional(),
  abilityUsage: z
    .record(id, z.strictObject({ uses: count, cooldown: count }))
    .optional(),
  brokenEquipment: z.array(slot).optional(),
})
const v10PlayerSchema = v9PlayerSchema
  .omit({ brokenEquipment: true })
  .extend(v10PlayerFields)
// REQ-157, D-146 (save v11): inventário extra com `equipmentState`; pasta extra.
const mountSchema = z.strictObject({
  cardId: id,
  inventory: z.array(stateSlot),
  tcgFolder: cardCopies,
})
// Campos do save v9 a v11 que não são do jogador nem da configuração.
const v9Fields = {
  questRewardDelivery: questRewardDelivery.optional(),
  boosterQueue: boosterQueue.optional(),
  questAttempt: z
    .strictObject({
      encounterId: id,
      questId: id,
      stageIndex: count,
      reservedCardId: id.optional(),
    })
    .optional(),
  markets: z.array(marketSchema).optional(),
  marketPool: z
    .array(z.strictObject({ cardId: id, departed: count }))
    .optional(),
  combat: combat.nullable().optional(),
  combatZone: zoneType.optional(),
  lastCombatResult: combatResult.nullable().optional(),
  combatOutcome: combatOutcome.nullable().optional(),
  pendingTriggeredEffects: triggeredEffects.nullable().optional(),
  triggeredEffectSequence: count.optional(),
  upgradedCombatDecks: z.array(zoneType).optional(),
}

const legacyStates = [
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
    schemaVersion: z.literal(6),
    ...stateFields(configSchema, v6PlayerSchema),
    turn: turnSchema,
    rewardDecks: rewardDecksSchema.optional(),
  }),
  z.strictObject({
    schemaVersion: z.literal(7),
    ...stateFields(currentConfigSchema, v7PlayerSchema),
    turn: turnSchema,
    rewardDecks: rewardDecksSchema.optional(),
  }),
] as const
const v9State = v8State.extend({
  schemaVersion: z.literal(9),
  ...v9Fields,
  ...stateFields(currentConfigSchema, v9PlayerSchema),
})
// D-131: o `broken` passa para o estado de cada cópia; `brokenEquipment` sai.
const v10State = v8State.extend({
  schemaVersion: z.literal(10),
  ...v9Fields,
  ...stateFields(currentConfigSchema, v10PlayerSchema),
})
// REQ-157, D-146: a montaria (`null` sem montaria).
const v11State = v8State.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  ...v9Fields,
  ...stateFields(
    currentConfigSchema,
    v10PlayerSchema.extend({ mount: mountSchema.nullable() })
  ),
})

type TLegacyState = z.infer<(typeof legacyStates)[number]>
type TV8State = z.infer<typeof v8State>
type TV9State = z.infer<typeof v9State>
type TV10State = z.infer<typeof v10State>
type TPartyState = z.infer<typeof v11State>
type TStoredState = TLegacyState | TV8State | TV9State | TV10State | TPartyState

// Anotado: o tipo inferido da união passa do limite do compilador (TS7056).
const stateSchema: z.ZodType<TStoredState> = z
  .discriminatedUnion('schemaVersion', [
    ...legacyStates,
    v8State,
    v9State,
    v10State,
    v11State,
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

const partyStatusSchema = z.enum(['idle', 'inSession'])

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
    const status = partyStatusSchema.parse(row.status)
    const state = stateSchema.parse(row.state)
    const turnOrder = state.turnOrder.map((m) => new UniqueEntityID(m))
    const savedConfig =
      state.schemaVersion >= 6
        ? state.config
        : state.schemaVersion === 5
          ? { ...state.config, ...V6_CONFIG_DEFAULTS }
          : {
              ...V4_CONFIG_DEFAULTS,
              ...state.config,
              ...V5_CONFIG_DEFAULTS,
              ...V6_CONFIG_DEFAULTS,
            }

    const config: TGameConfigValues = {
      ...GAME_CONFIG_DEFAULTS,
      ...savedConfig,
    }

    return Party.restore(
      {
        name: row.name,
        members: state.members.map((m) =>
          PartyMember.create(
            {
              characterName: m.characterName,
              kind: m.kind,
              player: upgradePlayer(m.player, config, state.dimension),
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
        rewardDecks: 'rewardDecks' in state ? (state.rewardDecks ?? []) : [],
        ...((state.schemaVersion === 8 ||
          state.schemaVersion === 9 ||
          state.schemaVersion === 10 ||
          state.schemaVersion === SCHEMA_VERSION) && {
          eventDecks: state.eventDecks,
          eventEncounter: state.eventEncounter as
            TEventEncounter | null | undefined,
          pendingReward: state.pendingReward,
          rewardSequence: state.rewardSequence,
        }),
        ...(state.schemaVersion === 9 ||
        state.schemaVersion === 10 ||
        state.schemaVersion === SCHEMA_VERSION
          ? {
              markets: state.markets,
              marketPool: state.marketPool,
              combat: state.combat as TPartyProps['combat'],
              questRewardDelivery:
                state.questRewardDelivery as TPartyProps['questRewardDelivery'],
              boosterQueue: state.boosterQueue,
              questAttempt: state.questAttempt,
              combatZone: state.combatZone,
              lastCombatResult: state.lastCombatResult,
              combatOutcome:
                state.combatOutcome as TPartyProps['combatOutcome'],
              pendingTriggeredEffects:
                state.pendingTriggeredEffects as TPartyProps['pendingTriggeredEffects'],
              triggeredEffectSequence: state.triggeredEffectSequence,
              upgradedCombatDecks: state.upgradedCombatDecks,
            }
          : { upgradedCombatDecks: [] }),
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
    const snapshot = party.combatSnapshot()
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
            statuses: m.player.statuses.map((status) =>
              statusSchema.parse(status)
            ),
            gold: m.player.gold,
            baseHealth: m.player.baseHealth,
            health: m.player.health,
            peak: m.player.peak,
            vigor: m.player.vigor,
            zoneId: m.player.zoneId,
            respawnZoneId: m.player.respawnZoneId,
            playerClasses: m.player.playerClasses.map((c) => ({ ...c })),
            build: m.player.build.map((e) => ({ ...e })),
            tcgFolder: m.player.tcgFolder.map((e) => ({ ...e })),
            inventory: m.player.inventory.map(storedSlot),
            vault: {
              slots: m.player.vault.slots.map(storedSlot),
              decks: m.player.vault.decks.map((deck) =>
                deck.map((e) => ({ ...e }))
              ),
              gold: m.player.vault.gold,
            },
            equipment: { ...m.player.equipment },
            lastScavenge: upgradeScavenge(m.player.lastScavenge),
            ...(m.player.expansions !== undefined && {
              expansions: { ...m.player.expansions },
            }),
            ...(m.player.lastMarketVisit !== undefined && {
              lastMarketVisit: m.player.lastMarketVisit,
            }),
            ...(m.player.lastBoosterOpening !== undefined && {
              lastBoosterOpening: m.player.lastBoosterOpening,
            }),
            ...(m.player.lastBlacksmithVisit !== undefined && {
              // Mesmos dados; o schema só não é `readonly` (como storedState).
              lastBlacksmithVisit: m.player
                .lastBlacksmithVisit as unknown as TStoredBlacksmithVisit,
            }),
            deck: [...m.player.deck],
            hand: [...m.player.hand],
            discard: [...m.player.discard],
            modifiers: { ...m.player.modifiers },
            ...(m.player.openZoneQuests !== undefined && {
              openZoneQuests: m.player.openZoneQuests.map((quest) => ({
                ...quest,
              })),
            }),
            ...(m.player.openGenericQuests !== undefined && {
              openGenericQuests: m.player.openGenericQuests.map((quest) => ({
                ...quest,
              })),
            }),
            ...(m.player.questOrder !== undefined && {
              questOrder: [...m.player.questOrder],
            }),
            ...(m.player.specializations !== undefined && {
              specializations: m.player.specializations.map((entry) => ({
                ...entry,
              })),
            }),
            ...(m.player.completedZoneQuests !== undefined && {
              completedZoneQuests: m.player.completedZoneQuests.map(
                (quest) => ({
                  ...quest,
                })
              ),
            }),
            ...(m.player.handCopies !== undefined && {
              handCopies: m.player.handCopies.map((copy) => ({ ...copy })),
            }),
            ...(m.player.handCopySequence !== undefined && {
              handCopySequence: m.player.handCopySequence,
            }),
            ...(m.player.nextTurnActionPointDebt !== undefined && {
              nextTurnActionPointDebt: m.player.nextTurnActionPointDebt,
            }),
            ...(m.player.automaticEventEscape !== undefined && {
              automaticEventEscape: m.player.automaticEventEscape,
            }),
            ...(m.player.lastRandomEvent !== undefined && {
              lastRandomEvent: eventResult
                .nullable()
                .parse(m.player.lastRandomEvent),
            }),
            ...(m.player.lastRewardSearch !== undefined && {
              lastRewardSearch: m.player.lastRewardSearch,
            }),
            ...(m.player.lastRewardDelivery !== undefined && {
              lastRewardDelivery: m.player.lastRewardDelivery,
            }),
            ...(m.player.down !== undefined && { down: m.player.down }),
            ...(m.player.skipNextTurn && { skipNextTurn: true }),
            ...(m.player.lastKnockout && {
              lastKnockout: m.player.lastKnockout,
            }),
            ...(m.player.abilityUsage && {
              abilityUsage: { ...m.player.abilityUsage },
            }),
            ...storedEquipmentStates(m.player),
            mount: m.player.mount
              ? {
                  cardId: m.player.mount.cardId,
                  inventory: m.player.mount.inventory.map(storedSlot),
                  tcgFolder: m.player.mount.tcgFolder.map((e) => ({ ...e })),
                }
              : null,
          },
        })),
        hostMemberId: party.hostMemberId.toString(),
        config: { ...party.config, reserveDeck: [...party.config.reserveDeck] },
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
        ...(party.eventDecks.length > 0 && {
          eventDecks: party.eventDecks.map((deck) => ({
            zoneType: deck.zoneType,
            cards: [...deck.cards],
            discard: [...deck.discard],
          })),
        }),
        ...(party.eventEncounter && {
          eventEncounter: eventEncounter.parse(party.eventEncounter),
        }),
        ...(party.pendingRewards[0] && {
          pendingReward: pendingReward.parse(party.pendingRewards[0]),
        }),
        ...(party.questRewardDelivery && {
          questRewardDelivery: questRewardDelivery.parse(
            party.questRewardDelivery
          ),
        }),
        ...(party.boosterQueue && {
          boosterQueue: boosterQueue.parse(party.boosterQueue),
        }),
        ...(party.rewardSequence > 0 && {
          rewardSequence: party.rewardSequence,
        }),
        ...(party.markets.length > 0 && {
          markets: party.markets.map((market) => ({
            ...market,
            stock: market.stock.map((item) => ({ ...item })),
            showcase: [...market.showcase],
          })),
          marketPool: party.marketPool.map((entry) => ({ ...entry })),
        }),
        ...(snapshot.combat && { combat: combat.parse(snapshot.combat) }),
        ...(party.questAttempt && { questAttempt: { ...party.questAttempt } }),
        ...(snapshot.combatZone && { combatZone: snapshot.combatZone }),
        ...(snapshot.lastCombatResult && {
          lastCombatResult: snapshot.lastCombatResult,
        }),
        ...(snapshot.combatOutcome && {
          combatOutcome: combatOutcome.parse(snapshot.combatOutcome),
        }),
        ...(snapshot.pendingTriggeredEffects && {
          pendingTriggeredEffects: triggeredEffects.parse(
            snapshot.pendingTriggeredEffects
          ),
        }),
        ...(snapshot.triggeredEffectSequence && {
          triggeredEffectSequence: snapshot.triggeredEffectSequence,
        }),
        ...(snapshot.upgradedCombatDecks && {
          upgradedCombatDecks: [...snapshot.upgradedCombatDecks],
        }),
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

type TStoredEquipmentState = z.infer<typeof equipmentStateSchema>
type TStoredBlacksmithVisit = z.infer<typeof blacksmithVisitSchema> | null

// Só leitura: o tipo do domínio é `readonly`; o save nunca o altera.
const storedState = (state: TEquipmentState): TStoredEquipmentState =>
  state as unknown as TStoredEquipmentState

const storedSlot = ({ equipmentState, ...slot }: TInventorySlot) => ({
  ...slot,
  ...(equipmentState && { equipmentState: storedState(equipmentState) }),
})

/** D-131: o `broken` vai no estado de cada slot em uso; só grava o que não é padrão. */
function storedEquipmentStates(player: TPlayerState) {
  const entries = EQUIPMENT_SLOTS.flatMap((slot) => {
    const state = wornStateOf(player, slot)
    return isDefaultEquipmentState(state) ? [] : [[slot, storedState(state)]]
  })
  return entries.length > 0
    ? { equipmentStates: Object.fromEntries(entries) }
    : {}
}

type TStoredPlayer = Omit<z.infer<typeof legacyPlayerSchema>, 'mount'> & {
  /** Save v10: estado completo (com `broken`) de cada equipamento em uso. */
  equipmentStates?: Partial<Record<TEquipmentSlot, TEquipmentState>>
} & Partial<
    Pick<
      TPlayerState,
      | 'tcgFolder'
      | 'inventory'
      | 'equipment'
      | 'vault'
      | 'lastScavenge'
      | 'statuses'
      | 'handCopies'
      | 'handCopySequence'
      | 'nextTurnActionPointDebt'
      | 'automaticEventEscape'
      | 'lastRandomEvent'
      | 'lastRewardSearch'
      | 'lastRewardDelivery'
      | 'lastKnockout'
      | 'expansions'
      | 'lastMarketVisit'
      | 'lastBoosterOpening'
      | 'mount'
    >
  >

/**
 * D-70: antes da FEAT-09 não havia pasta; a build vai em ordem de cardId
 * (REQ-62). D-79: antes da FEAT-10, inventário vazio e nada equipado, e o
 * ouro limitado à bolsa efetiva (REQ-70, REQ-143). D-87: antes da FEAT-32, cofre vazio.
 */
function upgradePlayer(
  player: TStoredPlayer,
  config: TGameConfigValues,
  dimension: Party['dimension']
): TPlayerState {
  const expansions = player.expansions ?? noExpansions()
  const respawn = player.respawnZoneId
  const { equipmentStates: stored, ...rest } = player
  const upgraded: TPlayerState = {
    ...rest,
    respawnZoneId:
      respawn && dimension.map.zones.some(({ zoneId }) => zoneId === respawn)
        ? respawn
        : dimension.startingCityZoneId,
    gold: Math.min(player.gold, capacitiesOf(config, expansions).purse),
    build:
      player.tcgFolder === undefined
        ? sortedByCardId(player.build)
        : player.build,
    tcgFolder: player.tcgFolder ?? [],
    inventory: player.inventory ?? [],
    mount: player.mount ?? null,
    equipment: player.equipment ?? emptyEquipment(),
    vault: player.vault ?? emptyVault(),
    lastScavenge: upgradeScavenge(player.lastScavenge),
    statuses: player.statuses ?? [],
    expansions,
  }
  // O estado completo se divide: `broken` volta para `brokenEquipment` (D-137).
  return EQUIPMENT_SLOTS.reduce(
    (current, slot) =>
      stored?.[slot] ? withWornState(current, slot, stored[slot]) : current,
    upgraded
  )
}

function upgradeScavenge(
  scavenge: TPlayerState['lastScavenge'] | undefined
): NonNullable<z.infer<typeof playerSchema>['lastScavenge']> | null {
  if (!scavenge) return null
  return {
    ...scavenge,
    delivery: scavenge.delivery ?? (scavenge.found ? 'inventory' : 'none'),
  }
}
