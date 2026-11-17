import { type Either, left, right } from '@/core/error/either'
import { ClassInputParser } from '@/domain/catalog/application/repositories/class-input-parser'
import {
  isRecord,
  type TClassInput,
  type TContentIssue,
} from '@/domain/catalog/enterprise/value-objects/content'

/**
 * Parser de mentira (o real é o Zod do infra): aceita qualquer objeto com
 * `playerClass` texto como `TClassInput`. `issues` força problemas de formato.
 */
export class FakeClassInputParser extends ClassInputParser {
  public issues: TContentIssue[] | null = null

  parse(raw: unknown): Either<TContentIssue[], TClassInput> {
    if (this.issues) return left(this.issues)
    if (!isRecord(raw)) return left([{ path: '', reason: 'notAnObject' }])
    if (typeof raw.playerClass !== 'string') {
      return left([{ path: 'playerClass', reason: 'required' }])
    }
    return right(raw as unknown as TClassInput)
  }
}
