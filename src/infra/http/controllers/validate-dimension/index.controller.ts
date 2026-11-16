import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { ValidateDimensionUseCase } from '@/domain/catalog/application/use-cases/validate-dimension'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  DimensionValidationPresenter,
  type TDimensionValidationHttp,
} from '../../presenters/dimension-validation-presenter'

@Controller('lab/content/collections/:collectionId/validate-dimension')
export class ValidateDimensionController {
  constructor(private readonly validateDimension: ValidateDimensionUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('collectionId') collectionId: string
  ): Promise<TDimensionValidationHttp> {
    const result = await this.validateDimension.execute({ collectionId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return DimensionValidationPresenter.toHTTP(result.value)
  }
}
