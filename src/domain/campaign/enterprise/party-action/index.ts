import { type Either, left, right } from '@/core/error/either'
import {
  EQUIPMENT_SLOTS,
  type TEquipmentSlot,
} from '@/domain/catalog/enterprise/value-objects/card'
import { MARKET_EXPANSIONS, type TMarketExpansion } from '../markets'
import type { TReceiveSpace } from '../mount'
import type { TResolveRewardAction, TRewardDiscard } from '../rewards'
import type { TQuestAction, TZoneQuestAction } from '../zone-quests'

/** Os três modos do Recuperar (README 12.5; REQ-63). */
export const RECOVER_OPTIONS = [
  'drawToHand',
  'shuffleHand',
  'shuffleDiscard',
] as const
export type TRecoverOption = (typeof RECOVER_OPTIONS)[number]

/** Uma operação do Preparar, parte a (README 12.2; REQ-72, REQ-73; D-77). */
export type TPrepareOperation =
  | { operation: 'equip'; cardId: string }
  | { operation: 'unequip'; slot: TEquipmentSlot }
  | { operation: 'openBooster'; cardId: string }
  | TTransferMountOperation
  | TActivateOperation
  | ({ operation: 'useAbility' } & TAbilityIntent)

/** Transferir entre o jogador e a montaria (Apêndice B U1; REQ-160; D-143). */
export type TTransferMountOperation = {
  operation: 'transferMount'
  direction: 'toMount' | 'fromMount'
  space: 'inventory' | 'tcgFolder'
  cardId: string
  quantity: number
  inventorySlotIndex?: number
}

/** A origem da habilidade: exatamente um dos dois (CONTRATO FEAT-18 `AbilitySource`; REQ-157). */
export type TAbilitySource =
  | { equipmentSlot: TEquipmentSlot; mountAbility?: never }
  | { equipmentSlot?: never; mountAbility: true }

type TAbilityIntent = {
  abilityId: string
  payment?: TEventPayment
} & TAbilitySource

export type TActivateOperation = {
  operation: 'activate'
  cardId: string
  effectIndex: number
  payment?: { handCards: readonly string[] }
}

export type TEventPayment = {
  handCards?: string[]
  equipmentSlots?: TEquipmentSlot[]
  resources?: { cardId: string; copies: number }[]
}

export type TResolveTriggeredEffectAction = {
  type: 'resolveTriggeredEffect'
  choiceId: string
  effectId: string
} & (
  | { decision: 'resolve' | 'decline' }
  | { decision: 'pay'; payment?: TEventPayment }
)

export type TRandomEventAction =
  | { type: 'startEvent' }
  | {
      type: 'revealEvent' | 'resolveEvent' | 'giveUpEvent' | 'escapeEvent'
      encounterId: string
    }
  | {
      type: 'payEventRequirement'
      encounterId: string
      requirementId: string
      payment?: TEventPayment
    }

export type TCombatDecisionAction = { combatId: string; decisionId: string } & (
  | { type: 'confirmCombatRoster'; inviteeMemberIds: string[] }
  | { type: 'respondCombatInvite'; accept: boolean }
  | { type: 'confirmCombatOrder'; memberIds: string[] }
)

export type TCombatAction = { combatId: string; turnId: string } & (
  | { type: 'combatAttack'; targetId: string }
  | { type: 'endCombatTurn' | 'escapeCombat' }
  | ({ type: 'useAbility'; targetId?: string } & TAbilityIntent)
  | {
      type: 'activateCombatEffect'
      effectId: string
      targetId?: string
      payment?: TEventPayment
    }
)

/** Uma operação do Usar cofre (README 6.4; REQ-84 a REQ-87). */
export type TVaultOperation =
  | { operation: 'store'; cardId: string; quantity: number }
  | { operation: 'take'; cardId: string; quantity: number }
  | { operation: 'storeGold'; amount: number }
  | { operation: 'takeGold'; amount: number }
  | { operation: 'discard'; cardId: string; quantity: number }
  | { operation: 'saveDeck'; cards: { cardId: string; copies: number }[] }
  | { operation: 'unpackDeck'; deckIndex: number }
  | { operation: 'swapBuild'; deckIndex: number }
  | { operation: 'editBuild'; build: { cardId: string; copies: number }[] }
  | { operation: 'openBooster'; cardId: string }

/** Uma operação do Ir ao Mercado (README 24; REQ-140; D-118). */
export type TMarketOperation =
  | { operation: 'buyStock'; cardId: string; quantity: number }
  | { operation: 'buyBooster'; cardId: string; quantity: number }
  | { operation: 'buySingle'; slotIndex: number }
  | {
      operation: 'sell'
      source: 'inventory' | 'tcgFolder'
      cardId: string
      quantity: number
      /** REQ-154, D-141: a cópia de equipamento desse slot do inventário de antes do lote. */
      inventorySlotIndex?: number
    }
  | { operation: 'buyExpansion'; expansion: TMarketExpansion }
  /** REQ-158: Estábulo. */
  | { operation: 'buyMount'; cardId: string }
  | { operation: 'sellMount' }

/** Onde está o equipamento que a operação do ferreiro atende (REQ-149). */
export type TEquipmentTarget =
  | { location: 'equipment'; slot: TEquipmentSlot }
  | { location: 'inventory'; inventorySlotIndex: number }

/**
 * Uma operação do Ir ao Ferreiro (README 25; REQ-149 a REQ-152). Os índices de
 * inventário valem para o inventário de antes do lote.
 */
export type TBlacksmithOperation =
  | { operation: 'repair'; target: TEquipmentTarget }
  | { operation: 'refine'; target: TEquipmentTarget }
  | {
      operation: 'enchant'
      target: TEquipmentTarget
      enchantmentId: string
      replaceIndex?: number
      extra?: boolean
    }
  | { operation: 'craft'; inventorySlotIndex: number }

/** Intenção de jogo (CONTRATO §1.6). União por `type`; as FEATs 10+ acrescentam variantes. */
export type TPartyAction =
  | TRandomEventAction
  | TQuestAction
  | TResolveTriggeredEffectAction
  | TCombatAction
  | TCombatDecisionAction
  | TResolveRewardAction
  | { type: 'move'; zoneId: string; viaZoneId?: string }
  | { type: 'endTurn' }
  | { type: 'completeDimension' }
  | { type: 'saveRespawnPoint' }
  | { type: 'recover'; option: TRecoverOption }
  | { type: 'adjustDeck'; build: { cardId: string; copies: number }[] }
  | ({ type: 'prepare' } & TPrepareOperation)
  | { type: 'useVault'; operations: TVaultOperation[] }
  | { type: 'visitMarket'; operations: TMarketOperation[] }
  | { type: 'visitBlacksmith'; operations: TBlacksmithOperation[] }
  | { type: 'artificerWorkshop'; operations: TBlacksmithOperation[] }
  | { type: 'scavenge'; cardId: string }

