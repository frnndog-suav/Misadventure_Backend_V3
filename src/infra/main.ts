import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // Env validado por Zod (EnvModule) nasce na T-02; até lá, só a porta.
  const port = Number(process.env.PORT ?? 3333)
  await app.listen(port)
}

void bootstrap()
