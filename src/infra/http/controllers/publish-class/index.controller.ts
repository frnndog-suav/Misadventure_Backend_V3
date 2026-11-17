import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { PublishClassUseCase } from '@/domain/catalog/application/use-cases/publish-class'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorClassPresenter,
  type TEditorClassHttp,
} from '../../presenters/editor-class-presenter'

@Controller('lab/content/classes/:playerClass/publish')
export class PublishClassController {
  constructor(private readonly publishClass: PublishClassUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('playerClass') playerClass: string
  ): Promise<TEditorClassHttp> {
    const result = await this.publishClass.execute({ playerClass })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorClassPresenter.toHTTP(result.value.editorClass)
  }
}