/** Os `type` possíveis, para `availableActions` (REQ-58). */
export type TPartyActionType = TPartyAction['type']

/** Motivos de CONTRATO FEAT-07, FEAT-09 e FEAT-18 (`ActionInvalidDetails`). `zoneNotInMap` vem de `Party.move`. */
export type TActionIssue =
  | { field: 'Idempotency-Key'; reason: 'invalidIdempotencyKey' }
  | { field: null; reason: 'invalidBody' }
  | { field: 'type'; reason: 'required' | 'notString' | 'unknownAction' }
  | { field: 'zoneId'; reason: 'required' | 'notString' | 'zoneNotInMap' }
  | { field: 'viaZoneId'; reason: 'notString' | 'zoneNotInMap' }
  | { field: 'option'; reason: 'required' | 'notString' | 'unknownOption' }
  | { field: 'build'; reason: 'required' | 'notArray' }
  | {
      field: 'operation'
      reason: 'required' | 'notString' | 'unknownOperation'
    }
  | {
      field: 'slot' | 'equipmentSlot'
      reason: 'required' | 'notString' | 'unknownSlot'
    }
  | {
      /** `build.i`, `operations.i.cards.j.copies`, o campo a mais etc. */
      field: string
      reason:
        | 'unknownKey'
        | 'invalidItem'
        | 'required'
        | 'notString'
        | 'notArray'
        | 'notObject'
        | 'notPositiveInteger'
        | 'notNonNegativeInteger'
        | 'duplicateCard'
        | 'unknownOperation'
        | 'unknownOption'
        | 'invalidLength'
    }

/**
 * Lê o corpo cru do pedido (D-62; REQ-53). Problemas na ordem `type`, `zoneId`,
 * campos a mais na ordem do pedido. `type` ausente, inválido ou desconhecido
 * encerra a leitura: sem ação conhecida não há campos a conferir.
 */
export function parsePartyAction(
  input: unknown,
  effectActivationEnabled = true,
  eventActionsEnabled = true,
  combatEnabled = true
): Either<TActionIssue[], TPartyAction> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return left([{ field: null, reason: 'invalidBody' }])
  }
  const body = input as Record<string, unknown>

  if (body.type === undefined) {
    return left([{ field: 'type', reason: 'required' }])
  }
  if (typeof body.type !== 'string') {
    return left([{ field: 'type', reason: 'notString' }])
  }

  switch (body.type) {
    case 'resolveTriggeredEffect':
      return combatEnabled
        ? parseTriggeredEffectAction(body)
        : left([{ field: 'type', reason: 'unknownAction' }])
    case 'confirmCombatRoster':
    case 'respondCombatInvite':
    case 'confirmCombatOrder':
      return combatEnabled
        ? parseCombatDecisionAction(body.type, body)
        : left([{ field: 'type', reason: 'unknownAction' }])
    case 'escapeCombat':
    case 'combatAttack':
    case 'useAbility':
    case 'activateCombatEffect':
    case 'endCombatTurn':
      return combatEnabled
        ? parseCombatAction(body.type, body)
        : left([{ field: 'type', reason: 'unknownAction' }])
    case 'move':
      return parseMove(body)
    case 'endTurn':
      return parseEndTurn(body)
    case 'completeDimension': {
      const issues = extraKeys(body, ['type'])
      return issues.length ? left(issues) : right({ type: 'completeDimension' })
    }
    case 'saveRespawnPoint': {
      const issues = extraKeys(body, ['type'])
      return issues.length ? left(issues) : right({ type: 'saveRespawnPoint' })
    }
    case 'recover':
      return parseRecover(body)
    case 'adjustDeck':
      return parseAdjustDeck(body)
    case 'prepare':
      return parsePrepare(body, effectActivationEnabled, combatEnabled)
    case 'useVault':
      return parseUseVault(body)
    case 'visitMarket':
      return parseVisitMarket(body)
    case 'visitBlacksmith':
    case 'artificerWorkshop':
      return parseVisitBlacksmith(body.type, body)
    case 'takeQuest':
    case 'continueQuest':
    case 'finishQuest':
    case 'abandonQuest':
      return parseZoneQuestAction(body.type, body)
    case 'takeTrialQuest':
    case 'trainWithMentor':
      return parseGenericQuestAction(body.type, body)
    case 'scavenge':
      return parseScavenge(body)
    case 'resolveReward':
      return eventActionsEnabled
        ? parseResolveReward(body)
        : left([{ field: 'type', reason: 'unknownAction' }])
    case 'startEvent': {
      if (!eventActionsEnabled)
        return left([{ field: 'type', reason: 'unknownAction' }])
      const issues = extraKeys(body, ['type'])
      return issues.length ? left(issues) : right({ type: 'startEvent' })
    }
    case 'revealEvent':
    case 'resolveEvent':
    case 'giveUpEvent':
    case 'escapeEvent':
    case 'payEventRequirement':
      return eventActionsEnabled
        ? parseEncounterAction(body.type, body)
        : left([{ field: 'type', reason: 'unknownAction' }])
    default:
      return left([{ field: 'type', reason: 'unknownAction' }])
  }
}

function parseTriggeredEffectAction(
  body: Record<string, unknown>
): Either<TActionIssue[], TResolveTriggeredEffectAction> {
  const { choiceId, effectId, decision } = body
  const issues: TActionIssue[] = []
  for (const field of ['choiceId', 'effectId', 'decision']) {
    if (typeof body[field] !== 'string')
      issues.push({
        field,
        reason: body[field] === undefined ? 'required' : 'notString',
      })
  }
  const keys = ['type', 'choiceId', 'effectId', 'decision']
  const payment =
    decision === 'pay' ? readEventPayment(body.payment, issues) : undefined
  if (decision === 'pay') keys.push('payment')
  issues.push(...extraKeys(body, keys))
  if (issues.length) return left(issues)
  if (decision !== 'resolve' && decision !== 'decline' && decision !== 'pay')
    return left([{ field: 'decision', reason: 'unknownOperation' }])
  if (typeof choiceId !== 'string' || typeof effectId !== 'string')
    return left(issues)
  const command = {
    type: 'resolveTriggeredEffect' as const,
    choiceId,
    effectId,
  }
  return decision === 'pay'
    ? right({ ...command, decision, ...(payment && { payment }) })
    : right({ ...command, decision })
}

