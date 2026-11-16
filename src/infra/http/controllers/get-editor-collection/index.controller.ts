import { Controller, Get, Param } from '@nestjs/common'
import { GetEditorCollectionUseCase } from '@/domain/catalog/application/use-cases/get-editor-collection'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorCollectionPresenter,
  type TEditorCollectionHttp,
} from '../../presenters/editor-collection-presenter'

@Controller('lab/content/collections/:collectionId')
export class GetEditorCollectionController {
  constructor(
    private readonly getEditorCollection: GetEditorCollectionUseCase
  ) {}

  @Get()
  async handle(
    @Param('collectionId') collectionId: string
  ): Promise<TEditorCollectionHttp> {
    const result = await this.getEditorCollection.execute({ collectionId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorCollectionPresenter.toHTTP(result.value.collection)
  }
}
