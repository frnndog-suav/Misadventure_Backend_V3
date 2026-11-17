import { Module, type Provider } from '@nestjs/common'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import { ClassInputParser } from '@/domain/catalog/application/repositories/class-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CreateClassUseCase } from '@/domain/catalog/application/use-cases/create-class'
import { DeleteClassUseCase } from '@/domain/catalog/application/use-cases/delete-class'
import { GetEditorClassUseCase } from '@/domain/catalog/application/use-cases/get-editor-class'
import { ListEditorClassesUseCase } from '@/domain/catalog/application/use-cases/list-editor-classes'
import { PublishClassUseCase } from '@/domain/catalog/application/use-cases/publish-class'
import { ReplaceClassUseCase } from '@/domain/catalog/application/use-cases/replace-class'
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
import { CreateClassController } from './controllers/create-class/index.controller'
import { DeleteClassController } from './controllers/delete-class/index.controller'
import { GetEditorClassController } from './controllers/get-editor-class/index.controller'
import { ListEditorClassesController } from './controllers/list-editor-classes/index.controller'
import { PublishClassController } from './controllers/publish-class/index.controller'
import { ReplaceClassController } from './controllers/replace-class/index.controller'

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

/** Caso de uso que recebe o corpo cru de uma classe (REQ-38). */
function withStoreAndClassParser<T>(
  useCase: new (store: ContentStore, parser: ClassInputParser) => T
): Provider {
  return {
    provide: useCase,
    inject: [ContentStore, ClassInputParser],
    useFactory: (store: ContentStore, parser: ClassInputParser) =>
      new useCase(store, parser),
  }
}

/** Caso de uso que consulta o conteúdo em uso pelos saves (REQ-39). */
function withStoreAndParties<T>(
  useCase: new (store: ContentStore, parties: PartiesRepository) => T
): Provider {
  return {
    provide: useCase,
    inject: [ContentStore, PartiesRepository],
    useFactory: (store: ContentStore, parties: PartiesRepository) =>
      new useCase(store, parties),
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
    ListEditorClassesController,
    CreateClassController,
    GetEditorClassController,
    ReplaceClassController,
    PublishClassController,
    DeleteClassController,
  ],
  providers: [
    withStore(ListEditorCollectionsUseCase),
    withStore(CreateCollectionUseCase),
    withStore(GetEditorCollectionUseCase),
    withStore(UpdateCollectionUseCase),
    withStoreAndParties(DeleteCollectionUseCase),
    withStore(ValidateDimensionUseCase),
    withStore(ExportCollectionUseCase),
    {
      provide: ImportCollectionUseCase,
      inject: [
        ContentStore,
        CardInputParser,
        ClassInputParser,
        PartiesRepository,
      ],
      useFactory: (
        store: ContentStore,
        cardParser: CardInputParser,
        classParser: ClassInputParser,
        parties: PartiesRepository
      ) => new ImportCollectionUseCase(store, cardParser, classParser, parties),
    },
    withStore(ListEditorCardsUseCase),
    withStoreAndParser(CreateCardUseCase),
    withStore(GetEditorCardUseCase),
    withStoreAndParser(ReplaceCardUseCase),
    withStore(PublishCardUseCase),
    withStore(DuplicateCardUseCase),
    withStoreAndParties(DeleteCardUseCase),
    withStore(ListEditorClassesUseCase),
    withStoreAndClassParser(CreateClassUseCase),
    withStore(GetEditorClassUseCase),
    withStoreAndClassParser(ReplaceClassUseCase),
    withStore(PublishClassUseCase),
    withStoreAndParties(DeleteClassUseCase),
  ],
})
export class ContentEditorModule {}
