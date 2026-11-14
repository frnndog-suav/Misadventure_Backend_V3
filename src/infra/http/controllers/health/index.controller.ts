import { Controller, Get } from '@nestjs/common'
import { CONTRACT_VERSION } from '@/infra/http/contract-version'

type THealthResponse = { status: 'ok'; contractVersion: string }

// Só infra: sem caso de uso, domínio ou banco (D-07).
@Controller('health')
export class HealthController {
  @Get()
  handle(): THealthResponse {
    return { status: 'ok', contractVersion: CONTRACT_VERSION }
  }
}
