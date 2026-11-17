import type { Either } from '@/core/error/either'
import type {
  TClassInput,
  TContentIssue,
} from '@/domain/catalog/enterprise/value-objects/content'

/**
 * Confere o formato do corpo de uma classe (REQ-38): objeto estrito, enums e
 * tipos, no formato do `ClassDefinition` sem `collectionId`. Implementada no
 * infra com Zod (como `CardInputParser`); `path` com pontos e índices
 * (`starterDeck.0.cardId`).
 */
export abstract class ClassInputParser {
  abstract parse(raw: unknown): Either<TContentIssue[], TClassInput>
}
