import { type Either, left, right } from '@/core/error/either'
import {
  EQUIPMENT_SLOTS,
  type TEquipmentSlot,
} from '@/domain/catalog/enterprise/value-objects/card'

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
  | TActivateOperation

export type TActivateOperation = {
  operation: 'activate'
  cardId: string
  effectIndex: number
  payment?: { handCards: readonly string[] }
}

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

/** Intenção de jogo (CONTRATO §1.6). União por `type`; as FEATs 10+ acrescentam variantes. */
export type TPartyAction =
  | { type: 'move'; zoneId: string }
  | { type: 'endTurn' }
  | { type: 'recover'; option: TRecoverOption }
  | { type: 'adjustDeck'; build: { cardId: string; copies: number }[] }
  | ({ type: 'prepare' } & TPrepareOperation)
  | { type: 'useVault'; operations: TVaultOperation[] }
  | { type: 'scavenge'; cardId: string }

/** Os `type` possíveis, para `availableActions` (REQ-58). */
export type TPartyActionType = TPartyAction['type']

/** Motivos de CONTRATO FEAT-07 e FEAT-09 (`ActionInvalidDetails`). `zoneNotInMap` vem de `Party.move`. */
export type TActionIssue =
  | { field: null; reason: 'invalidBody' }
  | { field: 'type'; reason: 'required' | 'notString' | 'unknownAction' }
  | { field: 'zoneId'; reason: 'required' | 'notString' | 'zoneNotInMap' }
  | { field: 'option'; reason: 'required' | 'notString' | 'unknownOption' }
  | { field: 'build'; reason: 'required' | 'notArray' }
  | {
      field: 'operation'
      reason: 'required' | 'notString' | 'unknownOperation'
    }
  | { field: 'slot'; reason: 'required' | 'notString' | 'unknownSlot' }
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
        | 'invalidLength'
    }

/**
 * Lê o corpo cru do pedido (D-62; REQ-53). Problemas na ordem `type`, `zoneId`,
 * campos a mais na ordem do pedido. `type` ausente, inválido ou desconhecido
 * encerra a leitura: sem ação conhecida não há campos a conferir.
 */
export function parsePartyAction(
  input: unknown,
  effectActivationEnabled = true
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
    case 'move':
      return parseMove(body)
    case 'endTurn':
      return parseEndTurn(body)
    case 'recover':
      return parseRecover(body)
    case 'adjustDeck':
      return parseAdjustDeck(body)
    case 'prepare':
      return parsePrepare(body, effectActivationEnabled)
    case 'useVault':
      return parseUseVault(body)
    case 'scavenge':
      return parseScavenge(body)
    default:
      return left([{ field: 'type', reason: 'unknownAction' }])
  }
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
  effectActivationEnabled: boolean
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
    case 'equip': {
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
    case 'activate':
      if (effectActivationEnabled) return parseActivate(body)
      return left([{ field: 'operation', reason: 'unknownOperation' }])
    default:
      return left([{ field: 'operation', reason: 'unknownOperation' }])
  }
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
  const { zoneId } = body
  if (zoneId === undefined) {
    issues.push({ field: 'zoneId', reason: 'required' })
  } else if (typeof zoneId !== 'string') {
    issues.push({ field: 'zoneId', reason: 'notString' })
  }
  for (const key of Object.keys(body)) {
    if (key !== 'type' && key !== 'zoneId') {
      issues.push({ field: key, reason: 'unknownKey' })
    }
  }
  if (issues.length > 0 || typeof zoneId !== 'string') return left(issues)
  return right({ type: 'move', zoneId })
}
