import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../../../test/lab-app'

const draft = {
  id: 'fixture.agility-basic',
  name: 'Agilidade',
  flavorText: null,
  rarity: 'common',
  attributeKind: 'basic',
  attributes: ['dexterity'],
  effects: [],
  status: 'draft',
}

describe('Catálogo só com publicadas (e2e)', () => {
  let root: string
  let app: INestApplication

  beforeAll(async () => {
    // D-52: cópia da fixture numa pasta própria; a fixture nunca muda.
    root = await mkdtemp(join(tmpdir(), 'catalog-e2e-'))
    await cp('test/fixtures/content', root, { recursive: true })
    const attributes = join(root, 'fixture/attribute.json')
    const cards = JSON.parse(await readFile(attributes, 'utf8')) as unknown[]
    await writeFile(attributes, JSON.stringify([draft, ...cards]))
    await mkdir(join(root, 'bosque'))
    await writeFile(join(root, 'bosque/collection.json'), '{"name":"Bosque"}')
    await writeFile(
      join(root, 'bosque/item.json'),
      JSON.stringify([
        {
          id: 'bosque.potion',
          name: 'Poção',
          flavorText: null,
          rarity: 'common',
          itemCategory: 'consumable',
          tags: [],
          effects: [
            {
              text: 'Cura 3.',
              trigger: null,
              cost: [{ kind: 'consumeSelf' }],
              activation: [{ kind: 'heal', amount: 3 }],
              duration: { kind: 'immediate' },
              mark: null,
            },
          ],
          toolKind: null,
          scavengeZoneTypes: [],
          scavengeTool: null,
          status: 'draft',
        },
      ])
    )
    // CONTENT_DIR é lido quando o app.module é importado: um valor por arquivo.
    process.env.CONTENT_DIR = root
    app = await createApp(false)
  })

  afterAll(async () => {
    await app.close()
    await rm(root, { recursive: true, force: true })
  })

  it('REQ-41: GET /catalog/collections conta só as publicadas; coleção sem publicadas aparece zerada', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/collections'
    )

    expect(response.status).toBe(200)
    const [bosque, fixture] = response.body as {
      id: string
      cardCounts: Record<string, number>
    }[]
    expect(bosque?.id).toBe('bosque')
    expect(Object.values(bosque?.cardCounts ?? {})).toEqual(Array(8).fill(0))
    expect(fixture?.cardCounts.attribute).toBe(3)
  })

  it('REQ-41: GET /catalog/collections/:id/cards não lista rascunhos', async () => {
    const response = await request(app.getHttpServer()).get(
      '/catalog/collections/fixture/cards?type=attribute'
    )

    expect(response.status).toBe(200)
    expect(response.body.map((card: { id: string }) => card.id)).toEqual([
      'fixture.dexterity-basic',
      'fixture.endurance-basic',
      'fixture.strength-basic',
    ])
  })

  it('REQ-41: rascunho por id → 404 CARD_NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).get(
      `/catalog/cards/${draft.id}`
    )

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('CARD_NOT_FOUND')
  })
})
