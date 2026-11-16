import { Controller, Get, Param } from '@nestjs/common'
import { ExportCollectionUseCase } from '@/domain/catalog/application/use-cases/export-collection'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  CollectionExportPresenter,
  type TCollectionExportHttp,
} from '../../presenters/collection-export-presenter'

@Controller('lab/content/collections/:collectionId/export')
export class ExportCollectionController {
  constructor(private readonly exportCollection: ExportCollectionUseCase) {}

  @Get()
  async handle(
    @Param('collectionId') collectionId: string
  ): Promise<TCollectionExportHttp> {
    const result = await this.exportCollection.execute({ collectionId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return CollectionExportPresenter.toHTTP(result.value.file)
  }
}
