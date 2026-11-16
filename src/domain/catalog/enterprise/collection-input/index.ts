import { type Either, left, right } from '@/core/error/either'
import {
  isRecord,
  SLUG_PATTERN,
  type TCollectionInput,
  type TCollectionPatch,
  type TContentIssue,
} from '@/domain/catalog/enterprise/value-objects/content'

const NOT_AN_OBJECT: TContentIssue = { path: '', reason: 'notAnObject' }

function checkName(value: unknown): TContentIssue | null {
  return typeof value === 'string' && value.trim() !== ''
    ? null
    : { path: 'name', reason: 'required' }
}

function checkDescription(value: unknown): TContentIssue | null {
  return typeof value === 'string'
    ? null
    : { path: 'description', reason: 'required' }
}

function unknownFields(
  body: Record<string, unknown>,
  known: readonly string[],
  immutable: readonly string[] = []
): TContentIssue[] {
  return Object.keys(body)
    .filter((key) => !known.includes(key))
    .map((key) => ({
      path: key,
      reason: immutable.includes(key) ? 'idImmutable' : 'unknownField',
    }))
}

/**
 * `CollectionInput` (REQ-42): todos os problemas juntos, na ordem `id`,
 * `name`, `description` e depois os campos desconhecidos. `name` e
 * `description` saem sem espaços nas pontas.
 */
export function parseCollectionInput(
  raw: unknown
): Either<TContentIssue[], TCollectionInput> {
  if (!isRecord(raw)) return left([NOT_AN_OBJECT])

  const issues: TContentIssue[] = []
  if (typeof raw.id !== 'string' || !SLUG_PATTERN.test(raw.id)) {
    issues.push({ path: 'id', reason: 'invalidIdFormat' })
  }
  const nameIssue = checkName(raw.name)
  if (nameIssue) issues.push(nameIssue)
  const descriptionIssue = checkDescription(raw.description)
  if (descriptionIssue) issues.push(descriptionIssue)
  issues.push(...unknownFields(raw, ['id', 'name', 'description']))

  if (issues.length > 0) return left(issues)

  return right({
    id: raw.id as string,
    name: (raw.name as string).trim(),
    description: (raw.description as string).trim(),
  })
}

/**
 * `CollectionPatch` (REQ-42): `name` e/ou `description` com as mesmas regras;
 * `id` no corpo → `idImmutable`; qualquer outro campo → `unknownField`.
 */
export function parseCollectionPatch(
  raw: unknown
): Either<TContentIssue[], TCollectionPatch> {
  if (!isRecord(raw)) return left([NOT_AN_OBJECT])

  const issues: TContentIssue[] = []
  if ('name' in raw) {
    const issue = checkName(raw.name)
    if (issue) issues.push(issue)
  }
  if ('description' in raw) {
    const issue = checkDescription(raw.description)
    if (issue) issues.push(issue)
  }
  issues.push(...unknownFields(raw, ['name', 'description'], ['id']))

  if (issues.length > 0) return left(issues)

  return right({
    ...('name' in raw ? { name: (raw.name as string).trim() } : {}),
    ...('description' in raw
      ? { description: (raw.description as string).trim() }
      : {}),
  })
}
