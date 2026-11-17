import { Controller, Get, Param } from '@nestjs/common'
import { GetEditorClassUseCase } from '@/domain/catalog/application/use-cases/get-editor-class'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorClassPresenter,
  type TEditorClassHttp,
} from '../../presenters/editor-class-presenter'

@Controller('lab/content/classes/:playerClass')
export class GetEditorClassController {
  constructor(private readonly getEditorClass: GetEditorClassUseCase) {}

  @Get()
  async handle(
    @Param('playerClass') playerClass: string
  ): Promise<TEditorClassHttp> {
    const result = await this.getEditorClass.execute({ playerClass })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorClassPresenter.toHTTP(result.value.editorClass)
  }
}