function parseCombatDecisionAction(
  type: TCombatDecisionAction['type'],
  body: Record<string, unknown>
): Either<TActionIssue[], TCombatDecisionAction> {
  const field = {
    confirmCombatRoster: 'inviteeMemberIds',
    respondCombatInvite: 'accept',
    confirmCombatOrder: 'memberIds',
  }[type]
  const issues: TActionIssue[] = []
  for (const key of ['combatId', 'decisionId']) {
    if (typeof body[key] !== 'string')
      issues.push({
        field: key,
        reason: body[key] === undefined ? 'required' : 'notString',
      })
  }
  const value = body[field]
  if (value === undefined) issues.push({ field, reason: 'required' })
  else if (type === 'respondCombatInvite') {
    if (typeof value !== 'boolean')
      issues.push({ field, reason: 'unknownOption' })
  } else if (!Array.isArray(value)) issues.push({ field, reason: 'notArray' })
  else
    value.forEach((id: unknown, index) => {
      if (typeof id !== 'string')
        issues.push({ field: `${field}.${index}`, reason: 'notString' })
    })
  issues.push(...extraKeys(body, ['type', 'combatId', 'decisionId', field]))
  if (issues.length) return left(issues)
  const ids = {
    combatId: body.combatId as string,
    decisionId: body.decisionId as string,
  }
  switch (type) {
    case 'confirmCombatRoster':
      return right({ type, ...ids, inviteeMemberIds: value as string[] })
    case 'respondCombatInvite':
      return right({ type, ...ids, accept: value as boolean })
    case 'confirmCombatOrder':
      return right({ type, ...ids, memberIds: value as string[] })
  }
}

function parseCombatAction(
  type: TCombatAction['type'],
  body: Record<string, unknown>
): Either<TActionIssue[], TCombatAction> {
  const fields =
    type === 'combatAttack'
      ? ['combatId', 'turnId', 'targetId']
      : ['combatId', 'turnId']
  const issues: TActionIssue[] = []
  for (const field of fields) {
    if (typeof body[field] !== 'string')
      issues.push({
        field,
        reason: body[field] === undefined ? 'required' : 'notString',
      })
  }
  if (type === 'useAbility') {
    const intent = readAbilityIntent(body, issues)
    const targetId = body.targetId
    if (targetId !== undefined && typeof targetId !== 'string')
      issues.push({ field: 'targetId', reason: 'notString' })
    issues.push(
      ...extraKeys(body, [
        'type',
        ...fields,
        'abilityId',
        'equipmentSlot',
        'mountAbility',
        'targetId',
        'payment',
      ])
    )
    if (!intent || issues.length) return left(issues)
    return right({
      type,
      ...intent,
      combatId: body.combatId as string,
      turnId: body.turnId as string,
      ...(typeof targetId === 'string' ? { targetId } : {}),
    })
  }
  if (type === 'activateCombatEffect') {
    const { effectId, targetId } = body
    if (typeof effectId !== 'string')
      issues.push({
        field: 'effectId',
        reason: effectId === undefined ? 'required' : 'notString',
      })
    if (targetId !== undefined && typeof targetId !== 'string')
      issues.push({ field: 'targetId', reason: 'notString' })
    const payment = readEventPayment(body.payment, issues)
    issues.push(
      ...extraKeys(body, ['type', ...fields, 'effectId', 'targetId', 'payment'])
    )
    if (issues.length || typeof effectId !== 'string') return left(issues)
    return right({
      type,
      effectId,
      combatId: body.combatId as string,
      turnId: body.turnId as string,
      ...(typeof targetId === 'string' ? { targetId } : {}),
      ...(payment ? { payment } : {}),
    })
  }
  issues.push(...extraKeys(body, ['type', ...fields]))
  if (issues.length) return left(issues)
  const ids = {
    combatId: body.combatId as string,
    turnId: body.turnId as string,
  }
  return right(
    type === 'combatAttack'
      ? { type, ...ids, targetId: body.targetId as string }
      : { type, ...ids }
  )
}

function parseResolveReward(
  body: Record<string, unknown>
): Either<TActionIssue[], TResolveRewardAction> {
  const { rewardId, choice } = body
  if (typeof rewardId !== 'string' || !rewardId.trim())
    return left([
      {
        field: 'rewardId',
        reason:
          rewardId === undefined || typeof rewardId === 'string'
            ? 'required'
            : 'notString',
      },
    ])
  if (choice !== 'keep' && choice !== 'leave')
    return left([
      {
        field: 'choice',
        reason: choice === undefined ? 'required' : 'invalidItem',
      },
    ])
  const keys = ['type', 'rewardId', 'choice']
  if (choice === 'leave') {
    const issues = extraKeys(body, keys)
    return issues.length
      ? left(issues)
      : right({ type: 'resolveReward', rewardId, choice })
  }
  if (!Array.isArray(body.discard))
    return left([
      {
        field: 'discard',
        reason: body.discard === undefined ? 'required' : 'notArray',
      },
    ])
  const discard: TRewardDiscard[] = []
  const issues: TActionIssue[] = []
  for (const [index, raw] of body.discard.entries()) {
    const item: unknown = raw
    const field = `discard.${index}`
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push({ field, reason: 'invalidItem' })
      continue
    }
    const entry = item as Record<string, unknown>
    const { cardId, copies, space } = entry
    if (
      typeof cardId !== 'string' ||
      !cardId.trim() ||
      typeof copies !== 'number' ||
      !Number.isSafeInteger(copies) ||
      copies < 1
    ) {
      issues.push({ field, reason: 'invalidItem' })
      continue
    }
    // REQ-159 (D-152): `space` opcional; ausente = o espaço principal.
    if (space !== undefined && !isReceiveSpace(space)) {
      issues.push({ field: `${field}.space`, reason: 'unknownOption' })
      continue
    }
    issues.push(
      ...extraKeys(entry, ['cardId', 'space', 'copies']).map(
        ({ field: key }) => ({
          field: `${field}.${key}`,
          reason: 'unknownKey' as const,
        })
      )
    )
    discard.push(
      space === undefined ? { cardId, copies } : { cardId, space, copies }
    )
  }
  issues.push(...extraKeys(body, [...keys, 'discard']))
  return issues.length
    ? left(issues)
    : right({ type: 'resolveReward', rewardId, choice, discard })
}

