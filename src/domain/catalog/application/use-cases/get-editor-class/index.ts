import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { ClassNotFoundError } from '@/domain/catalog/application/use-cases/_errors/class-not-found-error'
import type { TEditorClass } from '@/domain/catalog/enterprise/value-objects/content'

export type TGetEditorClassUseCaseRequest = { playerClass: string }

export type TGetEditorClassUseCaseResponse = Either<
  ClassNotFoundError,
  { editorClass: TEditorClass }
>

/** REQ-38: qualquer status. */
export class GetEditorClassUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    playerClass,
  }: TGetEditorClassUseCaseRequest): Promise<TGetEditorClassUseCaseResponse> {
    const editorClass = await this.contentStore.findEditorClass(playerClass)
    if (!editorClass) return left(new ClassNotFoundError())

    return right({ editorClass })
  }
}
