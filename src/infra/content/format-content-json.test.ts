import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { format } from 'prettier'
import { describe, expect, it } from 'vitest'

import { formatContentJson } from './format-content-json'

async function prettier(text: string): Promise<string> {
  return format(text, { parser: 'json' })
}

describe('formatContentJson (D-47)', () => {
  it('REQ-49: os arquivos da fixture saem iguais ao Prettier', async () => {
    const dir = 'test/fixtures/content/fixture'
    for (const name of await readdir(dir)) {
      const value: unknown = JSON.parse(await readFile(join(dir, name), 'utf8'))
      const text = formatContentJson(value)
      expect(text, name).toBe(await prettier(text))
    }
  })

  it('REQ-49: lista longa quebra uma por linha, como o Prettier', async () => {
    const value = [
      {
        id: 'x.y',
        tags: Array.from({ length: 12 }, (_, i) => `etiqueta-${i}`),
        empty: [],
        nested: { list: ['a'], deep: {} },
        flavorText: null,
        value: 1.5,
      },
    ]
    const text = formatContentJson(value)

    expect(text).toBe(await prettier(text))
    expect(text.endsWith('\n')).toBe(true)
  })
})