function parseEncounterAction(
  type: Exclude<TRandomEventAction['type'], 'startEvent'>,
  body: Record<string, unknown>
): Either<TActionIssue[], TRandomEventAction> {
  const { encounterId, requirementId } = body
  const issues: TActionIssue[] = []
  const isPayment = type === 'payEventRequirement'
  for (const field of isPayment
    ? ['encounterId', 'requirementId']
    : ['encounterId']) {
    if (typeof body[field] !== 'string') {
      issues.push({
        field,
        reason: body[field] === undefined ? 'required' : 'notString',
      })
    }
  }
  const payment = isPayment ? readEventPayment(body.payment, issues) : undefined
  issues.push(
    ...extraKeys(
      body,
      isPayment
        ? ['type', 'encounterId', 'requirementId', 'payment']
        : ['type', 'encounterId']
    )
  )
  if (issues.length || typeof encounterId !== 'string') return left(issues)
  if (type !== 'payEventRequirement') return right({ type, encounterId })
  if (typeof requirementId !== 'string') return left(issues)
  return right({
    type,
    encounterId,
    requirementId,
    ...(payment && { payment }),
  })
}

function readEventPayment(
  value: unknown,
  issues: TActionIssue[]
): TEventPayment | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push({ field: 'payment', reason: 'notObject' })
    return undefined
  }
  const input = value as Record<string, unknown>
  const payment: TEventPayment = {}
  for (const field of ['handCards', 'equipmentSlots', 'resources'] as const) {
    const entries = input[field]
    if (entries === undefined) continue
    if (!Array.isArray(entries)) {
      issues.push({ field: `payment.${field}`, reason: 'notArray' })
      continue
    }
    if (field === 'handCards') payment.handCards = []
    if (field === 'equipmentSlots') payment.equipmentSlots = []
    if (field === 'resources') payment.resources = []
    for (const [index, entry] of entries.entries()) {
      if (field === 'handCards' && typeof entry === 'string') {
        payment.handCards?.push(entry)
      } else if (
        field === 'equipmentSlots' &&
        typeof entry === 'string' &&
        isEquipmentSlot(entry)
      ) {
        payment.equipmentSlots?.push(entry)
      } else if (
        field === 'resources' &&
        entry &&
        typeof entry === 'object' &&
        typeof entry.cardId === 'string' &&
        isPositiveInteger(entry.copies) &&
        Object.keys(entry).every((key) => key === 'cardId' || key === 'copies')
      ) {
        payment.resources?.push({ cardId: entry.cardId, copies: entry.copies })
      } else {
        issues.push({
          field: `payment.${field}.${index}`,
          reason: 'invalidItem',
        })
      }
    }
  }
  issues.push(
    ...extraKeys(input, ['handCards', 'equipmentSlots', 'resources']).map(
      (issue) => ({
        field: `payment.${issue.field}`,
        reason: 'unknownKey' as const,
      })
    )
  )
  return payment
}

/** Problemas na ordem `cardId`, depois campos a mais (REQ-92). */
function parseScavenge(
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const { cardId } = body
  const issues: TActionIssue[] = []
  if (cardId === undefined) {
    issues.push({ field: 'cardId', reason: 'required' })
  } else if (typeof cardId !== 'string') {
    issues.push({ field: 'cardId', reason: 'notString' })
  }
  issues.push(...extraKeys(body, ['type', 'cardId']))
  if (issues.length > 0 || typeof cardId !== 'string') return left(issues)
  return right({ type: 'scavenge', cardId })
}

function parseGenericQuestAction(
  type: 'takeTrialQuest' | 'trainWithMentor',
  body: Record<string, unknown>
): Either<TActionIssue[], TQuestAction> {
  const fields =
    type === 'takeTrialQuest'
      ? (['classId', 'specializationId'] as const)
      : (['classId'] as const)
  const issues: TActionIssue[] = []
  for (const field of fields) {
    if (body[field] === undefined) issues.push({ field, reason: 'required' })
    else if (typeof body[field] !== 'string')
      issues.push({ field, reason: 'notString' })
  }
  issues.push(...extraKeys(body, ['type', ...fields]))
  const { classId, specializationId } = body
  if (issues.length || typeof classId !== 'string') return left(issues)
  if (type === 'trainWithMentor') return right({ type, classId })
  if (typeof specializationId !== 'string') return left(issues)
  return right({ type, classId, specializationId })
}

function parseZoneQuestAction(
  type: TZoneQuestAction['type'],
  body: Record<string, unknown>
): Either<TActionIssue[], TZoneQuestAction> {
  const field = type === 'takeQuest' ? 'questCardId' : 'questId'
  const target = body[field]
  const issues: TActionIssue[] = []
  if (target === undefined) issues.push({ field, reason: 'required' })
  else if (typeof target !== 'string')
    issues.push({ field, reason: 'notString' })
  issues.push(...extraKeys(body, ['type', field]))
  if (issues.length || typeof target !== 'string') return left(issues)
  return right(
    type === 'takeQuest'
      ? { type, questCardId: target }
      : { type, questId: target }
  )
}

function isRecoverOption(value: string): value is TRecoverOption {
  return (RECOVER_OPTIONS as readonly string[]).includes(value)
}

/** Problemas na ordem `option`, depois campos a mais (REQ-64). */
function parseRecover(
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const { option } = body
  const issues: TActionIssue[] = []
  let valid: TRecoverOption | null = null
  if (option === undefined) {
    issues.push({ field: 'option', reason: 'required' })
  } else if (typeof option !== 'string') {
    issues.push({ field: 'option', reason: 'notString' })
  } else if (!isRecoverOption(option)) {
    issues.push({ field: 'option', reason: 'unknownOption' })
  } else {
    valid = option
  }
  issues.push(...extraKeys(body, ['type', 'option']))
  if (issues.length > 0 || valid === null) return left(issues)
  return right({ type: 'recover', option: valid })
}

/**
 * Lê uma lista `{ cardId, copies }` (build, `cards` do saveDeck). Problemas na
 * ordem de índice; por item: `cardId`, `copies`, campos a mais do item
 * (REQ-66 item 1).
 */
