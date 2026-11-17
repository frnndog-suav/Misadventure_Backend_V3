import { type Either, left, right } from '@/core/error/either'
import { ClassInputParser } from '@/domain/catalog/application/repositories/class-input-parser'
import {
  isRecord,
  type TClassInput,
  type TContentIssue,
} from '@/domain/catalog/enterprise/value-objects/content'

import { classInputSchema } from './card-schemas'
import { toContentIssues, zodLocale } from './zod-card-input-parser'

/** Formato do `ClassInput` (REQ-38) com o schema Zod do `class.json`. */
export class ZodClassInputParser extends ClassInputParser {
  parse(raw: unknown): Either<TContentIssue[], TClassInput> {
    if (!isRecord(raw)) return left([{ path: '', reason: 'notAnObject' }])
    const parsed = classInputSchema.safeParse(raw, { error: zodLocale })
    if (parsed.success) return right(parsed.data)
    return left(toContentIssues(parsed.error.issues))
  }
}
