import { type Either, left, right } from '@/core/error/either'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import {
  isRecord,
  type TCardInput,
  type TContentIssue,
} from '@/domain/catalog/enterprise/value-objects/content'

/**
 * Parser de mentira (o real é o Zod do infra, T-20): aceita qualquer objeto
 * com `slug` texto como `TCardInput`. `issues` força problemas de formato.
 */
export class FakeCardInputParser extends CardInputParser {
  public issues: TContentIssue[] | null = null

  parse(raw: unknown): Either<TContentIssue[], TCardInput> {
    if (this.issues) return left(this.issues)
    if (!isRecord(raw)) return left([{ path: '', reason: 'notAnObject' }])
    if (typeof raw.slug !== 'string') {
      return left([{ path: 'slug', reason: 'required' }])
    }
    return right(raw as unknown as TCardInput)
  }
}
