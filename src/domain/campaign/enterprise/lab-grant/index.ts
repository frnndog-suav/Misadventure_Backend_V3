import { type Either, left, right } from '@/core/error/either'

/** CONTRATO FEAT-10 `LabGrantRequest` (REQ-77; D-78), já lido. */
export type TLabGrantRequest =
  | { type: 'card'; cardId: string; quantity: number }
  | { type: 'gold'; amount: number }

/** CONTRATO FEAT-10 `LabGrantInvalidDetails`. `notGrantable` vem do caso de uso. */
export type TLabGrantIssue =
  | { field: null; reason: 'invalidBody' }
  | { field: 'type'; reason: 'required' | 'notString' | 'unknownGrantType' }
  | { field: 'cardId'; reason: 'required' | 'notString' | 'notGrantable' }
  | {
      field: 'quantity' | 'amount'
      reason: 'required' | 'notPositiveInteger'
    }
  | { field: string; reason: 'unknownKey' }

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

/**
 * Lê o corpo da doação (REQ-77). `type` ausente, inválido ou desconhecido vem
 * sozinho; depois os campos na ordem `cardId`, `quantity` (ou `amount`) e os
 * campos a mais, na ordem do pedido.
 */
export function parseLabGrant(
  input: unknown
): Either<TLabGrantIssue[], TLabGrantRequest> {
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

  const issues: TLabGrantIssue[] = []
  switch (body.type) {
    case 'card': {
      const { cardId, quantity } = body
      if (cardId === undefined) {
        issues.push({ field: 'cardId', reason: 'required' })
      } else if (typeof cardId !== 'string') {
        issues.push({ field: 'cardId', reason: 'notString' })
      }
      if (quantity === undefined) {
        issues.push({ field: 'quantity', reason: 'required' })
      } else if (!isPositiveInteger(quantity)) {
        issues.push({ field: 'quantity', reason: 'notPositiveInteger' })
      }
      issues.push(...extraKeys(body, ['type', 'cardId', 'quantity']))
      if (
        issues.length > 0 ||
        typeof cardId !== 'string' ||
        !isPositiveInteger(quantity)
      ) {
        return left(issues)
      }
      return right({ type: 'card', cardId, quantity })
    }
    case 'gold': {
      const { amount } = body
      if (amount === undefined) {
        issues.push({ field: 'amount', reason: 'required' })
      } else if (!isPositiveInteger(amount)) {
        issues.push({ field: 'amount', reason: 'notPositiveInteger' })
      }
      issues.push(...extraKeys(body, ['type', 'amount']))
      if (issues.length > 0 || !isPositiveInteger(amount)) return left(issues)
      return right({ type: 'gold', amount })
    }
    default:
      return left([{ field: 'type', reason: 'unknownGrantType' }])
  }
}

function extraKeys(
  body: Record<string, unknown>,
  allowed: readonly string[]
): TLabGrantIssue[] {
  return Object.keys(body)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ field: key, reason: 'unknownKey' }))
}
