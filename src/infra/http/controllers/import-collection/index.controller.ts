import { Body, Controller, Post, Query } from '@nestjs/common'
import { ImportCollectionUseCase } from '@/domain/catalog/application/use-cases/import-collection'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  ImportResultPresenter,
  type TImportResultHttp,
} from '../../presenters/import-result-presenter'

@Controller('lab/content/import')
export class ImportCollectionController {
  constructor(private readonly importCollection: ImportCollectionUseCase) {}

  // Arquivo e `replace` vão crus: a validação é do domínio (REQ-48).
  @Post()
  async handle(
    @Body() body: unknown,
    @Query('replace') replace: unknown
  ): Promise<TImportResultHttp> {
    const result = await this.importCollection.execute({ body, replace })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return ImportResultPresenter.toHTTP(result.value)
  }
}
