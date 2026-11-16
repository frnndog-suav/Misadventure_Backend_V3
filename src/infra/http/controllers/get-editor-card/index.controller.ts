import { Controller, Get, Param } from '@nestjs/common'
import { GetEditorCardUseCase } from '@/domain/catalog/application/use-cases/get-editor-card'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorCardPresenter,
  type TEditorCardHttp,
} from '../../presenters/editor-card-presenter'

@Controller('lab/content/cards/:cardId')
export class GetEditorCardController {
  constructor(private readonly getEditorCard: GetEditorCardUseCase) {}

  @Get()
  async handle(@Param('cardId') cardId: string): Promise<TEditorCardHttp> {
    const result = await this.getEditorCard.execute({ cardId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorCardPresenter.toHTTP(result.value.editorCard)
  }
}
