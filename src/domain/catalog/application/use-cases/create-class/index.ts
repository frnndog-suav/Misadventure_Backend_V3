import { type Either, left, right } from '@/core/error/either'
import { ClassInputParser } from '@/domain/catalog/application/repositories/class-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import {
  checkClassCandidate,
  isPlayerClassTaken,
} from '@/domain/catalog/application/use-cases/_shared/class-validation'
import type { TEditorClass } from '@/domain/catalog/enterprise/value-objects/content'

export type TCreateClassUseCaseRequest = {
  collectionId: string
  body: unknown
}

export type TCreateClassUseCaseResponse = Either<
  CollectionNotFoundError | ContentInvalidError | ContentIdTakenError,
  { editorClass: TEditorClass }
>

/**
 * REQ-38. Ordem: coleção (404), formato e regras de salvar (400),
 * `playerClass` já usado em qualquer coleção (409). A classe nasce como
 * rascunho.
 */
export class CreateClassUseCase {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly classInputParser: ClassInputParser
  ) {}

  async execute({
    collectionId,
    body,
  }: TCreateClassUseCaseRequest): Promise<TCreateClassUseCaseResponse> {
    if (!(await this.contentStore.findCollection(collectionId))) {
      return left(new CollectionNotFoundError())
    }

    const parsed = this.classInputParser.parse(body)
    if (parsed.isLeft()) return left(new ContentInvalidError(parsed.value))

    const classDefinition = { ...parsed.value, collectionId }

    const issues = await checkClassCandidate(
      this.contentStore,
      classDefinition,
      'draft'
    )
    if (issues.length > 0) return left(new ContentInvalidError(issues))

    if (
      await isPlayerClassTaken(this.contentStore, classDefinition.playerClass)
    ) {
      return left(
        new ContentIdTakenError([{ path: 'playerClass', reason: 'idTaken' }])
      )
    }

    await this.contentStore.saveClass(classDefinition, 'draft')

    return right({ editorClass: { status: 'draft', classDefinition } })
  }
}
