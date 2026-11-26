import type { Party } from '@/domain/campaign/enterprise/entities/party'

/** Saves (D-27, REQ-22). Cada gravação leva o agregado inteiro, de forma atômica. */
export abstract class PartiesRepository {
  abstract create(party: Party): Promise<void>
  abstract save(party: Party): Promise<void>
  abstract findById(id: string): Promise<Party | null>
  /** Lê o estado corrente e mantém o lock do grupo até concluir a gravação. */
  abstract withLockedParty<T>(
    id: string,
    run: (
      party: Party | null,
      save: (party: Party) => Promise<void>
    ) => Promise<T>
  ): Promise<T>
  /** Sem ordem garantida: a ordem é do caso de uso (REQ-18). */
  abstract findAll(): Promise<Party[]>
  abstract delete(party: Party): Promise<void>
  /** União do conteúdo usado por todos os saves (REQ-39); o editor consulta antes de excluir. */
  abstract findContentInUse(): Promise<{
    collectionIds: ReadonlySet<string>
    cardIds: ReadonlySet<string>
    playerClasses: ReadonlySet<string>
  }>
}