function parseCardCopies(
  list: unknown,
  field: string,
  issues: TActionIssue[]
): { cardId: string; copies: number }[] {
  const items: { cardId: string; copies: number }[] = []
  if (list === undefined) {
    issues.push({ field, reason: 'required' })
  } else if (!Array.isArray(list)) {
    issues.push({ field, reason: 'notArray' })
  } else {
    const seen = new Set<string>()
    list.forEach((item: unknown, index) => {
      const path = `${field}.${index}`
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        issues.push({ field: path, reason: 'invalidItem' })
        return
      }
      const entry = item as Record<string, unknown>
      const { cardId, copies } = entry
      if (cardId === undefined) {
        issues.push({ field: `${path}.cardId`, reason: 'required' })
      } else if (typeof cardId !== 'string') {
        issues.push({ field: `${path}.cardId`, reason: 'notString' })
      } else if (seen.has(cardId)) {
        issues.push({ field: `${path}.cardId`, reason: 'duplicateCard' })
      } else {
        seen.add(cardId)
      }
      if (copies === undefined) {
        issues.push({ field: `${path}.copies`, reason: 'required' })
      } else if (!isPositiveInteger(copies)) {
        issues.push({
          field: `${path}.copies`,
          reason: 'notPositiveInteger',
        })
      }
      issues.push(...extraKeys(entry, ['cardId', 'copies'], `${path}.`))
      if (typeof cardId === 'string' && typeof copies === 'number') {
        items.push({ cardId, copies })
      }
    })
  }
  return items
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/** Problemas da build (REQ-66 item 1), depois os campos a mais da ação. */
function parseAdjustDeck(
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const issues: TActionIssue[] = []
  const items = parseCardCopies(body.build, 'build', issues)
  issues.push(...extraKeys(body, ['type', 'build']))
  if (issues.length > 0) return left(issues)
  return right({ type: 'adjustDeck', build: items })
}

function isEquipmentSlot(value: string): value is TEquipmentSlot {
  return (EQUIPMENT_SLOTS as readonly string[]).includes(value)
}

/**
 * REQ-74 item 1: problema em `operation` vem sozinho; depois o campo da
 * operação (`cardId` ou `slot`) e os campos a mais, na ordem do pedido.
 */
function parsePrepare(
  body: Record<string, unknown>,
  effectActivationEnabled: boolean,
  combatEnabled: boolean
): Either<TActionIssue[], TPartyAction> {
  const { operation } = body
  if (operation === undefined) {
    return left([{ field: 'operation', reason: 'required' }])
  }
  if (typeof operation !== 'string') {
    return left([{ field: 'operation', reason: 'notString' }])
  }

  const issues: TActionIssue[] = []
  switch (operation) {
    case 'useAbility': {
      if (!combatEnabled)
        return left([{ field: 'operation', reason: 'unknownOperation' }])
      const intent = readAbilityIntent(body, issues)
      issues.push(
        ...extraKeys(body, [
          'type',
          'operation',
          'abilityId',
          'equipmentSlot',
          'mountAbility',
          'payment',
        ])
      )
      return intent && !issues.length
        ? right({ type: 'prepare', operation, ...intent })
        : left(issues)
    }
    case 'equip':
    case 'openBooster': {
      const { cardId } = body
      if (cardId === undefined) {
        issues.push({ field: 'cardId', reason: 'required' })
      } else if (typeof cardId !== 'string') {
        issues.push({ field: 'cardId', reason: 'notString' })
      }
      issues.push(...extraKeys(body, ['type', 'operation', 'cardId']))
      if (issues.length > 0 || typeof cardId !== 'string') return left(issues)
      return right({ type: 'prepare', operation, cardId })
    }
    case 'unequip': {
      const { slot } = body
      if (slot === undefined) {
        issues.push({ field: 'slot', reason: 'required' })
      } else if (typeof slot !== 'string') {
        issues.push({ field: 'slot', reason: 'notString' })
      } else if (!isEquipmentSlot(slot)) {
        issues.push({ field: 'slot', reason: 'unknownSlot' })
      }
      issues.push(...extraKeys(body, ['type', 'operation', 'slot']))
      if (
        issues.length > 0 ||
        typeof slot !== 'string' ||
        !isEquipmentSlot(slot)
      ) {
        return left(issues)
      }
      return right({ type: 'prepare', operation, slot })
    }
    case 'transferMount':
      return parseTransferMount(body)
    case 'activate':
      if (effectActivationEnabled) return parseActivate(body)
      return left([{ field: 'operation', reason: 'unknownOperation' }])
    default:
      return left([{ field: 'operation', reason: 'unknownOperation' }])
  }
}

function readAbilityIntent(
  body: Record<string, unknown>,
  issues: TActionIssue[]
): TAbilityIntent | null {
  const { abilityId, equipmentSlot, mountAbility } = body
  if (typeof abilityId !== 'string')
    issues.push({
      field: 'abilityId',
      reason: abilityId === undefined ? 'required' : 'notString',
    })
  // Exatamente um entre `equipmentSlot` e `mountAbility: true` (REQ-157).
  if (mountAbility !== undefined) {
    if (mountAbility !== true || equipmentSlot !== undefined)
      issues.push({ field: 'mountAbility', reason: 'invalidItem' })
  } else if (typeof equipmentSlot !== 'string') {
    issues.push({
      field: 'equipmentSlot',
      reason: equipmentSlot === undefined ? 'required' : 'notString',
    })
  } else if (!isEquipmentSlot(equipmentSlot)) {
    issues.push({ field: 'equipmentSlot', reason: 'unknownSlot' })
  }
  const payment = readEventPayment(body.payment, issues)
  if (typeof abilityId !== 'string') return null
  const extra = payment ? { payment } : {}
  if (mountAbility === true && equipmentSlot === undefined)
    return { abilityId, mountAbility: true, ...extra }
  return mountAbility === undefined &&
    typeof equipmentSlot === 'string' &&
    isEquipmentSlot(equipmentSlot)
    ? { abilityId, equipmentSlot, ...extra }
    : null
}

function parseActivate(
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const { cardId, effectIndex, payment } = body
  const issues: TActionIssue[] = []
  if (typeof cardId !== 'string') {
    issues.push({
      field: 'cardId',
      reason: cardId === undefined ? 'required' : 'notString',
    })
  }
  const validIndex =
    typeof effectIndex === 'number' &&
    Number.isInteger(effectIndex) &&
    effectIndex >= 0
  if (!validIndex) {
    issues.push({
      field: 'effectIndex',
      reason: effectIndex === undefined ? 'required' : 'notNonNegativeInteger',
    })
  }
  const handCards: string[] = []
  if (payment !== undefined) {
    if (
      typeof payment !== 'object' ||
      payment === null ||
      Array.isArray(payment)
    ) {
      issues.push({ field: 'payment', reason: 'notObject' })
    } else {
      const value = payment as Record<string, unknown>
      if (!Array.isArray(value.handCards)) {
        issues.push({
          field: 'payment.handCards',
          reason: value.handCards === undefined ? 'required' : 'notArray',
        })
      } else {
        for (const [i, id] of value.handCards.entries()) {
          if (typeof id === 'string') handCards.push(id)
          else
            issues.push({
              field: `payment.handCards.${i}`,
              reason: 'invalidItem',
            })
        }
      }
      issues.push(
        ...extraKeys(value, ['handCards']).map((issue) => ({
          field: `payment.${issue.field}`,
          reason: 'unknownKey' as const,
        }))
      )
    }
  }
  issues.push(
    ...extraKeys(body, [
      'type',
      'operation',
      'cardId',
      'effectIndex',
      'payment',
    ])
  )
  if (issues.length > 0 || typeof cardId !== 'string' || !validIndex)
    return left(issues)
  return right({
    type: 'prepare',
    operation: 'activate',
    cardId,
    effectIndex,
    ...(payment === undefined ? {} : { payment: { handCards } }),
  })
}

