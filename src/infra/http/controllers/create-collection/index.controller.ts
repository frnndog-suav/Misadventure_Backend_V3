import { Body, Controller, Post } from '@nestjs/common'
import { CreateCollectionUseCase } from '@/domain/catalog/application/use-cases/create-collection'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorCollectionPresenter,
  type TEditorCollectionHttp,
} from '../../presenters/editor-collection-presenter'

@Controller('lab/content/collections')
export class CreateCollectionController {
  constructor(private readonly createCollection: CreateCollectionUseCase) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-42, como D-17).
  @Post()
  async handle(@Body() body: unknown): Promise<TEditorCollectionHttp> {
    const result = await this.createCollection.execute({ body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorCollectionPresenter.toHTTP(result.value.collection)
  }
}
