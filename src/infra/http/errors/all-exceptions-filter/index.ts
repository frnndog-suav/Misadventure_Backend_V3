import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'

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

// Traduz qualquer exceção para o corpo de CONTRATO §1.4 (D-08).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost
    const response: unknown = host.switchToHttp().getResponse()

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
