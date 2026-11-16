import type { TContentIssue } from '@/domain/catalog/enterprise/value-objects/content'
import { contentIssueMessage } from '@/infra/content/content-messages'

/** CONTRATO FEAT-31, tipo `ContentInvalidDetails`. */
export interface TContentInvalidDetailsHttp {
  fields: { path: string; message: string }[]
}

/** Problemas do domínio (`{ path, reason }`) → textos pt-BR da tabela D-49. */
export class ContentIssuesPresenter {
  static toHTTP(fields: readonly TContentIssue[]): TContentInvalidDetailsHttp {
    return {
      fields: fields.map((issue) => ({
        path: issue.path,
        message: contentIssueMessage(issue),
      })),
    }
  }
}
