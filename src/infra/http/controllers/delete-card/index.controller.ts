import { Controller, Delete, HttpCode, HttpStatus, Param } from '@nestjs/common'
import { DeleteCardUseCase } from '@/domain/catalog/application/use-cases/delete-card'
import { DomainErrorException } from '../../errors/domain-error-exception'

@Controller('lab/content/cards/:cardId')
export class DeleteCardController {
  constructor(private readonly deleteCard: DeleteCardUseCase) {}

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Param('cardId') cardId: string): Promise<void> {
    const result = await this.deleteCard.execute({ cardId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
  }
}
