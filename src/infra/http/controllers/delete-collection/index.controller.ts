import { Controller, Delete, HttpCode, HttpStatus, Param } from '@nestjs/common'
import { DeleteCollectionUseCase } from '@/domain/catalog/application/use-cases/delete-collection'
import { DomainErrorException } from '../../errors/domain-error-exception'

@Controller('lab/content/collections/:collectionId')
export class DeleteCollectionController {
  constructor(private readonly deleteCollection: DeleteCollectionUseCase) {}

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Param('collectionId') collectionId: string): Promise<void> {
    const result = await this.deleteCollection.execute({ collectionId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
  }
}