/** Máximo de operações por Usar cofre (REQ-88). */
const VAULT_MAX_OPERATIONS = 50

/**
 * REQ-88 item 1. Problemas de `operations` (ausente, não lista, tamanho) vêm
 * sozinhos; senão, os de cada operação em ordem de índice (problema em
 * `operation` vem sozinho no item); no fim, os campos a mais da ação.
 */
function parseUseVault(
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const { operations } = body
  const issues: TActionIssue[] = []
  const parsed: TVaultOperation[] = []

  if (operations === undefined) {
    issues.push({ field: 'operations', reason: 'required' })
  } else if (!Array.isArray(operations)) {
    issues.push({ field: 'operations', reason: 'notArray' })
  } else if (
    operations.length < 1 ||
    operations.length > VAULT_MAX_OPERATIONS
  ) {
    issues.push({ field: 'operations', reason: 'invalidLength' })
  } else {
    operations.forEach((item: unknown, index) => {
      const operation = parseVaultOperation(item, `operations.${index}`, issues)
      if (operation !== null) parsed.push(operation)
    })
  }
  issues.push(...extraKeys(body, ['type', 'operations']))
  if (issues.length > 0) return left(issues)
  return right({ type: 'useVault', operations: parsed })
}

function parseVaultOperation(
  item: unknown,
  path: string,
  issues: TActionIssue[]
): TVaultOperation | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    issues.push({ field: path, reason: 'invalidItem' })
    return null
  }
  const entry = item as Record<string, unknown>
  const { operation } = entry
  if (operation === undefined) {
    issues.push({ field: `${path}.operation`, reason: 'required' })
    return null
  }
  if (typeof operation !== 'string') {
    issues.push({ field: `${path}.operation`, reason: 'notString' })
    return null
  }

  const before = issues.length
  const text = (key: string): string | null => {
    const value = entry[key]
    if (value === undefined) {
      issues.push({ field: `${path}.${key}`, reason: 'required' })
    } else if (typeof value !== 'string') {
      issues.push({ field: `${path}.${key}`, reason: 'notString' })
    } else {
      return value
    }
    return null
  }
  const positive = (key: string): number | null => {
    const value = entry[key]
    if (value === undefined) {
      issues.push({ field: `${path}.${key}`, reason: 'required' })
    } else if (!isPositiveInteger(value)) {
      issues.push({ field: `${path}.${key}`, reason: 'notPositiveInteger' })
    } else {
      return value
    }
    return null
  }
  const deckIndex = (): number | null => {
    const value = entry.deckIndex
    if (value === undefined) {
      issues.push({ field: `${path}.deckIndex`, reason: 'required' })
    } else if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0
    ) {
      issues.push({
        field: `${path}.deckIndex`,
        reason: 'notNonNegativeInteger',
      })
    } else {
      return value
    }
    return null
  }
  const extras = (allowed: readonly string[]) =>
    issues.push(...extraKeys(entry, ['operation', ...allowed], `${path}.`))

  switch (operation) {
    case 'openBooster': {
      const cardId = text('cardId')
      extras(['cardId'])
      if (issues.length > before || cardId === null) return null
      return { operation, cardId }
    }
    case 'store':
    case 'take':
    case 'discard': {
      const cardId = text('cardId')
      const quantity = positive('quantity')
      extras(['cardId', 'quantity'])
      if (issues.length > before || cardId === null || quantity === null) {
        return null
      }
      return { operation, cardId, quantity }
    }
    case 'storeGold':
    case 'takeGold': {
      const amount = positive('amount')
      extras(['amount'])
      if (issues.length > before || amount === null) return null
      return { operation, amount }
    }
    case 'saveDeck': {
      const cards = parseCardCopies(entry.cards, `${path}.cards`, issues)
      extras(['cards'])
      if (issues.length > before) return null
      return { operation, cards }
    }
    case 'editBuild': {
      const build = parseCardCopies(entry.build, `${path}.build`, issues)
      extras(['build'])
      if (issues.length > before) return null
      return { operation, build }
    }
    case 'unpackDeck':
    case 'swapBuild': {
      const index = deckIndex()
      extras(['deckIndex'])
      if (issues.length > before || index === null) return null
      return { operation, deckIndex: index }
    }
    default:
      issues.push({ field: `${path}.operation`, reason: 'unknownOperation' })
      return null
  }
}

/**
 * REQ-140. Mesmas regras de `operations` do Usar cofre (máximo de 50). Em cada
 * operação: `operation` ausente/inválida/desconhecida vem sozinha; `source` fora
 * de inventory|tcgFolder → `unknownOption`.
 */
function parseVisitMarket(
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const { operations } = body
  const issues: TActionIssue[] = []
  const parsed: TMarketOperation[] = []

  if (operations === undefined) {
    issues.push({ field: 'operations', reason: 'required' })
  } else if (!Array.isArray(operations)) {
    issues.push({ field: 'operations', reason: 'notArray' })
  } else if (
    operations.length < 1 ||
    operations.length > VAULT_MAX_OPERATIONS
  ) {
    issues.push({ field: 'operations', reason: 'invalidLength' })
  } else {
    operations.forEach((item: unknown, index) => {
      const operation = parseMarketOperation(
        item,
        `operations.${index}`,
        issues
      )
      if (operation !== null) parsed.push(operation)
    })
  }
  issues.push(...extraKeys(body, ['type', 'operations']))
  if (issues.length > 0) return left(issues)
  return right({ type: 'visitMarket', operations: parsed })
}

