import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeAttributeCard,
  makeCombatEventCard,
  makeEquipmentCard,
  makeItemCard,
  makeRandomEventCard,
  makeUrbanZoneCard,
  makeZoneCard,
} from '../../../test/factories/make-card'

import { formatContentReport, loadContent } from './load-content'

/** Carta no formato do arquivo: sem `type` e `collectionId` (D-21). */
function fileCard(card: TCard): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...card }
  delete rest.type
  delete rest.collectionId
  return rest
}

let root: string

async function write(path: string, content: unknown): Promise<void> {
  const full = join(root, path)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(
    full,
    typeof content === 'string' ? content : JSON.stringify(content)
  )
}

async function writeValidCollection(id = 'fixture'): Promise<void> {
  await write(`${id}/collection.json`, { name: 'Coleção de Teste' })
  await write(`${id}/zone.json`, [fileCard(makeZoneCard())])
  await write(`${id}/attribute.json`, [fileCard(makeAttributeCard())])
  await write(`${id}/equipment.json`, [fileCard(makeEquipmentCard())])
  await write(`${id}/item.json`, [fileCard(makeItemCard())])
  await write(`${id}/randomEvent.json`, [fileCard(makeRandomEventCard())])
  await write(`${id}/combatEvent.json`, [fileCard(makeCombatEventCard())])
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'content-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Caminho como aparece no relatório (barras normais). */
function rel(path: string): string {
  return join(root, path).replaceAll('\\', '/')
}

describe('loadContent', () => {
  it('REQ-10: carrega coleções e cartas, derivando type e collectionId do caminho', async () => {
    await writeValidCollection()

    const result = await loadContent(root)

    expect(result).toEqual({
      ok: true,
      content: {
        collections: [{ id: 'fixture', name: 'Coleção de Teste' }],
        cards: [
          makeZoneCard(),
          makeAttributeCard(),
          makeEquipmentCard(),
          makeItemCard(),
          makeRandomEventCard(),
          makeCombatEventCard(),
        ],
      },
    })
  })

  it('REQ-10: arquivo de tipo ausente = nenhuma carta daquele tipo', async () => {
    await write('fixture/collection.json', { name: 'Coleção de Teste' })
    await write('fixture/item.json', [fileCard(makeItemCard())])

    const result = await loadContent(root)

    expect(result.ok && result.content.cards).toEqual([makeItemCard()])
  })

  it('REQ-10: aceita a pasta de uma coleção ou um arquivo dela (validate:content)', async () => {
    await writeValidCollection()
    await writeValidCollection('other')

    for (const path of [
      join(root, 'fixture'),
      join(root, 'fixture/item.json'),
    ]) {
      const result = await loadContent(path)
      expect(result.ok && result.content.collections).toEqual([
        { id: 'fixture', name: 'Coleção de Teste' },
      ])
    }
  })

  it('REQ-10: a fixture de teste carrega com as 6 cartas do contrato', async () => {
    const result = await loadContent('test/fixtures/content')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content.collections).toEqual([
      { id: 'fixture', name: 'Coleção de Teste' },
    ])
    expect(
      result.content.cards.map(({ id, type }) => [id, type]).sort()
    ).toEqual([
      ['fixture.blade-of-dusk', 'equipment'],
      ['fixture.healing-potion', 'item'],
      ['fixture.howling-wolves', 'combatEvent'],
      ['fixture.strength-basic', 'attribute'],
      ['fixture.whispering-grove', 'zone'],
      ['fixture.wounded-traveler', 'randomEvent'],
    ])
    expect(
      result.content.cards.find(({ id }) => id === 'fixture.strength-basic')
    ).toEqual({
      type: 'attribute',
      id: 'fixture.strength-basic',
      collectionId: 'fixture',
      name: 'Força',
      flavorText: null,
      rarity: 'common',
      attributeKind: 'basic',
      attributes: ['strength'],
      effects: [],
    })
  })

  it('REQ-10: o conteúdo publicado (content/) é válido', async () => {
    const result = await loadContent('content')

    expect(result.ok ? [] : result.problems).toEqual([])
  })

  describe('REQ-11: conteúdo inválido gera um problema por item', () => {
    it('JSON malformado', async () => {
      await write('fixture/collection.json', { name: 'Coleção de Teste' })
      await write('fixture/item.json', '[{ "id": ')

      const result = await loadContent(root)

      expect(result).toEqual({
        ok: false,
        problems: [
          {
            file: rel('fixture/item.json'),
            cardId: null,
            field: null,
            message: expect.stringMatching(/^JSON inválido/),
          },
        ],
      })
    })

    it('arquivo de tipo que não é array', async () => {
      await write('fixture/collection.json', { name: 'Coleção de Teste' })
      await write('fixture/item.json', fileCard(makeItemCard()))

      const result = await loadContent(root)

      expect(!result.ok && result.problems).toEqual([
        {
          file: rel('fixture/item.json'),
          cardId: null,
          field: null,
          message: 'O arquivo deve ser uma lista de cartas.',
        },
      ])
    })

    it('valor fora do enum, campo faltando e campo desconhecido (schema)', async () => {
      const withoutTags = fileCard(makeItemCard())
      delete withoutTags.tags
      await write('fixture/collection.json', { name: 'Coleção de Teste' })
      await write('fixture/item.json', [
        { ...withoutTags, itemCategory: 'weapon', color: 'red' },
      ])

      const result = await loadContent(root)

      expect(!result.ok && result.problems).toEqual([
        expect.objectContaining({
          file: rel('fixture/item.json'),
          cardId: 'fixture.healing-potion',
          field: 'itemCategory',
        }),
        expect.objectContaining({ field: 'tags' }),
        expect.objectContaining({ field: null }),
      ])
      if (!result.ok) {
        expect(result.problems[2]?.message).toMatch(/color/)
      }
    })

    it('caminho de campo aninhado e carta sem id (usa o índice)', async () => {
      const wolves = makeCombatEventCard()
      const enemy = wolves.enemies[0]
      await write('fixture/collection.json', { name: 'Coleção de Teste' })
      await write('fixture/combatEvent.json', [
        {
          ...fileCard(wolves),
          enemies: [{ ...enemy, element: 'lava' }],
        },
        { title: 'Sem id' },
      ])

      const result = await loadContent(root)

      expect(!result.ok && result.problems[0]).toEqual(
        expect.objectContaining({
          cardId: 'fixture.howling-wolves',
          field: 'enemies[0].element',
        })
      )
      expect(!result.ok && result.problems[1]).toEqual(
        expect.objectContaining({ cardId: null, field: '[1].id' })
      )
    })

    it('regra de integridade (REQ-15) com arquivo, carta, campo e motivo em pt-BR', async () => {
      await write('fixture/collection.json', { name: 'Coleção de Teste' })
      await write('fixture/zone.json', [
        fileCard(makeUrbanZoneCard({ connectionArrows: 3 })),
      ])

      const result = await loadContent(root)

      expect(!result.ok && result.problems).toEqual([
        {
          file: rel('fixture/zone.json'),
          cardId: makeUrbanZoneCard().id,
          field: 'connectionArrows',
          message: 'Zona urbana precisa de exatamente 4 setas de conexão.',
        },
      ])
    })

    it('pasta de coleção fora de kebab-case (D-22)', async () => {
      await write('Bad.Col/collection.json', { name: 'Ruim' })

      const result = await loadContent(root)

      expect(!result.ok && result.problems).toEqual([
        {
          file: rel('Bad.Col/collection.json'),
          cardId: null,
          field: 'id',
          message:
            'Formato de id inválido (coleção em kebab-case sem ponto; carta em <coleção>.<slug-kebab>).',
        },
      ])
    })

    it('id de carta repetido em arquivos diferentes aponta os dois', async () => {
      await writeValidCollection()
      await write('fixture/randomEvent.json', [
        { ...fileCard(makeRandomEventCard()), id: makeItemCard().id },
      ])

      const result = await loadContent(root)

      expect(!result.ok && result.problems).toEqual([
        {
          file: `${rel('fixture/item.json')}, ${rel('fixture/randomEvent.json')}`,
          cardId: makeItemCard().id,
          field: 'id',
          message: 'Id repetido.',
        },
      ])
    })

    it('collection.json ausente, arquivo desconhecido e arquivo solto na raiz', async () => {
      await write('fixture/item.json', [fileCard(makeItemCard())])
      await write('fixture/monster.json', [])
      await write('notes.txt', 'oi')

      const result = await loadContent(root)

      // Ordem: raiz, depois cada coleção (arquivos desconhecidos, collection.json, tipos).
      expect(!result.ok && result.problems).toEqual([
        {
          file: rel('notes.txt'),
          cardId: null,
          field: null,
          message: 'Arquivo desconhecido (a raiz só tem pastas de coleção).',
        },
        {
          file: rel('fixture/monster.json'),
          cardId: null,
          field: null,
          message:
            'Arquivo desconhecido (esperados collection.json e zone, attribute, equipment, item, randomEvent, combatEvent .json).',
        },
        {
          file: rel('fixture/collection.json'),
          cardId: null,
          field: null,
          message: 'Arquivo obrigatório ausente.',
        },
      ])
    })

    it('caminho inexistente', async () => {
      const result = await loadContent(join(root, 'nope'))

      expect(!result.ok && result.problems).toEqual([
        {
          file: rel('nope'),
          cardId: null,
          field: null,
          message: 'Caminho não encontrado.',
        },
      ])
    })
  })
})

describe('formatContentReport', () => {
  it('REQ-11: uma linha por problema com arquivo, carta, campo e motivo', () => {
    expect(
      formatContentReport([
        {
          file: 'content/base/zone.json',
          cardId: 'base.city',
          field: 'connectionArrows',
          message: 'Zona urbana precisa de exatamente 4 setas de conexão.',
        },
        {
          file: 'content/base/collection.json',
          cardId: null,
          field: null,
          message: 'Arquivo obrigatório ausente.',
        },
      ])
    ).toBe(
      [
        'Conteúdo inválido (2 problemas):',
        '- content/base/zone.json | carta base.city | campo connectionArrows: Zona urbana precisa de exatamente 4 setas de conexão.',
        '- content/base/collection.json: Arquivo obrigatório ausente.',
      ].join('\n')
    )
  })
})
