import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import {
  CARD_TYPES,
  type TCard,
  type TCardType,
  type TClassDefinition,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TContentCollection,
  TContentStatus,
  TEditorCard,
  TEditorClass,
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
  readonly classes: readonly TEditorClass[]
}

const COLLECTION_FILE = 'collection.json'
const CLASS_FILE = 'class.json'

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
    this.state = {
      collections: content.collections,
      cards: content.cards,
      classes: content.classes,
    }
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

  async listClasses(): Promise<TClassDefinition[]> {
    return this.state.classes
      .filter((e) => e.status === 'published')
      .map((e) => e.classDefinition)
  }

  async findClass(playerClass: string): Promise<TClassDefinition | null> {
    const entry = this.state.classes.find(
      (e) => e.classDefinition.playerClass === playerClass
    )
    return entry?.status === 'published' ? entry.classDefinition : null
  }

  async listEditorClasses(): Promise<TEditorClass[]> {
    return [...this.state.classes]
  }

  async findEditorClass(playerClass: string): Promise<TEditorClass | null> {
    return (
      this.state.classes.find(
        (e) => e.classDefinition.playerClass === playerClass
      ) ?? null
    )
  }

  // Gravação

  createCollection(collection: TContentCollection): Promise<void> {
    return this.mutate(async (state) => {
      await this.writeCollectionDir(collection, [], [], false)
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
        classes: withoutClassesOf(state.classes, id),
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

  saveClass(
    definition: TClassDefinition,
    status: TContentStatus,
    replacedPlayerClass?: string
  ): Promise<void> {
    return this.mutate(async (state) => {
      const oldKey = replacedPlayerClass ?? definition.playerClass
      const old = state.classes.find(
        (e) => e.classDefinition.playerClass === oldKey
      )
      const next: TState = {
        ...state,
        classes: [
          ...state.classes.filter(
            (e) => e.classDefinition.playerClass !== oldKey
          ),
          { status, classDefinition: definition },
        ],
      }
      await this.writeClassFile(next, definition.collectionId)
      if (old && old.classDefinition.collectionId !== definition.collectionId) {
        await this.writeClassFile(next, old.classDefinition.collectionId)
      }
      return next
    })
  }

  deleteClass(playerClass: string): Promise<void> {
    return this.mutate(async (state) => {
      const old = state.classes.find(
        (e) => e.classDefinition.playerClass === playerClass
      )
      if (!old) return state
      const next: TState = {
        ...state,
        classes: state.classes.filter(
          (e) => e.classDefinition.playerClass !== playerClass
        ),
      }
      await this.writeClassFile(next, old.classDefinition.collectionId)
      return next
    })
  }

  importCollection(
    file: {
      collection: TContentCollection
      cards: readonly TEditorCard[]
      classes: readonly TEditorClass[]
    },
    replace: boolean
  ): Promise<void> {
    return this.mutate(async (state) => {
      const { collection, cards, classes } = file
      const exists = state.collections.some((c) => c.id === collection.id)
      await this.writeCollectionDir(
        collection,
        cards,
        classes,
        replace && exists
      )
      return {
        collections: [
          ...state.collections.filter((c) => c.id !== collection.id),
          collection,
        ],
        cards: [
          ...state.cards.filter((e) => e.card.collectionId !== collection.id),
          ...cards,
        ],
        classes: [
          ...withoutClassesOf(state.classes, collection.id),
          ...classes,
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

  /** Reescreve o `class.json` da coleção; vazio = arquivo apagado (D-47). */
  private async writeClassFile(
    state: TState,
    collectionId: string
  ): Promise<void> {
    const dir = this.dirOf(collectionId)
    const entries = classesOf(state.classes, collectionId)
    if (entries.length === 0) {
      await this.fs.rm(join(dir, CLASS_FILE))
      return
    }
    await this.writeAtomic(dir, CLASS_FILE, entries.map(fileClass))
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
    classes: readonly TEditorClass[],
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
      const classEntries = classesOf(classes, collection.id)
      if (classEntries.length > 0) {
        await this.writeAtomic(tmp, CLASS_FILE, classEntries.map(fileClass))
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

function withoutClassesOf(
  classes: readonly TEditorClass[],
  collectionId: string
): TEditorClass[] {
  return classes.filter((e) => e.classDefinition.collectionId !== collectionId)
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

function classesOf(
  classes: readonly TEditorClass[],
  collectionId: string
): TEditorClass[] {
  return classes
    .filter((e) => e.classDefinition.collectionId === collectionId)
    .sort((a, b) =>
      a.classDefinition.playerClass < b.classDefinition.playerClass
        ? -1
        : a.classDefinition.playerClass > b.classDefinition.playerClass
          ? 1
          : 0
    )
}

/** Classe no `class.json` (D-40, D-57): sem `collectionId`, `status` só no rascunho. */
function fileClass({ status, classDefinition }: TEditorClass): object {
  const { collectionId, ...fields } = classDefinition
  void collectionId
  return status === 'draft' ? { ...fields, status } : fields
}
