import { type Either, left, right } from '@/core/error/either'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { ClassNotFoundError } from '@/domain/catalog/application/use-cases/_errors/class-not-found-error'
import { ContentInUseError } from '@/domain/catalog/application/use-cases/_errors/content-in-use-error'

export type TDeleteClassUseCaseRequest = { playerClass: string }

export type TDeleteClassUseCaseResponse = Either<
  ClassNotFoundError | ContentInUseError,
  null
>

/** REQ-38, REQ-39: classe (404), classe de algum jogador de um save (409 `CONTENT_IN_USE`). */
export class DeleteClassUseCase {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly partiesRepository: PartiesRepository
  ) {}

  async execute({
    playerClass,
  }: TDeleteClassUseCaseRequest): Promise<TDeleteClassUseCaseResponse> {
    if (!(await this.contentStore.findEditorClass(playerClass))) {
      return left(new ClassNotFoundError())
    }

    const inUse = await this.partiesRepository.findContentInUse()
    if (inUse.playerClasses.has(playerClass)) {
      return left(new ContentInUseError())
    }

    await this.contentStore.deleteClass(playerClass)

    return right(null)
  }
}
