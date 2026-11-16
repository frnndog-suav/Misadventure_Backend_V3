import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import {
  CARD_TYPES,
  type TCard,
  type TCardType,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TContentCollection,
  TContentStatus,
  TEditorCard,
} from '@/domain/catalog/enterprise/value-objects/content'

import { formatContentJson } from './format-content-json'
import type { TLoadedContent } from './load-content'

/** O que o adaptador usa do disco; trocável nos testes (falha de escrita). */
export type TContentFs = {
  mkdir(path: string): Promise<unknown>
  writeFile(path: string, data: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  rm(path: string): Promise<void>
}

export const nodeContentFs: TContentFs = {
  mkdir: (path) => mkdir(path, { recursive: true }),
  writeFile: (path, data) => writeFile(path, data, 'utf8'),
  rename: (from, to) => rename(from, to),
  rm: (path) => rm(path, { recursive: true, force: true }),
}

type TState = {
  readonly collections: readonly TContentCollection[]
  readonly cards: readonly TEditorCard[]
}

const COLLECTION_FILE = 'collection.json'

/**
 * Conteúdo em arquivo (D-47, D-48): serve o editor (`ContentStore`) e o
 * catálogo (`CardCatalog`, só publicadas, REQ-41). Depois do boot, a memória
 * é a fonte; cada mudança passa por uma fila única, grava primeiro no disco
 * e só então troca a memória (REQ-49). Uma gravação que falha rejeita a
 * promessa e deixa a memória como estava.
 */
export class FileContentStore extends ContentStore implements CardCatalog {
  private state: TState
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly root: string,
    content: TLoadedContent,
    private readonly fs: TContentFs = nodeContentFs
  ) {
    super()
    this.state = { collections: content.collections, cards: content.cards }
  }

  // Leitura (editor e catálogo)

  async listCollections(): Promise<TContentCollection[]> {
    return [...this.state.collections]
  }

  async findCollection(id: string): Promise<TContentCollection | null> {
    return this.state.collections.find((c) => c.id === id) ?? null
  }

  async listEditorCards(collectionId: string): Promise<TEditorCard[]> {
    return this.state.cards.filter((e) => e.card.collectionId === collectionId)
  }

  async findEditorCard(id: string): Promise<TEditorCard | null> {
    return this.state.cards.find((e) => e.card.id === id) ?? null
  }

  async listCards(collectionId: string): Promise<TCard[]> {
    return this.state.cards
      .filter(
        (e) => e.status === 'published' && e.card.collectionId === collectionId
      )
      .map((e) => e.card)
  }

  async findCard(id: string): Promise<TCard | null> {
    const entry = this.state.cards.find((e) => e.card.id === id)
    return entry?.status === 'published' ? entry.card : null
  }

  // Gravação

  createCollection(collection: TContentCollection): Promise<void> {
    return this.mutate(async (state) => {
      await this.writeCollectionDir(collection, [], false)
      return { ...state, collections: [...state.collections, collection] }
    })
  }

  updateCollection(collection: TContentCollection): Promise<void> {
    return this.mutate(async (state) => {
      const dir = this.dirOf(collection.id)
      await this.writeAtomic(dir, COLLECTION_FILE, collectionFile(collection))
      return {
        ...state,
        collections: state.collections.map((c) =>
          c.id === collection.id ? collection : c
        ),
      }
    })
  }

  deleteCollection(id: string): Promise<void> {
    return this.mutate(async (state) => {
      await this.fs.rm(this.dirOf(id))
      return {
        collections: state.collections.filter((c) => c.id !== id),
        cards: state.cards.filter((e) => e.card.collectionId !== id),
      }
    })
  }

  saveCard(
    card: TCard,
    status: TContentStatus,
    replacedId?: string
  ): Promise<void> {
    return this.mutate(async (state) => {
      const oldId = replacedId ?? card.id
      const old = state.cards.find((e) => e.card.id === oldId)
      const next: TState = {
        ...state,
        cards: [
          ...state.cards.filter((e) => e.card.id !== oldId),
          { status, card },
        ],
      }
      await this.writeCardFile(next, card.collectionId, card.type)
      if (
        old &&
        (old.card.collectionId !== card.collectionId ||
          old.card.type !== card.type)
      ) {
        await this.writeCardFile(next, old.card.collectionId, old.card.type)
      }
      return next
    })
  }

  deleteCard(id: string): Promise<void> {
    return this.mutate(async (state) => {
      const old = state.cards.find((e) => e.card.id === id)
      if (!old) return state
      const next: TState = {
        ...state,
        cards: state.cards.filter((e) => e.card.id !== id),
      }
      await this.writeCardFile(next, old.card.collectionId, old.card.type)
      return next
    })
  }

  importCollection(
    file: { collection: TContentCollection; cards: readonly TEditorCard[] },
    replace: boolean
  ): Promise<void> {
    return this.mutate(async (state) => {
      const { collection, cards } = file
      const exists = state.collections.some((c) => c.id === collection.id)
      await this.writeCollectionDir(collection, cards, replace && exists)
      return {
        collections: [
          ...state.collections.filter((c) => c.id !== collection.id),
          collection,
        ],
        cards: [
          ...state.cards.filter((e) => e.card.collectionId !== collection.id),
          ...cards,
        ],
      }
    })
  }

  // Apoio

  /** Fila única: uma mudança por vez; a memória só muda se o disco gravou. */
  private mutate(change: (state: TState) => Promise<TState>): Promise<void> {
    const run = this.queue.then(async () => {
      this.state = await change(this.state)
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  private dirOf(collectionId: string): string {
    return join(this.root, collectionId)
  }

  /** Reescreve o `<tipo>.json` da coleção; vazio = arquivo apagado (D-47). */
  private async writeCardFile(
    state: TState,
    collectionId: string,
    type: TCardType
  ): Promise<void> {
    const dir = this.dirOf(collectionId)
    const entries = cardsOf(state.cards, collectionId, type)
    if (entries.length === 0) {
      await this.fs.rm(join(dir, `${type}.json`))
      return
    }
    await this.writeAtomic(dir, `${type}.json`, entries.map(fileCard))
  }

  /** Escreve `<arquivo>.tmp` e renomeia (D-47); falha não deixa o `.tmp`. */
  private async writeAtomic(
    dir: string,
    name: string,
    value: unknown
  ): Promise<void> {
    const target = join(dir, name)
    const tmp = `${target}.tmp`
    try {
      await this.fs.writeFile(tmp, formatContentJson(value))
      await this.fs.rename(tmp, target)
    } catch (error) {
      await this.fs.rm(tmp).catch(() => undefined)
      throw error
    }
  }

  /**
   * Monta a pasta da coleção ao lado e só então a põe no lugar (D-47); com
   * `replace`, troca a pasta existente inteira.
   */
  private async writeCollectionDir(
    collection: TContentCollection,
    cards: readonly TEditorCard[],
    replace: boolean
  ): Promise<void> {
    const dir = this.dirOf(collection.id)
    const tmp = `${dir}.tmp-new`
    const old = `${dir}.tmp-old`
    try {
      await this.fs.rm(tmp)
      await this.fs.mkdir(tmp)
      await this.writeAtomic(tmp, COLLECTION_FILE, collectionFile(collection))
      for (const type of CARD_TYPES) {
        const entries = cardsOf(cards, collection.id, type)
        if (entries.length > 0) {
          await this.writeAtomic(tmp, `${type}.json`, entries.map(fileCard))
        }
      }
      if (replace) {
        await this.fs.rm(old)
        await this.fs.rename(dir, old)
        try {
          await this.fs.rename(tmp, dir)
        } catch (error) {
          await this.fs.rename(old, dir).catch(() => undefined)
          throw error
        }
        await this.fs.rm(old)
      } else {
        await this.fs.rename(tmp, dir)
      }
    } catch (error) {
      await this.fs.rm(tmp).catch(() => undefined)
      throw error
    }
  }
}

function cardsOf(
  cards: readonly TEditorCard[],
  collectionId: string,
  type: TCardType
): TEditorCard[] {
  return cards
    .filter((e) => e.card.collectionId === collectionId && e.card.type === type)
    .sort((a, b) =>
      a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0
    )
}

/** `collection.json`: `description` só quando não vazia (D-47). */
function collectionFile(collection: TContentCollection): object {
  return collection.description === ''
    ? { name: collection.name }
    : { name: collection.name, description: collection.description }
}

/**
 * Carta no arquivo (D-21, D-47): sem `type` e `collectionId` (vêm do
 * caminho), `id` primeiro, `status` só no rascunho (ausente = publicada).
 */
function fileCard({ status, card }: TEditorCard): object {
  const { type, collectionId, id, ...fields } = card
  void type
  void collectionId
  return status === 'draft' ? { id, ...fields, status } : { id, ...fields }
}
