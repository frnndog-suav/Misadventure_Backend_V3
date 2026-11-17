import { Controller, Get } from '@nestjs/common'
import { ListClassesUseCase } from '@/domain/catalog/application/use-cases/list-classes'
import {
  ClassPresenter,
  type TClassDefinitionHttp,
} from '../../presenters/class-presenter'

@Controller('catalog/classes')
export class ListClassesController {
  constructor(private readonly listClasses: ListClassesUseCase) {}

  @Get()
  async handle(): Promise<TClassDefinitionHttp[]> {
    const result = await this.listClasses.execute()
    return result.value.classes.map((classDefinition) =>
      ClassPresenter.toHTTP(classDefinition)
    )
  }
}
