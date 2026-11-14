import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { HealthController } from './controllers/health/index.controller'
import { AllExceptionsFilter } from './errors/all-exceptions-filter'

@Module({
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class HttpModule {}
