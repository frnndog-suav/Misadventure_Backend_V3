import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { PublishCardUseCase } from '@/domain/catalog/application/use-cases/publish-card'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorCardPresenter,
  type TEditorCardHttp,
} from '../../presenters/editor-card-presenter'

@Controller('lab/content/cards/:cardId/publish')
export class PublishCardController {
  constructor(private readonly publishCard: PublishCardUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(@Param('cardId') cardId: string): Promise<TEditorCardHttp> {
    const result = await this.publishCard.execute({ cardId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorCardPresenter.toHTTP(result.value.editorCard)
  }
}
