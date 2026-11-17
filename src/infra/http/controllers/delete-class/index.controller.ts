import { Controller, Delete, HttpCode, HttpStatus, Param } from '@nestjs/common'
import { DeleteClassUseCase } from '@/domain/catalog/application/use-cases/delete-class'
import { DomainErrorException } from '../../errors/domain-error-exception'

@Controller('lab/content/classes/:playerClass')
export class DeleteClassController {
  constructor(private readonly deleteClass: DeleteClassUseCase) {}

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Param('playerClass') playerClass: string): Promise<void> {
    const result = await this.deleteClass.execute({ playerClass })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
  }
}
