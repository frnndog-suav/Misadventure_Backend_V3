import { type Either, left, right } from '@/core/error/either'
import { ClassInputParser } from '@/domain/catalog/application/repositories/class-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { ClassNotFoundError } from '@/domain/catalog/application/use-cases/_errors/class-not-found-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentLockedError } from '@/domain/catalog/application/use-cases/_errors/content-locked-error'
import {
  checkClassCandidate,
  isPlayerClassTaken,
} from '@/domain/catalog/application/use-cases/_shared/class-validation'
import type { TEditorClass } from '@/domain/catalog/enterprise/value-objects/content'

export type TReplaceClassUseCaseRequest = {
  playerClass: string
  body: unknown
}

export type TReplaceClassUseCaseResponse = Either<
  | ClassNotFoundError
  | ContentInvalidError
  | ContentLockedError
  | ContentIdTakenError,
  { editorClass: TEditorClass }
>

/**
 * REQ-38. Ordem: classe (404), formato e regras (400), `playerClass` novo de
 * classe publicada (409 `CONTENT_LOCKED`), `playerClass` novo já usado (409).
 * Mantém o status e a coleção; rascunho com outro `playerClass` é renomeado.
 * Classe já publicada confere também as regras de publicação (D-60), para
 * não deixar uma publicada inválida no catálogo.
 */
export class ReplaceClassUseCase {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly classInputParser: ClassInputParser
  ) {}

  async execute({
    playerClass,
    body,
  }: TReplaceClassUseCaseRequest): Promise<TReplaceClassUseCaseResponse> {
    const current = await this.contentStore.findEditorClass(playerClass)
    if (!current) return left(new ClassNotFoundError())

    const parsed = this.classInputParser.parse(body)
    if (parsed.isLeft()) return left(new ContentInvalidError(parsed.value))

    const classDefinition = {
      ...parsed.value,
      collectionId: current.classDefinition.collectionId,
    }

    const issues = await checkClassCandidate(
      this.contentStore,
      classDefinition,
      current.status,
      playerClass
    )
    if (issues.length > 0) return left(new ContentInvalidError(issues))

    const renamed = classDefinition.playerClass !== playerClass
    if (renamed) {
      if (current.status === 'published') return left(new ContentLockedError())
      if (
        await isPlayerClassTaken(this.contentStore, classDefinition.playerClass)
      ) {
        return left(
          new ContentIdTakenError([{ path: 'playerClass', reason: 'idTaken' }])
        )
      }
    }

    await this.contentStore.saveClass(
      classDefinition,
      current.status,
      renamed ? playerClass : undefined
    )

    return right({ editorClass: { status: current.status, classDefinition } })
  }
}
