import { Body, Controller, Param, Put } from '@nestjs/common'
import { ReplaceCardUseCase } from '@/domain/catalog/application/use-cases/replace-card'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorCardPresenter,
  type TEditorCardHttp,
} from '../../presenters/editor-card-presenter'

@Controller('lab/content/cards/:cardId')
export class ReplaceCardController {
  constructor(private readonly replaceCard: ReplaceCardUseCase) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-43, REQ-44).
  @Put()
  async handle(
    @Param('cardId') cardId: string,
    @Body() body: unknown
  ): Promise<TEditorCardHttp> {
    const result = await this.replaceCard.execute({ cardId, body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorCardPresenter.toHTTP(result.value.editorCard)
  }
}
