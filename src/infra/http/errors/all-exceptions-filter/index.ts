import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { DomainErrorException } from '../domain-error-exception'
import { DOMAIN_ERROR_STATUS } from '../domain-error-status'

type TErrorBody = { error: { code: string; message: string } }

const NOT_FOUND: TErrorBody = {
  error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
}

const INTERNAL_ERROR: TErrorBody = {
  error: {
    code: 'INTERNAL_ERROR',
    message: 'Erro inesperado no servidor. Tente novamente.',
  },
}

const LAB_CONFIG_INVALID_BODY = {
  error: {
    code: 'LAB_CONFIG_INVALID',
    message: 'Configuração do laboratório inválida.',
    details: { fields: [{ field: null, reason: 'invalidBody' }] },
  },
}

/**
 * JSON malformado: o Nest converte o erro do body-parser em
 * `BadRequestException` sem a causa original. Nenhum controller do projeto
 * lança 400 por conta própria (erros de regra são `DomainErrorException`).
 */
function isBodyParseError(exception: unknown): boolean {
  return (
    exception instanceof HttpException &&
    exception.getStatus() === HttpStatus.BAD_REQUEST
  )
}

// Traduz qualquer exceção para o corpo de CONTRATO §1.4 (D-08).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost
    const http = host.switchToHttp()
    const response: unknown = http.getResponse()

    if (exception instanceof DomainErrorException) {
      const { code, message, details } = exception.domainError
      const status = DOMAIN_ERROR_STATUS[code]
      if (status !== undefined) {
        const body = details ? { code, message, details } : { code, message }
        httpAdapter.reply(response, { error: body }, status)
        return
      }
    }

    // D-14: corpo JSON malformado em /lab/* é um ajuste inválido.
    if (
      isBodyParseError(exception) &&
      String(httpAdapter.getRequestUrl(http.getRequest())).startsWith('/lab/')
    ) {
      httpAdapter.reply(
        response,
        LAB_CONFIG_INVALID_BODY,
        HttpStatus.BAD_REQUEST
      )
      return
    }

    if (
      exception instanceof HttpException &&
      exception.getStatus() === HttpStatus.NOT_FOUND
    ) {
      httpAdapter.reply(response, NOT_FOUND, HttpStatus.NOT_FOUND)
      return
    }

    // Stack trace só no log do servidor, nunca no corpo.
    this.logger.error(
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : exception
    )
    httpAdapter.reply(
      response,
      INTERNAL_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR
    )
  }
}
