import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { GetCardUseCase } from '@/domain/catalog/application/use-cases/get-card'
import { ListClassesUseCase } from '@/domain/catalog/application/use-cases/list-classes'
import { ListCollectionCardsUseCase } from '@/domain/catalog/application/use-cases/list-collection-cards'
import { ListCollectionsUseCase } from '@/domain/catalog/application/use-cases/list-collections'
import { GetCardController } from './controllers/get-card/index.controller'
import { HealthController } from './controllers/health/index.controller'
import { ListClassesController } from './controllers/list-classes/index.controller'
import { ListCollectionCardsController } from './controllers/list-collection-cards/index.controller'
import { ListCollectionsController } from './controllers/list-collections/index.controller'
import { AllExceptionsFilter } from './errors/all-exceptions-filter'

@Module({
  controllers: [
    HealthController,
    ListCollectionsController,
    ListCollectionCardsController,
    GetCardController,
    ListClassesController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: ListCollectionsUseCase,
      inject: [CardCatalog],
      useFactory: (catalog: CardCatalog) => new ListCollectionsUseCase(catalog),
    },
    {
      provide: ListCollectionCardsUseCase,
      inject: [CardCatalog],
      useFactory: (catalog: CardCatalog) =>
        new ListCollectionCardsUseCase(catalog),
    },
    {
      provide: GetCardUseCase,
      inject: [CardCatalog],
      useFactory: (catalog: CardCatalog) => new GetCardUseCase(catalog),
    },
    {
      provide: ListClassesUseCase,
      inject: [CardCatalog],
      useFactory: (catalog: CardCatalog) => new ListClassesUseCase(catalog),
    },
  ],
})
export class HttpModule {}
