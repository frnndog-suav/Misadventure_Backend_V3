import { type Either, right } from '@/core/error/either'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type { TClassDefinition } from '@/domain/catalog/enterprise/value-objects/card'

export type TListClassesUseCaseResponse = Either<
  never,
  { classes: TClassDefinition[] }
>

/** REQ-27: em ordem de `playerClass` (comparação por código de caractere). */
export class ListClassesUseCase {
  constructor(private readonly cardCatalog: CardCatalog) {}

  async execute(): Promise<TListClassesUseCaseResponse> {
    const classes = await this.cardCatalog.listClasses()

    return right({
      classes: [...classes].sort((a, b) =>
        a.playerClass < b.playerClass
          ? -1
          : a.playerClass > b.playerClass
            ? 1
            : 0
      ),
    })
  }
}
