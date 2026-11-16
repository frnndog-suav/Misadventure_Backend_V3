import { Controller, Param, Post } from '@nestjs/common'
import { DuplicateCardUseCase } from '@/domain/catalog/application/use-cases/duplicate-card'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorCardPresenter,
  type TEditorCardHttp,
} from '../../presenters/editor-card-presenter'

@Controller('lab/content/cards/:cardId/duplicate')
export class DuplicateCardController {
  constructor(private readonly duplicateCard: DuplicateCardUseCase) {}

  @Post()
  async handle(@Param('cardId') cardId: string): Promise<TEditorCardHttp> {
    const result = await this.duplicateCard.execute({ cardId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorCardPresenter.toHTTP(result.value.editorCard)
  }
}
