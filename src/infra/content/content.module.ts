import { Global, Module } from '@nestjs/common'

import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'

import { EnvService } from '../env/env.service'
import { ContentCardCatalog } from './content-card-catalog'
import { InvalidContentError, loadContent } from './load-content'

/**
 * Carrega `CONTENT_DIR` no boot (REQ-10, D-21). Conteúdo inválido derruba o
 * boot com o relatório de REQ-11.
 */
@Global()
@Module({
  providers: [
    {
      provide: CardCatalog,
      inject: [EnvService],
      useFactory: async (env: EnvService): Promise<CardCatalog> => {
        const result = await loadContent(env.get('CONTENT_DIR'))
        if (!result.ok) throw new InvalidContentError(result.problems)
        return new ContentCardCatalog(result.content)
      },
    },
  ],
  exports: [CardCatalog],
})
export class ContentModule {}
