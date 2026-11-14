import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { EnvService } from './env/env.service'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const env = app.get(EnvService)
  app.enableShutdownHooks()
  app.enableCors({ origin: env.get('CORS_ORIGIN') })
  await app.listen(env.get('PORT'))
}

void bootstrap()
