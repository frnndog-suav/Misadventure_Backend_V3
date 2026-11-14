import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../../../test/lab-app'

describe('ContentModule (boot)', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'content-e2e-'))
    await mkdir(join(root, 'broken'))
    await writeFile(join(root, 'broken/collection.json'), '{}')
    // CONTENT_DIR é lido quando o app.module é importado: um valor por arquivo.
    process.env.CONTENT_DIR = root
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('REQ-11: conteúdo inválido derruba o boot com o relatório', async () => {
    await expect(createApp(false)).rejects.toThrow(
      /Conteúdo inválido \(1 problema\):\n- .*broken\/collection\.json \| campo name: /
    )
  })
})
