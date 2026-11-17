import { Controller, Get, Param } from '@nestjs/common'
import { ListEditorClassesUseCase } from '@/domain/catalog/application/use-cases/list-editor-classes'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorClassPresenter,
  type TEditorClassSummaryHttp,
} from '../../presenters/editor-class-presenter'

@Controller('lab/content/collections/:collectionId/classes')
export class ListEditorClassesController {
  constructor(private readonly listEditorClasses: ListEditorClassesUseCase) {}

  @Get()
  async handle(
    @Param('collectionId') collectionId: string
  ): Promise<TEditorClassSummaryHttp[]> {
    const result = await this.listEditorClasses.execute({ collectionId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return result.value.classes.map((summary) =>
      EditorClassPresenter.toSummaryHTTP(summary)
    )
  }
}
