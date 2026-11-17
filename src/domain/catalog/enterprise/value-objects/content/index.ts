import type {
  TCard,
  TCardType,
  TClassDefinition,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TCatalogIssueReason } from '@/domain/catalog/enterprise/catalog-integrity'

/**
 * Tipos do editor de conteúdo (FEAT-31, D-46). Espelham o CONTRATO FEAT-31.
 */

export const CONTENT_STATUSES = ['draft', 'published'] as const
export type TContentStatus = (typeof CONTENT_STATUSES)[number]

export function isContentStatus(value: unknown): value is TContentStatus {
  return (
    typeof value === 'string' &&
    (CONTENT_STATUSES as readonly string[]).includes(value)
  )
}

/** Coleção como o editor a conhece (o catálogo só vê `id` e `name`). */
export type TContentCollection = Readonly<{
  id: string
  name: string
  description: string
}>

/** `CollectionInput` (o `id` é o slug e nunca muda, Apêndice B T1). */
export type TCollectionInput = TContentCollection

/** `CollectionPatch`: só o que muda. */
export type TCollectionPatch = Readonly<{ name?: string; description?: string }>

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

/** O `Card` sem `id` e `collectionId`, mais o `slug` (CONTRATO FEAT-31). */
export type TCardInput = DistributiveOmit<TCard, 'id' | 'collectionId'> & {
  readonly slug: string
}

export type TEditorCard = Readonly<{ status: TContentStatus; card: TCard }>

/** `EditorClass` (CONTRATO FEAT-06): classe com `status`, como as cartas. */
export type TEditorClass = Readonly<{
  status: TContentStatus
  classDefinition: TClassDefinition
}>

export type TEditorCardSummary = Readonly<{
  id: string
  type: TCardType
  name: string
  status: TContentStatus
}>

/** `CollectionExport` (`classes` só a partir da FEAT-06, D-53). */
export type TCollectionExport = Readonly<{
  formatVersion: 1
  collection: TContentCollection
  cards: readonly TEditorCard[]
  classes: readonly never[]
}>

/** Motivos de um problema de conteúdo (D-49): o infra traduz para pt-BR. */
export type TContentIssueReason =
  | TCatalogIssueReason
  | 'notAnObject'
  | 'required'
  | 'unknownField'
  | 'idImmutable'
  | 'idTaken'
  | 'unknownCardType'
  | 'unknownStatus'
  | 'repeatedParam'
  | 'unsupportedFormatVersion'
  | 'collectionMismatch'
  | 'classesNotSupported'
  | 'invalidReplace'
  | 'invalidFormat'

/**
 * Problema de conteúdo. `path` com pontos e índices (`enemies.0.health`);
 * `""` = o corpo inteiro. `message` só vem dos problemas de formato do
 * `CardInputParser` (texto do Zod em pt-BR, D-49); os demais são traduzidos
 * pela tabela do infra.
 */
export type TContentIssue = Readonly<{
  path: string
  reason: TContentIssueReason
  message?: string
}>

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Slug em `kebab-case` (D-22): sem hífen no início, no fim ou repetido. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