function parseMarketOperation(
  item: unknown,
  path: string,
  issues: TActionIssue[]
): TMarketOperation | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    issues.push({ field: path, reason: 'invalidItem' })
    return null
  }
  const entry = item as Record<string, unknown>
  const { operation } = entry
  if (operation === undefined) {
    issues.push({ field: `${path}.operation`, reason: 'required' })
    return null
  }
  if (typeof operation !== 'string') {
    issues.push({ field: `${path}.operation`, reason: 'notString' })
    return null
  }

  const before = issues.length
  const text = (key: string): string | null => {
    const value = entry[key]
    if (value === undefined) {
      issues.push({ field: `${path}.${key}`, reason: 'required' })
    } else if (typeof value !== 'string') {
      issues.push({ field: `${path}.${key}`, reason: 'notString' })
    } else {
      return value
    }
    return null
  }
  const quantity = (): number | null => {
    const value = entry.quantity
    if (value === undefined) {
      issues.push({ field: `${path}.quantity`, reason: 'required' })
    } else if (!isPositiveInteger(value)) {
      issues.push({
        field: `${path}.quantity`,
        reason: 'notPositiveInteger',
      })
    } else {
      return value
    }
    return null
  }
  const extras = (allowed: readonly string[]) =>
    issues.push(...extraKeys(entry, ['operation', ...allowed], `${path}.`))

  switch (operation) {
    case 'buyStock':
    case 'buyBooster': {
      const cardId = text('cardId')
      const count = quantity()
      extras(['cardId', 'quantity'])
      if (issues.length > before || cardId === null || count === null) {
        return null
      }
      return { operation, cardId, quantity: count }
    }
    case 'buySingle': {
      const slotIndex = entry.slotIndex
      if (slotIndex === undefined) {
        issues.push({ field: `${path}.slotIndex`, reason: 'required' })
      } else if (
        typeof slotIndex !== 'number' ||
        !Number.isInteger(slotIndex) ||
        slotIndex < 0
      ) {
        issues.push({
          field: `${path}.slotIndex`,
          reason: 'notNonNegativeInteger',
        })
      }
      extras(['slotIndex'])
      if (issues.length > before || typeof slotIndex !== 'number') return null
      return { operation, slotIndex }
    }
    case 'sell': {
      const source = text('source')
      if (source !== null && source !== 'inventory' && source !== 'tcgFolder') {
        issues.push({ field: `${path}.source`, reason: 'unknownOption' })
      }
      const cardId = text('cardId')
      const count = quantity()
      const slotIndex = entry.inventorySlotIndex
      if (
        slotIndex !== undefined &&
        (typeof slotIndex !== 'number' ||
          !Number.isInteger(slotIndex) ||
          slotIndex < 0)
      ) {
        issues.push({
          field: `${path}.inventorySlotIndex`,
          reason: 'notNonNegativeInteger',
        })
      }
      extras(['source', 'cardId', 'quantity', 'inventorySlotIndex'])
      if (
        issues.length > before ||
        (source !== 'inventory' && source !== 'tcgFolder') ||
        cardId === null ||
        count === null
      ) {
        return null
      }
      return {
        operation,
        source,
        cardId,
        quantity: count,
        ...(typeof slotIndex === 'number' && { inventorySlotIndex: slotIndex }),
      }
    }
    case 'buyExpansion': {
      const named = text('expansion')
      const expansion = MARKET_EXPANSIONS.find((entry) => entry === named)
      if (named !== null && expansion === undefined) {
        issues.push({ field: `${path}.expansion`, reason: 'unknownOption' })
      }
      extras(['expansion'])
      if (issues.length > before || expansion === undefined) return null
      return { operation, expansion }
    }
    case 'buyMount': {
      const cardId = text('cardId')
      extras(['cardId'])
      if (issues.length > before || cardId === null) return null
      return { operation, cardId }
    }
    case 'sellMount':
      extras([])
      if (issues.length > before) return null
      return { operation }
    default:
      issues.push({ field: `${path}.operation`, reason: 'unknownOperation' })
      return null
  }
}

/**
 * REQ-149, REQ-153 (Ir ao Ferreiro e Oficina). Mesmas regras de `operations` do Ir ao Mercado (1 a 50). Em cada
 * operação: `operation` ausente/inválida/desconhecida vem sozinha; `target`
 * não objeto → `notObject`; `location` ou `slot` desconhecidos e `extra` não
 * booleano → `unknownOption`; índices → `notNonNegativeInteger` (D-138).
 */
function parseVisitBlacksmith(
  type: 'visitBlacksmith' | 'artificerWorkshop',
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const { operations } = body
  const issues: TActionIssue[] = []
  const parsed: TBlacksmithOperation[] = []

  if (operations === undefined) {
    issues.push({ field: 'operations', reason: 'required' })
  } else if (!Array.isArray(operations)) {
    issues.push({ field: 'operations', reason: 'notArray' })
  } else if (
    operations.length < 1 ||
    operations.length > VAULT_MAX_OPERATIONS
  ) {
    issues.push({ field: 'operations', reason: 'invalidLength' })
  } else {
    operations.forEach((item: unknown, index) => {
      const operation = parseBlacksmithOperation(
        item,
        `operations.${index}`,
        issues
      )
      if (operation !== null) parsed.push(operation)
    })
  }
  issues.push(...extraKeys(body, ['type', 'operations']))
  if (issues.length > 0) return left(issues)
  return right({ type, operations: parsed })
}

