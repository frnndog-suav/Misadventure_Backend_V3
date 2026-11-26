import { Module } from '@nestjs/common'
import { Clock } from '@/core/ports/clock'
import { IdGenerator } from '@/core/ports/id-generator'
import { SeedGenerator } from '@/core/ports/seed-generator'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { AbandonPartyUseCase } from '@/domain/campaign/application/use-cases/abandon-party'
import { CreatePartyUseCase } from '@/domain/campaign/application/use-cases/create-party'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { EndSessionUseCase } from '@/domain/campaign/application/use-cases/end-session'
import { GetPartyUseCase } from '@/domain/campaign/application/use-cases/get-party'
import { ResumeLegacyKnockout } from '@/domain/campaign/application/use-cases/resume-legacy-knockout'
import { ListPartiesUseCase } from '@/domain/campaign/application/use-cases/list-parties'
import { StartSessionUseCase } from '@/domain/campaign/application/use-cases/start-session'
import { TakePartyActionUseCase } from '@/domain/campaign/application/use-cases/take-party-action'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import { SystemClock } from '../clock/system-clock'
import { UuidIdGenerator } from '../ids/uuid-id-generator'
import { CryptoSeedGenerator } from '../rng/crypto-seed-generator'
import { AbandonPartyController } from './controllers/abandon-party/index.controller'
import { CreatePartyController } from './controllers/create-party/index.controller'
import { EndSessionController } from './controllers/end-session/index.controller'
import { GetPartyController } from './controllers/get-party/index.controller'
import { ListPartiesController } from './controllers/list-parties/index.controller'
import { StartSessionController } from './controllers/start-session/index.controller'
import { TakePartyActionController } from './controllers/take-party-action/index.controller'

// Rotas /parties (FEAT-05). Os adaptadores das portas do core vivem aqui
// enquanto a campanha é o único consumidor (D-34).
@Module({
  controllers: [
    CreatePartyController,
    ListPartiesController,
    GetPartyController,
    StartSessionController,
    EndSessionController,
    AbandonPartyController,
    TakePartyActionController,
  ],
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UuidIdGenerator },
    { provide: SeedGenerator, useClass: CryptoSeedGenerator },
    {
      // Também existe no LabModule, que é condicional (D-14); aqui é sempre ligado.
      provide: GetGameConfigUseCase,
      inject: [GameConfigRepository],
      useFactory: (repo: GameConfigRepository) =>
        new GetGameConfigUseCase(repo),
    },
    {
      provide: CreatePartyUseCase,
      inject: [
        PartiesRepository,
        GetGameConfigUseCase,
        CardCatalog,
        Clock,
        IdGenerator,
        SeedGenerator,
      ],
      useFactory: (
        parties: PartiesRepository,
        getGameConfig: GetGameConfigUseCase,
        catalog: CardCatalog,
        clock: Clock,
        ids: IdGenerator,
        seeds: SeedGenerator
      ) =>
        new CreatePartyUseCase(
          parties,
          getGameConfig,
          catalog,
          clock,
          ids,
          seeds
        ),
    },
    {
      provide: ListPartiesUseCase,
      inject: [PartiesRepository, CardCatalog],
      useFactory: (parties: PartiesRepository, catalog: CardCatalog) =>
        new ListPartiesUseCase(parties, catalog),
    },
    {
      provide: ResumeLegacyKnockout,
      inject: [CardCatalog, IdGenerator],
      useFactory: (catalog: CardCatalog, ids: IdGenerator) =>
        new ResumeLegacyKnockout(catalog, ids),
    },
    {
      provide: GetPartyUseCase,
      inject: [PartiesRepository, Clock, ResumeLegacyKnockout, CardCatalog],
      useFactory: (
        parties: PartiesRepository,
        clock: Clock,
        resume: ResumeLegacyKnockout,
        catalog: CardCatalog
      ) => new GetPartyUseCase(parties, clock, resume, catalog),
    },
    {
      provide: StartSessionUseCase,
      inject: [PartiesRepository, Clock, ResumeLegacyKnockout, CardCatalog],
      useFactory: (
        parties: PartiesRepository,
        clock: Clock,
        resume: ResumeLegacyKnockout,
        catalog: CardCatalog
      ) => new StartSessionUseCase(parties, clock, resume, catalog),
    },
    {
      provide: EndSessionUseCase,
      inject: [PartiesRepository, Clock],
      useFactory: (parties: PartiesRepository, clock: Clock) =>
        new EndSessionUseCase(parties, clock),
    },
    {
      provide: TakePartyActionUseCase,
      inject: [PartiesRepository, Clock, CardCatalog, IdGenerator],
      useFactory: (
        parties: PartiesRepository,
        clock: Clock,
        catalog: CardCatalog,
        ids: IdGenerator
        // A exposição HTTP depende do mapper e da projeção da T-43.
      ) => new TakePartyActionUseCase(parties, clock, catalog, ids),
    },
    {
      provide: AbandonPartyUseCase,
      inject: [PartiesRepository, Clock],
      useFactory: (parties: PartiesRepository, clock: Clock) =>
        new AbandonPartyUseCase(parties, clock),
    },
  ],
})
export class CampaignModule {}
