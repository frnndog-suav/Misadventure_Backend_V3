import { Body, Controller, Param, Post } from '@nestjs/common'
import { CreateClassUseCase } from '@/domain/catalog/application/use-cases/create-class'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorClassPresenter,
  type TEditorClassHttp,
} from '../../presenters/editor-class-presenter'

@Controller('lab/content/collections/:collectionId/classes')
export class CreateClassController {
  constructor(private readonly createClass: CreateClassUseCase) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-38).
  @Post()
  async handle(
    @Param('collectionId') collectionId: string,
    @Body() body: unknown
  ): Promise<TEditorClassHttp> {
    const result = await this.createClass.execute({ collectionId, body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorClassPresenter.toHTTP(result.value.editorClass)
  }
}
