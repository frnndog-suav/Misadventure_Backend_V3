import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type {
  TCard,
  TClassDefinition,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeAttributeCard,
  makeClassDefinition,
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
        collections: [
          { id: 'fixture', name: 'Coleção de Teste', description: '' },
        ],
        cards: [
          { ...makeZoneCard(), questDeck: [] },
          makeAttributeCard(),
          makeEquipmentCard(),
          makeItemCard(),
          makeRandomEventCard(),
          makeCombatEventCard(),
        ].map((card) => ({ status: 'published', card })),
        classes: [],
      },
    })
  })

  it('REQ-41/D-47: status e description dos arquivos (ausentes = published e "")', async () => {
    await write('fixture/collection.json', {
      name: 'Coleção de Teste',
      description: 'Descrição.',
    })
    await write('fixture/attribute.json', [
      { ...fileCard(makeAttributeCard()), status: 'draft' },
    ])
    await write('fixture/item.json', [
      { ...fileCard(makeItemCard()), status: 'published' },
    ])

    const result = await loadContent(root)

    expect(result).toEqual({
      ok: true,
      content: {
        collections: [
          {
            id: 'fixture',
            name: 'Coleção de Teste',
            description: 'Descrição.',
          },
        ],
        cards: [
          { status: 'draft', card: makeAttributeCard() },
          { status: 'published', card: makeItemCard() },
        ],
        classes: [],
      },
    })
  })

  it('D-48: rascunhos também passam pelo schema e pela integridade no boot', async () => {
    await write('fixture/collection.json', { name: 'Coleção de Teste' })
    await write('fixture/attribute.json', [
      {
        ...fileCard(makeAttributeCard({ attributes: ['strength', 'luck'] })),
        status: 'draft',
      },
      {
        ...fileCard(
          makeAttributeCard({ id: 'fixture.luck-basic', attributes: ['luck'] })
        ),
        status: 'rascunho',
      },
    ])

    const result = await loadContent(root)

    expect(!result.ok && result.problems.map((p) => p.field)).toEqual([
      'status',
      'attributes',
    ])
    expect(!result.ok && result.problems[1]?.message).toBe(
      'Carta básica tem exatamente 1 atributo.'
    )
  })

  it('REQ-10: arquivo de tipo ausente = nenhuma carta daquele tipo', async () => {
    await write('fixture/collection.json', { name: 'Coleção de Teste' })
    await write('fixture/item.json', [fileCard(makeItemCard())])

    const result = await loadContent(root)

    expect(result.ok && result.content.cards).toEqual([
      { status: 'published', card: makeItemCard() },
    ])
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
        { id: 'fixture', name: 'Coleção de Teste', description: '' },
      ])
    }
  })

  it('REQ-10/REQ-100: a fixture de teste carrega com as 24 cartas e as 2 classes do contrato', async () => {
    const result = await loadContent('test/fixtures/content')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content.collections).toEqual([
      { id: 'fixture', name: 'Coleção de Teste', description: '' },
    ])
    expect(
      result.content.cards.find(
        ({ card }) => card.id === 'fixture.wounded-traveler'
      )?.card
    ).toMatchObject({
      escapeThreshold: null,
      requirements: [{ id: 'offer-potion', kind: 'offerResources' }],
    })
    expect(
      result.content.cards.find(
        ({ card }) => card.id === 'fixture.test-dimension'
      )?.card
    ).toMatchObject({
      eventDecks: [
        {
          zoneType: 'urban',
          cards: [
            { cardId: 'fixture.wounded-traveler', copies: 1 },
            { cardId: 'fixture.howling-wolves', copies: 1 },
          ],
        },
      ],
    })
    expect(result.content.cards.every((e) => e.status === 'published')).toBe(
      true
    )
    expect(
      result.content.cards.map(({ card: { id, type } }) => [id, type]).sort()
    ).toEqual([
      ['fixture.arcane-wand', 'equipment'],
      ['fixture.blade-of-dusk', 'equipment'],
      ['fixture.dexterity-basic', 'attribute'],
      ['fixture.endurance-basic', 'attribute'],
      ['fixture.fishing-rod', 'item'],
      ['fixture.focus-amulet', 'equipment'],
      ['fixture.gray-harbor', 'zone'],
      ['fixture.guardian-armor', 'equipment'],
      ['fixture.healing-potion', 'item'],
      ['fixture.howling-wolves', 'combatEvent'],
      ['fixture.iron-helm', 'equipment'],
      ['fixture.iron-ore', 'item'],
      ['fixture.lucky-coin', 'item'],
      ['fixture.oak-shield', 'equipment'],
      ['fixture.old-mine', 'zone'],
      ['fixture.pickaxe', 'item'],
      ['fixture.short-sword', 'equipment'],
      ['fixture.silver-fish', 'item'],
      ['fixture.stone-bend', 'zone'],
      ['fixture.strength-basic', 'attribute'],
      ['fixture.strength-tonic', 'item'],
      ['fixture.test-dimension', 'dimension'],
      ['fixture.whispering-grove', 'zone'],
      ['fixture.wounded-traveler', 'randomEvent'],
    ])
    expect(
      result.content.classes.map((e) => [
        e.status,
        e.classDefinition.playerClass,
      ])
    ).toEqual([
      ['published', 'rogue'],
      ['published', 'warrior'],
    ])
    expect(
      result.content.cards.find(
        ({ card }) => card.id === 'fixture.strength-basic'
      )?.card
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
            'Arquivo desconhecido (esperados collection.json, class.json e zone, attribute, equipment, item, randomEvent, combatEvent, zoneQuest, dimension .json).',
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

/** Classe no formato do arquivo: sem `collectionId` (D-40). */
function fileClass(
  override: Partial<TClassDefinition> = {}
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...makeClassDefinition(override) }
  delete rest.collectionId
  return rest
}

async function writeClassCollection(classes: unknown): Promise<void> {
  await writeValidCollection()
  await write('fixture/attribute.json', [
    fileCard(makeAttributeCard()),
    fileCard(
      makeAttributeCard({
        id: 'fixture.dexterity-basic',
        name: 'Destreza',
        attributes: ['dexterity'],
      })
    ),
  ])
  await write('fixture/class.json', classes)
}

describe('loadContent — classes (class.json)', () => {
  it('REQ-10/D-40: lê as classes com collectionId do caminho e status (ausente = published)', async () => {
    await writeClassCollection([
      fileClass(),
      {
        ...fileClass({
          playerClass: 'rogue',
          name: 'Ladino',
          essentialAttributes: ['dexterity'],
          starterDeck: [{ cardId: 'fixture.dexterity-basic', copies: 60 }],
        }),
        status: 'draft',
      },
    ])

    const result = await loadContent(root)

    expect(result.ok && result.content.classes).toEqual([
      {
        status: 'published',
        classDefinition: makeClassDefinition({ specializations: [] }),
      },
      {
        status: 'draft',
        classDefinition: makeClassDefinition({
          specializations: [],
          playerClass: 'rogue',
          name: 'Ladino',
          essentialAttributes: ['dexterity'],
          starterDeck: [{ cardId: 'fixture.dexterity-basic', copies: 60 }],
        }),
      },
    ])
  })

  it('REQ-11: class.json fora do schema aponta o arquivo, a classe e o campo', async () => {
    await writeClassCollection([
      { ...fileClass(), collectionId: 'fixture' },
      { name: 'Sem identificador' },
    ])

    const result = await loadContent(root)

    expect(!result.ok && result.problems).toEqual([
      {
        file: rel('fixture/class.json'),
        cardId: null,
        playerClass: 'warrior',
        field: null,
        message: expect.stringContaining('collectionId'),
      },
      ...[
        'playerClass',
        'essentialAttributes',
        'baseModifiers',
        'starterDeck',
      ].map((field) => ({
        file: rel('fixture/class.json'),
        cardId: null,
        field: `[1].${field}`,
        message: expect.any(String),
      })),
    ])
  })

  it('REQ-11/REQ-26: problema de integridade de classe aponta class.json e a classe', async () => {
    await writeClassCollection([
      fileClass({
        starterDeck: [{ cardId: 'fixture.strength-basic', copies: 59 }],
      }),
    ])

    const result = await loadContent(root)

    expect(!result.ok && result.problems).toEqual([
      {
        file: rel('fixture/class.json'),
        cardId: null,
        playerClass: 'warrior',
        field: 'starterDeck',
        message:
          'O deck pré-pronto precisa ter o tamanho mínimo do deck (padrão).',
      },
    ])
  })

  it('REQ-11: class.json que não é lista', async () => {
    await writeClassCollection(fileClass())

    const result = await loadContent(root)

    expect(!result.ok && result.problems).toEqual([
      {
        file: rel('fixture/class.json'),
        cardId: null,
        field: null,
        message: 'O arquivo deve ser uma lista de classes.',
      },
    ])
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

  it('REQ-11/D-56: problema de classe mostra a classe', () => {
    expect(
      formatContentReport([
        {
          file: 'content/base/class.json',
          cardId: null,
          playerClass: 'warrior',
          field: 'starterDeck',
          message: 'Valor fora da faixa permitida.',
        },
      ])
    ).toBe(
      [
        'Conteúdo inválido (1 problema):',
        '- content/base/class.json | classe warrior | campo starterDeck: Valor fora da faixa permitida.',
      ].join('\n')
    )
  })
})
