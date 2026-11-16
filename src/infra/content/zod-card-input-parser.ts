import { z } from 'zod'

import { type Either, left, right } from '@/core/error/either'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import {
  isRecord,
  type TCardInput,
  type TContentIssue,
} from '@/domain/catalog/enterprise/value-objects/content'

import { cardInputSchema } from './card-schemas'

const zodLocale = z.locales.ptBR().localeError

function joinPath(segments: readonly PropertyKey[]): string {
  return segments.map(String).join('.')
}

/**
 * Formato do `CardInput` com os schemas Zod do conteúdo (D-24, D-46). Caminho
 * com pontos e índices (`enemies.0.health`); campo desconhecido vira um
 * problema no próprio campo, como na coleção (REQ-42).
 */
export class ZodCardInputParser extends CardInputParser {
  parse(raw: unknown): Either<TContentIssue[], TCardInput> {
    if (!isRecord(raw)) return left([{ path: '', reason: 'notAnObject' }])

    const parsed = cardInputSchema.safeParse(raw, { error: zodLocale })
    // O schema espelha `TCardInput` (sem `id`/`collectionId`, com `slug`).
    if (parsed.success) return right(parsed.data as TCardInput)

    const issues: TContentIssue[] = []
    for (const issue of parsed.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          issues.push({
            path: joinPath([...issue.path, key]),
            reason: 'unknownField',
          })
        }
        continue
      }
      issues.push({
        path: joinPath(issue.path),
        reason: 'invalidFormat',
        message: issue.message,
      })
    }
    return left(issues)
  }
}
