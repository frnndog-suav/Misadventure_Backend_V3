import { Controller, Get } from '@nestjs/common'
import { ListCollectionsUseCase } from '@/domain/catalog/application/use-cases/list-collections'
import {
  CollectionPresenter,
  type TCollectionSummaryHttp,
} from '../../presenters/collection-presenter'

@Controller('catalog/collections')
export class ListCollectionsController {
  constructor(private readonly listCollections: ListCollectionsUseCase) {}

  @Get()
  async handle(): Promise<TCollectionSummaryHttp[]> {
    const result = await this.listCollections.execute()
    return result.value.collections.map((summary) =>
      CollectionPresenter.toHTTP(summary)
    )
  }
}
