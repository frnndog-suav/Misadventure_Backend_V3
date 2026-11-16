import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type { DomainError } from '@/core/error/domain-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentIssuesPresenter } from '../../presenters/content-issues-presenter'
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

type TInvalidBody = {
  error: { code: string; message: string; details: { fields: unknown[] } }
}

function invalidBody(code: string, message: string): TInvalidBody {
  return {
    error: {
      code,
      message,
      details: { fields: [{ field: null, reason: 'invalidBody' }] },
    },
  }
}

/**
 * Corpo JSON malformado vira o erro de validação da área (D-17, T-13):
 * prefixo do caminho → corpo da resposta 400. O primeiro prefixo que casa
 * vale, então `/lab/content` vem antes de `/lab/` (D-51).
 */
const INVALID_BODY_BY_PATH: readonly {
  prefix: string
  body: TInvalidBody
}[] = [
  {
    prefix: '/lab/content',
    body: {
      error: {
        code: 'CONTENT_INVALID',
        message: 'Conteúdo inválido.',
        details: { fields: [{ path: '', message: 'Envie um objeto JSON.' }] },
      },
    },
  },
  {
    prefix: '/lab/',
    body: invalidBody(
      'LAB_CONFIG_INVALID',
      'Configuração do laboratório inválida.'
    ),
  },
  {
    prefix: '/parties',
    body: invalidBody('PARTY_INVALID', 'Dados do grupo inválidos.'),
  },
]

/**
 * `details` que vai na resposta: os problemas de conteúdo saem do domínio
 * como `{ path, reason }` e ganham o texto pt-BR aqui (D-49).
 */
function presentDetails(error: DomainError): unknown {
  if (
    error instanceof ContentInvalidError ||
    error instanceof ContentIdTakenError
  ) {
    return ContentIssuesPresenter.toHTTP(error.details.fields)
  }
  return error.details
}

function invalidBodyFor(url: string): TInvalidBody | null {
  const path = url.split('?')[0] ?? ''
  const match = INVALID_BODY_BY_PATH.find(({ prefix }) =>
    prefix.endsWith('/')
      ? path.startsWith(prefix)
      : path === prefix || path.startsWith(`${prefix}/`)
  )
  return match?.body ?? null
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
      const { code, message } = exception.domainError
      const details = presentDetails(exception.domainError)
      const status = DOMAIN_ERROR_STATUS[code]
      if (status !== undefined) {
        const body = details ? { code, message, details } : { code, message }
        httpAdapter.reply(response, { error: body }, status)
        return
      }
    }

    // D-17, D-51: corpo JSON malformado em /lab/* ou /parties é um pedido inválido.
    if (isBodyParseError(exception)) {
      const body = invalidBodyFor(
        String(httpAdapter.getRequestUrl(http.getRequest()))
      )
      if (body) {
        httpAdapter.reply(response, body, HttpStatus.BAD_REQUEST)
        return
      }
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
