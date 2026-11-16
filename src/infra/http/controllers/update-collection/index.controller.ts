import { Body, Controller, Param, Patch } from '@nestjs/common'
import { UpdateCollectionUseCase } from '@/domain/catalog/application/use-cases/update-collection'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorCollectionPresenter,
  type TEditorCollectionHttp,
} from '../../presenters/editor-collection-presenter'

@Controller('lab/content/collections/:collectionId')
export class UpdateCollectionController {
  constructor(private readonly updateCollection: UpdateCollectionUseCase) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-42).
  @Patch()
  async handle(
    @Param('collectionId') collectionId: string,
    @Body() body: unknown
  ): Promise<TEditorCollectionHttp> {
    const result = await this.updateCollection.execute({ collectionId, body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorCollectionPresenter.toHTTP(result.value.collection)
  }
}
