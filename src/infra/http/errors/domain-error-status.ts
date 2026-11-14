import { HttpStatus } from '@nestjs/common'

/** `DomainError.code` → status HTTP (CONTRATO §4). Código novo entra aqui. */
export const DOMAIN_ERROR_STATUS: Readonly<Record<string, HttpStatus>> = {
  LAB_CONFIG_INVALID: HttpStatus.BAD_REQUEST,
}
