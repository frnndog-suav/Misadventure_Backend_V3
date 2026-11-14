import { DomainError } from '@/core/error/domain-error'

/** CONTRATO §4 `CATALOG_QUERY_INVALID`; `details` = `CatalogQueryInvalidDetails`. */
export class CatalogQueryInvalidError extends DomainError {
  readonly code = 'CATALOG_QUERY_INVALID'
  readonly message = 'Filtro do catálogo inválido.'
  override readonly details = {
    field: 'type',
    reason: 'unknownCardType',
  } as const
}
