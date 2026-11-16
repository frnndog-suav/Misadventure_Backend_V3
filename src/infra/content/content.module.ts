import { Global, Module } from '@nestjs/common'

import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'

import { EnvService } from '../env/env.service'
import { FileContentStore } from './file-content-store'
import { InvalidContentError, loadContent } from './load-content'
import { ZodCardInputParser } from './zod-card-input-parser'

/**
 * Carrega `CONTENT_DIR` no boot (REQ-10, D-48). Conteúdo inválido derruba o
 * boot com o relatório de REQ-11. O mesmo `FileContentStore` serve o editor
 * (`ContentStore`) e o catálogo (`CardCatalog`, só publicadas, REQ-41).
 */
@Global()
@Module({
  providers: [
    {
      provide: FileContentStore,
      inject: [EnvService],
      useFactory: async (env: EnvService): Promise<FileContentStore> => {
        const root = env.get('CONTENT_DIR')
        const result = await loadContent(root)
        if (!result.ok) throw new InvalidContentError(result.problems)
        return new FileContentStore(root, result.content)
      },
    },
    { provide: CardCatalog, useExisting: FileContentStore },
    { provide: ContentStore, useExisting: FileContentStore },
    { provide: CardInputParser, useClass: ZodCardInputParser },
  ],
  exports: [CardCatalog, ContentStore, CardInputParser],
})
export class ContentModule {}
