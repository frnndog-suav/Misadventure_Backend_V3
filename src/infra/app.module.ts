import { Module } from '@nestjs/common'
import { ConditionalModule } from '@nestjs/config'
import { ContentModule } from './content/content.module'
import { DatabaseModule } from './database/database.module'
import { EnvModule } from './env/env.module'
import { HttpModule } from './http/http.module'
import { LabModule } from './http/lab.module'

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    ContentModule,
    HttpModule,
    // D-14: desligado, as rotas /lab/* não existem (404 pelo filtro).
    ConditionalModule.registerWhen(
      LabModule,
      (env: NodeJS.ProcessEnv) => env.LAB_ENABLED === 'true'
    ),
  ],
})
export class AppModule {}
