import { Body, Controller, Param, Post } from '@nestjs/common'
import { CreateCardUseCase } from '@/domain/catalog/application/use-cases/create-card'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorCardPresenter,
  type TEditorCardHttp,
} from '../../presenters/editor-card-presenter'

@Controller('lab/content/collections/:collectionId/cards')
export class CreateCardController {
  constructor(private readonly createCard: CreateCardUseCase) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-43).
  @Post()
  async handle(
    @Param('collectionId') collectionId: string,
    @Body() body: unknown
  ): Promise<TEditorCardHttp> {
    const result = await this.createCard.execute({ collectionId, body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorCardPresenter.toHTTP(result.value.editorCard)
  }
}
