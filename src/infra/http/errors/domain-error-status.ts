import { HttpStatus } from '@nestjs/common'

/** `DomainError.code` → status HTTP (CONTRATO §4). Código novo entra aqui. */
export const DOMAIN_ERROR_STATUS: Readonly<Record<string, HttpStatus>> = {
  LAB_CONFIG_INVALID: HttpStatus.BAD_REQUEST,
  CATALOG_QUERY_INVALID: HttpStatus.BAD_REQUEST,
  COLLECTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  CARD_NOT_FOUND: HttpStatus.NOT_FOUND,
}
