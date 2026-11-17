import { Body, Controller, Param, Put } from '@nestjs/common'
import { ReplaceClassUseCase } from '@/domain/catalog/application/use-cases/replace-class'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorClassPresenter,
  type TEditorClassHttp,
} from '../../presenters/editor-class-presenter'

@Controller('lab/content/classes/:playerClass')
export class ReplaceClassController {
  constructor(private readonly replaceClass: ReplaceClassUseCase) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-38).
  @Put()
  async handle(
    @Param('playerClass') playerClass: string,
    @Body() body: unknown
  ): Promise<TEditorClassHttp> {
    const result = await this.replaceClass.execute({ playerClass, body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return EditorClassPresenter.toHTTP(result.value.editorClass)
  }
}
