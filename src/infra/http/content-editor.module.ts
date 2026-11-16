import { Module, type Provider } from '@nestjs/common'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CreateCardUseCase } from '@/domain/catalog/application/use-cases/create-card'
import { CreateCollectionUseCase } from '@/domain/catalog/application/use-cases/create-collection'
import { DeleteCardUseCase } from '@/domain/catalog/application/use-cases/delete-card'
import { DeleteCollectionUseCase } from '@/domain/catalog/application/use-cases/delete-collection'
import { DuplicateCardUseCase } from '@/domain/catalog/application/use-cases/duplicate-card'
import { ExportCollectionUseCase } from '@/domain/catalog/application/use-cases/export-collection'
import { GetEditorCardUseCase } from '@/domain/catalog/application/use-cases/get-editor-card'
import { GetEditorCollectionUseCase } from '@/domain/catalog/application/use-cases/get-editor-collection'
import { ImportCollectionUseCase } from '@/domain/catalog/application/use-cases/import-collection'
import { ListEditorCardsUseCase } from '@/domain/catalog/application/use-cases/list-editor-cards'
import { ListEditorCollectionsUseCase } from '@/domain/catalog/application/use-cases/list-editor-collections'
import { PublishCardUseCase } from '@/domain/catalog/application/use-cases/publish-card'
import { ReplaceCardUseCase } from '@/domain/catalog/application/use-cases/replace-card'
import { UpdateCollectionUseCase } from '@/domain/catalog/application/use-cases/update-collection'
import { ValidateDimensionUseCase } from '@/domain/catalog/application/use-cases/validate-dimension'
import { CreateCardController } from './controllers/create-card/index.controller'
import { CreateCollectionController } from './controllers/create-collection/index.controller'
import { DeleteCardController } from './controllers/delete-card/index.controller'
import { DeleteCollectionController } from './controllers/delete-collection/index.controller'
import { DuplicateCardController } from './controllers/duplicate-card/index.controller'
import { ExportCollectionController } from './controllers/export-collection/index.controller'
import { GetEditorCardController } from './controllers/get-editor-card/index.controller'
import { GetEditorCollectionController } from './controllers/get-editor-collection/index.controller'
import { ImportCollectionController } from './controllers/import-collection/index.controller'
import { ListEditorCardsController } from './controllers/list-editor-cards/index.controller'
import { ListEditorCollectionsController } from './controllers/list-editor-collections/index.controller'
import { PublishCardController } from './controllers/publish-card/index.controller'
import { ReplaceCardController } from './controllers/replace-card/index.controller'
import { UpdateCollectionController } from './controllers/update-collection/index.controller'
import { ValidateDimensionController } from './controllers/validate-dimension/index.controller'

/** Caso de uso que depende só do `ContentStore`. */
function withStore<T>(useCase: new (store: ContentStore) => T): Provider {
  return {
    provide: useCase,
    inject: [ContentStore],
    useFactory: (store: ContentStore) => new useCase(store),
  }
}

/** Caso de uso que também recebe o corpo cru de uma carta (D-46). */
function withStoreAndParser<T>(
  useCase: new (store: ContentStore, parser: CardInputParser) => T
): Provider {
  return {
    provide: useCase,
    inject: [ContentStore, CardInputParser],
    useFactory: (store: ContentStore, parser: CardInputParser) =>
      new useCase(store, parser),
  }
}

// Rotas /lab/content/* (FEAT-31); importado pelo LabModule, só com
// LAB_ENABLED=true (D-51, D-14). As portas vêm do ContentModule (global).
@Module({
  controllers: [
    ListEditorCollectionsController,
    CreateCollectionController,
    GetEditorCollectionController,
    UpdateCollectionController,
    DeleteCollectionController,
    ValidateDimensionController,
    ExportCollectionController,
    ImportCollectionController,
    ListEditorCardsController,
    CreateCardController,
    GetEditorCardController,
    ReplaceCardController,
    PublishCardController,
    DuplicateCardController,
    DeleteCardController,
  ],
  providers: [
    withStore(ListEditorCollectionsUseCase),
    withStore(CreateCollectionUseCase),
    withStore(GetEditorCollectionUseCase),
    withStore(UpdateCollectionUseCase),
    withStore(DeleteCollectionUseCase),
    withStore(ValidateDimensionUseCase),
    withStore(ExportCollectionUseCase),
    withStoreAndParser(ImportCollectionUseCase),
    withStore(ListEditorCardsUseCase),
    withStoreAndParser(CreateCardUseCase),
    withStore(GetEditorCardUseCase),
    withStoreAndParser(ReplaceCardUseCase),
    withStore(PublishCardUseCase),
    withStore(DuplicateCardUseCase),
    withStore(DeleteCardUseCase),
  ],
})
export class ContentEditorModule {}
