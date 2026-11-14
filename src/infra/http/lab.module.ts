import { Module } from '@nestjs/common'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import { ResetGameConfigUseCase } from '@/domain/lab/application/use-cases/reset-game-config'
import { UpdateGameConfigUseCase } from '@/domain/lab/application/use-cases/update-game-config'
import { GetLabConfigController } from './controllers/get-lab-config/index.controller'
import { ResetLabConfigController } from './controllers/reset-lab-config/index.controller'
import { UpdateLabConfigController } from './controllers/update-lab-config/index.controller'

// Rotas /lab/*; só é importado com LAB_ENABLED=true (D-14, app.module.ts).
@Module({
  controllers: [
    GetLabConfigController,
    UpdateLabConfigController,
    ResetLabConfigController,
  ],
  providers: [
    {
      provide: GetGameConfigUseCase,
      inject: [GameConfigRepository],
      useFactory: (repo: GameConfigRepository) =>
        new GetGameConfigUseCase(repo),
    },
    {
      provide: UpdateGameConfigUseCase,
      inject: [GameConfigRepository],
      useFactory: (repo: GameConfigRepository) =>
        new UpdateGameConfigUseCase(repo),
    },
    {
      provide: ResetGameConfigUseCase,
      inject: [GameConfigRepository],
      useFactory: (repo: GameConfigRepository) =>
        new ResetGameConfigUseCase(repo),
    },
  ],
})
export class LabModule {}
