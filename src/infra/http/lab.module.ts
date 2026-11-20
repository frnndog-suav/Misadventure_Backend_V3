import { Module } from '@nestjs/common'
import { Clock } from '@/core/ports/clock'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { GrantToMemberUseCase } from '@/domain/campaign/application/use-cases/grant-to-member'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import { ResetGameConfigUseCase } from '@/domain/lab/application/use-cases/reset-game-config'
import { UpdateGameConfigUseCase } from '@/domain/lab/application/use-cases/update-game-config'
import { SystemClock } from '../clock/system-clock'
import { ContentEditorModule } from './content-editor.module'
import { GetLabConfigController } from './controllers/get-lab-config/index.controller'
import { GrantToMemberController } from './controllers/grant-to-member/index.controller'
import { ResetLabConfigController } from './controllers/reset-lab-config/index.controller'
import { UpdateLabConfigController } from './controllers/update-lab-config/index.controller'

// Rotas /lab/*; só é importado com LAB_ENABLED=true (D-14, app.module.ts).
// O editor de conteúdo (/lab/content/*) entra junto (D-51).
@Module({
  imports: [ContentEditorModule],
  controllers: [
    GetLabConfigController,
    UpdateLabConfigController,
    ResetLabConfigController,
    GrantToMemberController,
  ],
  providers: [
    // Também existe no CampaignModule, que não o exporta.
    { provide: Clock, useClass: SystemClock },
    {
      provide: GrantToMemberUseCase,
      inject: [PartiesRepository, Clock, CardCatalog],
      useFactory: (
        parties: PartiesRepository,
        clock: Clock,
        catalog: CardCatalog
      ) => new GrantToMemberUseCase(parties, clock, catalog),
    },
    {
      provide: GetGameConfigUseCase,
      inject: [GameConfigRepository],
      useFactory: (repo: GameConfigRepository) =>
        new GetGameConfigUseCase(repo),
    },
    {
      provide: UpdateGameConfigUseCase,
      inject: [GameConfigRepository, CardCatalog],
      useFactory: (repo: GameConfigRepository, catalog: CardCatalog) =>
        new UpdateGameConfigUseCase(repo, catalog),
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
