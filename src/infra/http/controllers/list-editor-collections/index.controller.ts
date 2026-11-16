import { Controller, Get } from '@nestjs/common'
import { ListEditorCollectionsUseCase } from '@/domain/catalog/application/use-cases/list-editor-collections'
import {
  EditorCollectionPresenter,
  type TEditorCollectionSummaryHttp,
} from '../../presenters/editor-collection-presenter'

@Controller('lab/content/collections')
export class ListEditorCollectionsController {
  constructor(
    private readonly listEditorCollections: ListEditorCollectionsUseCase
  ) {}

  @Get()
  async handle(): Promise<TEditorCollectionSummaryHttp[]> {
    const result = await this.listEditorCollections.execute()
    return result.value.collections.map((summary) =>
      EditorCollectionPresenter.toSummaryHTTP(summary)
    )
  }
}
