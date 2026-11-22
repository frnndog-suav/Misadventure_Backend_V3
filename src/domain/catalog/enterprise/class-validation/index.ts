import {
  checkCatalogIntegrity,
  type TClassEntry,
} from '@/domain/catalog/enterprise/catalog-integrity'
import { toContentPath } from '@/domain/catalog/enterprise/card-validation'
import { effectCitations } from '@/domain/catalog/enterprise/effect-rules'
import type { TClassDefinition } from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TContentIssue,
  TContentStatus,
  TEditorCard,
  TEditorClass,
} from '@/domain/catalog/enterprise/value-objects/content'

export type TValidateClassInput = Readonly<{
  candidate: TClassDefinition
  /** As regras que valem: `published` confere também deck, trava e essenciais únicos (CONTRATO FEAT-06). */
  status: TContentStatus
  /** As outras classes com que a candidata disputa nome e essenciais; a candidata vai por último. */
  others: readonly TEditorClass[]
  /** As cartas citadas no deck que existem (qualquer coleção e status). */
  cards: readonly TEditorCard[]
}>

/**
 * Problemas da classe candidata (REQ-38, D-60), só os dela. Reusa
 * `checkCatalogIntegrity` (REQ-26): rascunho confere o formato; publicada
 * (ou candidata a publicar) confere também total e trava do deck, essenciais
 * únicos entre as publicadas e as cartas do deck publicadas. O `playerClass`
 * repetido fica de fora: o caso de uso o devolve como 409.
 */
export function validateClassCandidate({
  candidate,
  status,
  others,
  cards,
}: TValidateClassInput): TContentIssue[] {
  const classes: TClassEntry[] = [
    ...others.map((entry) => ({
      ...entry.classDefinition,
      status: entry.status,
    })),
    { ...candidate, status },
  ]

  const issues: TContentIssue[] = checkCatalogIntegrity({
    collections: [],
    cards: cards.map((entry) => entry.card),
    classes,
  })
    .filter(
      (issue) =>
        issue.cardId === null &&
        issue.playerClass === candidate.playerClass &&
        issue.field !== 'playerClass'
    )
    .map((issue) => ({
      path: toContentPath(issue.field),
      reason: issue.reason,
    }))

  if (status === 'published') {
    const statusById = new Map(
      cards.map((entry) => [entry.card.id, entry.status])
    )
    candidate.starterDeck.forEach((entry, index) => {
      const cardStatus = statusById.get(entry.cardId)
      if (cardStatus !== undefined && cardStatus !== 'published') {
        issues.push({
          path: `starterDeck.${index}.cardId`,
          reason: 'starterDeckCardNotPublished',
        })
      }
    })
  }

  return issues
}

export function specializationCitationIssues(
  definition: TClassDefinition,
  status: TContentStatus,
  cards: readonly TEditorCard[]
): TContentIssue[] {
  const citations = (definition.specializations ?? []).flatMap(
    (option, index) =>
      effectCitations(option).map((citation) => ({
        ...citation,
        path: `specializations.${index}.${citation.path}`,
      }))
  )
  if (!citations.length) return []
  const available = cards.filter(
    (entry) => status === 'draft' || entry.status === 'published'
  )
  return citations.flatMap(({ type, value, path }): TContentIssue[] => {
    const found = available.some(({ card }) =>
      type === 'card'
        ? card.id === value
        : card.type === 'zone' && card.title === value
    )
    return found
      ? []
      : [
          {
            path,
            reason: type === 'card' ? 'citedCardNotFound' : 'citedZoneNotFound',
          },
        ]
  })
}

export function breaksSpecializationReferences(
  classes: readonly TEditorClass[],
  before: readonly TEditorCard[],
  after: readonly TEditorCard[]
): boolean {
  return classes.some(({ classDefinition, status }) => {
    const existing = new Set(
      specializationCitationIssues(classDefinition, status, before).map(
        ({ path }) => path
      )
    )
    return specializationCitationIssues(classDefinition, status, after).some(
      ({ path }) => !existing.has(path)
    )
  })
}
