import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'

import { checkCatalogIntegrity } from '@/domain/catalog/enterprise/catalog-integrity'
import { questPublicationIssues } from '@/domain/catalog/enterprise/card-validation'
import { specializationCitationIssues } from '@/domain/catalog/enterprise/class-validation'
import {
  CARD_TYPES,
  type TCard,
  type TCardType,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TContentCollection,
  TEditorCard,
  TEditorClass,
} from '@/domain/catalog/enterprise/value-objects/content'

import {
  cardFileSchemas,
  classFileSchema,
  collectionFileSchema,
} from './card-schemas'
import { catalogIssueMessage, contentIssueMessage } from './content-messages'

/**
 * Um item do relatório de REQ-11. `file` usa barras normais. `playerClass`
 * só em problema de uma classe (`class.json`, D-56).
 */
export type TContentProblem = {
  file: string
  cardId: string | null
  playerClass?: string
  field: string | null
  message: string
}

/** Conteúdo lido com `status` e `description` (D-47), rascunhos inclusive. */
export type TLoadedContent = {
  collections: TContentCollection[]
  cards: TEditorCard[]
  classes: TEditorClass[]
}

export type TLoadContentResult =
  | { ok: true; content: TLoadedContent }
  | { ok: false; problems: TContentProblem[] }

const COLLECTION_FILE = 'collection.json'
const CLASS_FILE = 'class.json'

const zodLocale = z.locales.ptBR().localeError

/**
 * Lê e valida o conteúdo (REQ-10, REQ-11, D-21). `path` pode ser a raiz
 * (pastas de coleção), a pasta de uma coleção ou um arquivo dela (nesse
 * caso, a coleção inteira é validada). Junta todos os problemas: schema de
 * cada arquivo e integridade (REQ-15) das cartas que passaram no schema,
 * rascunhos inclusive (D-48).
 */
export async function loadContent(
  inputPath: string
): Promise<TLoadContentResult> {
  // Absoluto: `basename('.')` e arquivo solto na raiz dariam id errado.
  const path = resolve(inputPath)
  const problems: TContentProblem[] = []
  const collections: TContentCollection[] = []
  const cards: TEditorCard[] = []
  const classes: TEditorClass[] = []
  /** Arquivo de cada carta lida, para localizar os problemas de integridade. */
  const cardFiles: { card: TCard; file: string }[] = []

  const info = await stat(path).catch(() => null)
  if (!info) {
    return {
      ok: false,
      problems: [problem(path, 'Caminho não encontrado.')],
    }
  }

  let collectionDirs: string[]
  if (info.isFile()) {
    collectionDirs = [dirname(path)]
  } else if (await exists(join(path, COLLECTION_FILE))) {
    collectionDirs = [path]
  } else {
    collectionDirs = []
    for (const entry of await sortedEntries(path)) {
      if (entry.isDirectory()) collectionDirs.push(join(path, entry.name))
      else {
        problems.push(
          problem(
            join(path, entry.name),
            'Arquivo desconhecido (a raiz só tem pastas de coleção).'
          )
        )
      }
    }
  }

  for (const dir of collectionDirs) {
    const collectionId = basename(dir)
    const collection = await readCollection(dir, problems)
    collections.push({
      id: collectionId,
      name: collection?.name ?? '',
      description: collection?.description ?? '',
    })

    for (const type of CARD_TYPES) {
      const file = join(dir, `${type}.json`)
      if (!(await exists(file))) continue
      for (const entry of await readCards(file, type, collectionId, problems)) {
        cards.push(entry)
        cardFiles.push({ card: entry.card, file })
      }
    }

    const classFile = join(dir, CLASS_FILE)
    if (await exists(classFile)) {
      classes.push(...(await readClasses(classFile, collectionId, problems)))
    }
  }

  for (const issue of checkCatalogIntegrity({
    collections,
    cards: cards.map(({ card }) => card),
    classes: classes.map(({ status, classDefinition }) => ({
      ...classDefinition,
      status,
    })),
  })) {
    if (issue.playerClass !== undefined) {
      problems.push({
        file: normalize(
          join(dirOf(collectionDirs, issue.collectionId), CLASS_FILE)
        ),
        cardId: null,
        playerClass: issue.playerClass,
        field: issue.field,
        message: catalogIssueMessage(issue.reason),
      })
      continue
    }
    const files =
      issue.cardId === null
        ? [join(dirOf(collectionDirs, issue.collectionId), COLLECTION_FILE)]
        : [
            ...new Set(
              cardFiles
                .filter(
                  ({ card }) =>
                    card.id === issue.cardId &&
                    card.collectionId === issue.collectionId
                )
                .map(({ file }) => file)
            ),
          ]
    problems.push({
      file: files.map(normalize).join(', '),
      cardId: issue.cardId,
      field: issue.field,
      message: catalogIssueMessage(issue.reason),
    })
  }

  for (const { card, status } of cards) {
    if (status !== 'published') continue
    for (const issue of questPublicationIssues(card, cards)) {
      problems.push({
        file: normalize(
          join(dirOf(collectionDirs, card.collectionId), `${card.type}.json`)
        ),
        cardId: card.id,
        field: issue.path,
        message: contentIssueMessage(issue),
      })
    }
  }
  for (const { classDefinition, status } of classes) {
    for (const issue of specializationCitationIssues(
      classDefinition,
      status,
      cards
    )) {
      problems.push({
        file: normalize(
          join(dirOf(collectionDirs, classDefinition.collectionId), CLASS_FILE)
        ),
        cardId: null,
        playerClass: classDefinition.playerClass,
        field: issue.path,
        message: contentIssueMessage(issue),
      })
    }
  }

  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, content: { collections, cards, classes } }
}

