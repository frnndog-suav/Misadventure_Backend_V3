import type { Either } from '@/core/error/either'
import type {
  TCardInput,
  TContentIssue,
} from '@/domain/catalog/enterprise/value-objects/content'

/**
 * Confere o formato do corpo de uma carta (D-46): objeto estrito, enums e
 * tipos, no formato do `Card` sem `id`/`collectionId`, mais o `slug`.
 * Implementada no infra com os schemas Zod (D-24); o domínio não conhece o Zod.
 * Os `path` dos problemas usam pontos e índices (`enemies.0.health`).
 */
export abstract class CardInputParser {
  abstract parse(raw: unknown): Either<TContentIssue[], TCardInput>
}