function parseBlacksmithOperation(
  item: unknown,
  path: string,
  issues: TActionIssue[]
): TBlacksmithOperation | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    issues.push({ field: path, reason: 'invalidItem' })
    return null
  }
  const entry = item as Record<string, unknown>
  const { operation } = entry
  if (operation === undefined) {
    issues.push({ field: `${path}.operation`, reason: 'required' })
    return null
  }
  if (typeof operation !== 'string') {
    issues.push({ field: `${path}.operation`, reason: 'notString' })
    return null
  }

  const before = issues.length
  const index = (
    source: Record<string, unknown>,
    key: string,
    prefix: string,
    required: boolean
  ): number | null => {
    const value = source[key]
    if (value === undefined) {
      if (required)
        issues.push({ field: `${prefix}${key}`, reason: 'required' })
      return null
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      issues.push({
        field: `${prefix}${key}`,
        reason: 'notNonNegativeInteger',
      })
      return null
    }
    return value
  }
  const target = (): TEquipmentTarget | null => {
    const value = entry.target
    const at = `${path}.target`
    if (value === undefined) {
      issues.push({ field: at, reason: 'required' })
      return null
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      issues.push({ field: at, reason: 'notObject' })
      return null
    }
    const raw = value as Record<string, unknown>
    const { location } = raw
    if (location === undefined) {
      issues.push({ field: `${at}.location`, reason: 'required' })
      return null
    }
    if (typeof location !== 'string') {
      issues.push({ field: `${at}.location`, reason: 'notString' })
      return null
    }
    switch (location) {
      case 'equipment': {
        const { slot } = raw
        let parsedSlot: TEquipmentSlot | undefined
        if (slot === undefined) {
          issues.push({ field: `${at}.slot`, reason: 'required' })
        } else if (typeof slot !== 'string') {
          issues.push({ field: `${at}.slot`, reason: 'notString' })
        } else {
          parsedSlot = EQUIPMENT_SLOTS.find((name) => name === slot)
          if (parsedSlot === undefined)
            issues.push({ field: `${at}.slot`, reason: 'unknownOption' })
        }
        issues.push(...extraKeys(raw, ['location', 'slot'], `${at}.`))
        return parsedSlot === undefined ? null : { location, slot: parsedSlot }
      }
      case 'inventory': {
        const slotIndex = index(raw, 'inventorySlotIndex', `${at}.`, true)
        issues.push(
          ...extraKeys(raw, ['location', 'inventorySlotIndex'], `${at}.`)
        )
        return slotIndex === null
          ? null
          : { location, inventorySlotIndex: slotIndex }
      }
      default:
        issues.push({ field: `${at}.location`, reason: 'unknownOption' })
        return null
    }
  }
  const extras = (allowed: readonly string[]) =>
    issues.push(...extraKeys(entry, ['operation', ...allowed], `${path}.`))

  switch (operation) {
    case 'repair':
    case 'refine': {
      const parsedTarget = target()
      extras(['target'])
      if (issues.length > before || parsedTarget === null) return null
      return { operation, target: parsedTarget }
    }
    case 'enchant': {
      const parsedTarget = target()
      const { enchantmentId, extra } = entry
      if (enchantmentId === undefined) {
        issues.push({ field: `${path}.enchantmentId`, reason: 'required' })
      } else if (typeof enchantmentId !== 'string') {
        issues.push({ field: `${path}.enchantmentId`, reason: 'notString' })
      }
      const replaceIndex = index(entry, 'replaceIndex', `${path}.`, false)
      if (extra !== undefined && typeof extra !== 'boolean') {
        issues.push({ field: `${path}.extra`, reason: 'unknownOption' })
      }
      extras(['target', 'enchantmentId', 'replaceIndex', 'extra'])
      if (
        issues.length > before ||
        parsedTarget === null ||
        typeof enchantmentId !== 'string'
      )
        return null
      return {
        operation,
        target: parsedTarget,
        enchantmentId,
        ...(replaceIndex !== null && { replaceIndex }),
        ...(typeof extra === 'boolean' && { extra }),
      }
    }
    case 'craft': {
      const slotIndex = index(entry, 'inventorySlotIndex', `${path}.`, true)
      extras(['inventorySlotIndex'])
      if (issues.length > before || slotIndex === null) return null
      return { operation, inventorySlotIndex: slotIndex }
    }
    default:
      issues.push({ field: `${path}.operation`, reason: 'unknownOperation' })
      return null
  }
}

function extraKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
  prefix = ''
): TActionIssue[] {
  return Object.keys(body)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ field: `${prefix}${key}`, reason: 'unknownKey' }))
}

function parseEndTurn(
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const issues: TActionIssue[] = Object.keys(body)
    .filter((key) => key !== 'type')
    .map((key) => ({ field: key, reason: 'unknownKey' }))
  if (issues.length > 0) return left(issues)
  return right({ type: 'endTurn' })
}

function parseMove(
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const issues: TActionIssue[] = []
  const { zoneId, viaZoneId } = body
  if (zoneId === undefined) {
    issues.push({ field: 'zoneId', reason: 'required' })
  } else if (typeof zoneId !== 'string') {
    issues.push({ field: 'zoneId', reason: 'notString' })
  }
  if (viaZoneId !== undefined && typeof viaZoneId !== 'string') {
    issues.push({ field: 'viaZoneId', reason: 'notString' })
  }
  for (const key of Object.keys(body)) {
    if (key !== 'type' && key !== 'zoneId' && key !== 'viaZoneId') {
      issues.push({ field: key, reason: 'unknownKey' })
    }
  }
  if (issues.length > 0 || typeof zoneId !== 'string') return left(issues)
  return right(
    typeof viaZoneId === 'string'
      ? { type: 'move', zoneId, viaZoneId }
      : { type: 'move', zoneId }
  )
}

const RECEIVE_SPACES: readonly TReceiveSpace[] = [
  'inventory',
  'tcgFolder',
  'mountInventory',
  'mountTcgFolder',
]

const isReceiveSpace = (value: unknown): value is TReceiveSpace =>
  RECEIVE_SPACES.includes(value as TReceiveSpace)

/**
 * Lê o `transferMount` (CONTRATO FEAT-18; REQ-160). Problemas na ordem
 * `direction`, `space`, `cardId`, `quantity`, `inventorySlotIndex` e os campos a
 * mais.
 */
function parseTransferMount(
  body: Record<string, unknown>
): Either<TActionIssue[], TPartyAction> {
  const { direction, space, cardId, quantity, inventorySlotIndex } = body
  const issues: TActionIssue[] = []
  const option = (
    field: string,
    value: unknown,
    allowed: readonly string[]
  ) => {
    if (value === undefined) issues.push({ field, reason: 'required' })
    else if (typeof value !== 'string')
      issues.push({ field, reason: 'notString' })
    else if (!allowed.includes(value))
      issues.push({ field, reason: 'unknownOption' })
  }
  option('direction', direction, ['toMount', 'fromMount'])
  option('space', space, ['inventory', 'tcgFolder'])
  if (cardId === undefined) issues.push({ field: 'cardId', reason: 'required' })
  else if (typeof cardId !== 'string')
    issues.push({ field: 'cardId', reason: 'notString' })
  const positive = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1
  if (quantity === undefined)
    issues.push({ field: 'quantity', reason: 'required' })
  else if (!positive(quantity))
    issues.push({ field: 'quantity', reason: 'notPositiveInteger' })
  if (
    inventorySlotIndex !== undefined &&
    (typeof inventorySlotIndex !== 'number' ||
      !Number.isInteger(inventorySlotIndex) ||
      inventorySlotIndex < 0)
  )
    issues.push({
      field: 'inventorySlotIndex',
      reason: 'notNonNegativeInteger',
    })
  issues.push(
    ...extraKeys(body, [
      'type',
      'operation',
      'direction',
      'space',
      'cardId',
      'quantity',
      'inventorySlotIndex',
    ])
  )
  if (
    issues.length > 0 ||
    (direction !== 'toMount' && direction !== 'fromMount') ||
    (space !== 'inventory' && space !== 'tcgFolder') ||
    typeof cardId !== 'string' ||
    !positive(quantity)
  )
    return left(issues)
  return right({
    type: 'prepare',
    operation: 'transferMount',
    direction,
    space,
    cardId,
    quantity,
    ...(typeof inventorySlotIndex === 'number' && { inventorySlotIndex }),
  })
}