/** Texto do relatório de REQ-11 (boot e `validate:content`). */
export function formatContentReport(problems: TContentProblem[]): string {
  const lines = problems.map(
    ({ file, cardId, playerClass, field, message }) => {
      const where = [
        file,
        ...(cardId === null ? [] : [`carta ${cardId}`]),
        ...(playerClass === undefined ? [] : [`classe ${playerClass}`]),
        ...(field === null ? [] : [`campo ${field}`]),
      ].join(' | ')
      return `- ${where}: ${message}`
    }
  )
  const count = `${problems.length} ${problems.length === 1 ? 'problema' : 'problemas'}`
  return [`Conteúdo inválido (${count}):`, ...lines].join('\n')
}

/** Erro de boot com o relatório completo (REQ-11). */
export class InvalidContentError extends Error {
  constructor(readonly problems: TContentProblem[]) {
    super(formatContentReport(problems))
    this.name = 'InvalidContentError'
  }
}

async function readCollection(
  dir: string,
  problems: TContentProblem[]
): Promise<{ name: string; description?: string } | null> {
  for (const entry of await sortedEntries(dir)) {
    const known =
      entry.name === COLLECTION_FILE ||
      entry.name === CLASS_FILE ||
      CARD_TYPES.some((type) => entry.name === `${type}.json`)
    if (!entry.isFile() || !known) {
      problems.push(
        problem(
          join(dir, entry.name),
          `Arquivo desconhecido (esperados ${COLLECTION_FILE}, ${CLASS_FILE} e ${CARD_TYPES.join(', ')} .json).`
        )
      )
    }
  }

  const file = join(dir, COLLECTION_FILE)
  if (!(await exists(file))) {
    problems.push(problem(file, 'Arquivo obrigatório ausente.'))
    return null
  }
  const json = await readJson(file, problems)
  if (json === undefined) return null
  const parsed = collectionFileSchema.safeParse(json, { error: zodLocale })
  if (!parsed.success) {
    pushZodIssues(parsed.error, file, null, '', problems)
    return null
  }
  return parsed.data
}

async function readCards(
  file: string,
  type: TCardType,
  collectionId: string,
  problems: TContentProblem[]
): Promise<TEditorCard[]> {
  const json = await readJson(file, problems)
  if (json === undefined) return []
  if (!Array.isArray(json)) {
    problems.push(problem(file, 'O arquivo deve ser uma lista de cartas.'))
    return []
  }

  const cards: TEditorCard[] = []
  json.forEach((raw: unknown, index) => {
    const parsed = cardFileSchemas[type].safeParse(raw, { error: zodLocale })
    if (parsed.success) {
      // O schema de cada tipo espelha a variante de TCard sem os dois campos
      // derivados do caminho; a combinação é a variante daquele `type`.
      // `status` ausente = `published` (D-47).
      const { status = 'published', ...fields } = parsed.data
      cards.push({
        status,
        card: { ...fields, type, collectionId } as TCard,
      })
      return
    }
    const id =
      typeof raw === 'object' &&
      raw !== null &&
      'id' in raw &&
      typeof raw.id === 'string'
        ? raw.id
        : null
    pushZodIssues(
      parsed.error,
      file,
      id,
      id === null ? `[${index}]` : '',
      problems
    )
  })
  return cards
}

async function readClasses(
  file: string,
  collectionId: string,
  problems: TContentProblem[]
): Promise<TEditorClass[]> {
  const json = await readJson(file, problems)
  if (json === undefined) return []
  if (!Array.isArray(json)) {
    problems.push(problem(file, 'O arquivo deve ser uma lista de classes.'))
    return []
  }

  const classes: TEditorClass[] = []
  json.forEach((raw: unknown, index) => {
    const parsed = classFileSchema.safeParse(raw, { error: zodLocale })
    if (parsed.success) {
      // `status` ausente = `published` (D-47); `collectionId` vem do caminho.
      const { status = 'published', ...fields } = parsed.data
      classes.push({ status, classDefinition: { ...fields, collectionId } })
      return
    }
    const playerClass =
      typeof raw === 'object' &&
      raw !== null &&
      'playerClass' in raw &&
      typeof raw.playerClass === 'string'
        ? raw.playerClass
        : undefined
    const issues: TContentProblem[] = []
    pushZodIssues(
      parsed.error,
      file,
      null,
      playerClass === undefined ? `[${index}]` : '',
      issues
    )
    for (const issue of issues) {
      problems.push(
        playerClass === undefined ? issue : { ...issue, playerClass }
      )
    }
  })
  return classes
}

function pushZodIssues(
  error: z.ZodError,
  file: string,
  cardId: string | null,
  prefix: string,
  problems: TContentProblem[]
): void {
  for (const issue of error.issues) {
    const path = issue.path
      .map((segment) =>
        typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`
      )
      .join('')
    const field = `${prefix}${path}`.replace(/^\./, '')
    problems.push({
      file: normalize(file),
      cardId,
      field: field === '' ? null : field,
      message: issue.message,
    })
  }
}

async function readJson(
  file: string,
  problems: TContentProblem[]
): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    problems.push(problem(file, `JSON inválido: ${reason}`))
    return undefined
  }
}

function problem(file: string, message: string): TContentProblem {
  return { file: normalize(file), cardId: null, field: null, message }
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null
}

async function sortedEntries(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )
}

function dirOf(dirs: string[], collectionId: string): string {
  return dirs.find((dir) => basename(dir) === collectionId) ?? collectionId
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/')
}
