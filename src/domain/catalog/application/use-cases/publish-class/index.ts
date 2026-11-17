import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { ClassNotFoundError } from '@/domain/catalog/application/use-cases/_errors/class-not-found-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { checkClassCandidate } from '@/domain/catalog/application/use-cases/_shared/class-validation'
import type { TEditorClass } from '@/domain/catalog/enterprise/value-objects/content'

export type TPublishClassUseCaseRequest = { playerClass: string }

export type TPublishClassUseCaseResponse = Either<
  ClassNotFoundError | ContentInvalidError,
  { editorClass: TEditorClass }
>

/**
 * REQ-38: revalida com as regras de publicação (deck todo publicado, total e
 * trava pelos padrões, essenciais únicos entre as publicadas) e publica; já
 * publicada = sem mudança.
 */
export class PublishClassUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    playerClass,
  }: TPublishClassUseCaseRequest): Promise<TPublishClassUseCaseResponse> {
    const current = await this.contentStore.findEditorClass(playerClass)
    if (!current) return left(new ClassNotFoundError())
    if (current.status === 'published') return right({ editorClass: current })

    const { classDefinition } = current
    const issues = await checkClassCandidate(
      this.contentStore,
      classDefinition,
      'published',
      playerClass
    )
    if (issues.length > 0) return left(new ContentInvalidError(issues))

    await this.contentStore.saveClass(classDefinition, 'published')

    return right({ editorClass: { status: 'published', classDefinition } })
  }
}
