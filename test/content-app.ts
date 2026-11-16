import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { createApp } from './lab-app'

/**
 * D-52: app com o laboratório ligado sobre uma cópia da fixture numa pasta
 * temporária própria; a fixture nunca muda. Um por arquivo de teste
 * (`CONTENT_DIR` é lido quando o `app.module` é importado).
 */
export async function createContentApp(): Promise<{
  app: INestApplication
  root: string
  close: () => Promise<void>
}> {
  const root = await mkdtemp(join(tmpdir(), 'content-e2e-'))
  await cp('test/fixtures/content', root, { recursive: true })
  process.env.CONTENT_DIR = root
  const app = await createApp(true)
  return {
    app,
    root,
    close: async () => {
      await app.close()
      await rm(root, { recursive: true, force: true })
    },
  }
}

/** Corpo do cenário do contrato (FEAT-31): carta de atributo básica. */
export const FORCA_INPUT = {
  slug: 'forca',
  type: 'attribute',
  name: 'Força',
  flavorText: null,
  rarity: 'common',
  attributeKind: 'basic',
  attributes: ['strength'],
  effects: [],
} as const

/** Coleção `bosque` do cenário do contrato. */
export const BOSQUE_INPUT = {
  id: 'bosque',
  name: 'Bosque Sombrio',
  description: 'Coleção de teste do editor.',
} as const

export const CONTENT_INVALID = {
  code: 'CONTENT_INVALID',
  message: 'Conteúdo inválido.',
} as const
