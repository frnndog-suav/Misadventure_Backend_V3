import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TEditorCard } from '@/domain/catalog/enterprise/value-objects/content'
import {
  makeAttributeCard,
  makeItemCard,
} from '../../../test/factories/make-card'

import { FileContentStore, nodeContentFs } from './file-content-store'
import { loadContent } from './load-content'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'content-store-'))
  await cp('test/fixtures/content', root, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function open(fs = nodeContentFs): Promise<FileContentStore> {
  const result = await loadContent(root)
  if (!result.ok) throw new Error('fixture inválida')
  return new FileContentStore(root, result.content, fs)
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, path), 'utf8'))
}

async function exists(path: string): Promise<boolean> {
  return (await stat(join(root, path)).catch(() => null)) !== null
}

/** Reabre do disco: o que um reinício do backend veria (REQ-49). */
async function reopen(): Promise<FileContentStore> {
  return open()
}

const draft = makeAttributeCard({
  id: 'fixture.agility-basic',
  name: 'Agilidade',
  attributes: ['dexterity'],
})

describe('FileContentStore', () => {
  it('REQ-41: o catálogo só vê as publicadas; o editor vê todas', async () => {
    const store = await open()
    await store.saveCard(draft, 'draft')

    expect(await store.findCard(draft.id)).toBeNull()
    expect(await store.findEditorCard(draft.id)).toEqual({
      status: 'draft',
      card: draft,
    })
    expect((await store.listCards('fixture')).map((c) => c.id)).not.toContain(
      draft.id
    )
    expect(await store.listCollections()).toEqual([
      { id: 'fixture', name: 'Coleção de Teste', description: '' },
    ])
  })

  it('REQ-27/D-40: o catálogo vê só as classes publicadas do class.json', async () => {
    await writeFile(
      join(root, 'fixture/class.json'),
      JSON.stringify([
        ...((await readJson('fixture/class.json')) as object[]),
        {
          playerClass: 'mage',
          name: 'Mago',
          essentialAttributes: ['strength'],
          baseModifiers: {
            attack: 1,
            defense: 1,
            accuracy: 1,
            evasion: 1,
            celerity: 1,
            piercing: 0,
            reflection: 0,
          },
          starterDeck: [{ cardId: 'fixture.strength-basic', copies: 60 }],
          status: 'draft',
        },
      ])
    )
    const store = await open()

    expect(
      (await store.listClasses()).map((c) => [c.playerClass, c.collectionId])
    ).toEqual([
      ['rogue', 'fixture'],
      ['warrior', 'fixture'],
    ])
    expect((await store.findClass('warrior'))?.name).toBe('Guerreiro')
    expect(await store.findClass('mage')).toBeNull()
    expect(await store.findClass('cleric')).toBeNull()
    expect(await store.findClass('nada')).toBeNull()
  })

  it('REQ-49: excluir a coleção tira as classes dela', async () => {
    const store = await open()
    await store.deleteCollection('fixture')

    expect(await store.listClasses()).toEqual([])
  })

  it('REQ-49: rascunho gravado no <tipo>.json com status, por id, e relido igual', async () => {
    const store = await open()
    await store.saveCard(draft, 'draft')

    expect(await readJson('fixture/attribute.json')).toEqual([
      {
        id: 'fixture.agility-basic',
        name: 'Agilidade',
        flavorText: null,
        rarity: 'common',
        attributeKind: 'basic',
        attributes: ['dexterity'],
        effects: [],
        status: 'draft',
      },
      {
        id: 'fixture.dexterity-basic',
        name: 'Destreza',
        flavorText: null,
        rarity: 'common',
        attributeKind: 'basic',
        attributes: ['dexterity'],
        effects: [],
      },
      {
        id: 'fixture.endurance-basic',
        name: 'Resistência',
        flavorText: null,
        rarity: 'common',
        attributeKind: 'basic',
        attributes: ['endurance'],
        effects: [],
      },
      {
        id: 'fixture.strength-basic',
        name: 'Força',
        flavorText: null,
        rarity: 'common',
        attributeKind: 'basic',
        attributes: ['strength'],
        effects: [],
      },
    ])
    expect(await (await reopen()).findEditorCard(draft.id)).toEqual({
      status: 'draft',
      card: draft,
    })
  })

  it('REQ-49: coleção nova (description só quando não vazia), editada e relida', async () => {
    const store = await open()
    await store.createCollection({
      id: 'bosque',
      name: 'Bosque',
      description: '',
    })
    expect(await readJson('bosque/collection.json')).toEqual({ name: 'Bosque' })

    await store.updateCollection({
      id: 'bosque',
      name: 'Bosque Antigo',
      description: 'Teste.',
    })
    expect(await readJson('bosque/collection.json')).toEqual({
      name: 'Bosque Antigo',
      description: 'Teste.',
    })
    expect(await (await reopen()).findCollection('bosque')).toEqual({
      id: 'bosque',
      name: 'Bosque Antigo',
      description: 'Teste.',
    })
  })

  it('REQ-49: renomear um rascunho troca o id no arquivo', async () => {
    const store = await open()
    await store.saveCard(draft, 'draft')
    const renamed = { ...draft, id: 'fixture.agility-pure' }
    await store.saveCard(renamed, 'draft', draft.id)

    const ids = (
      (await readJson('fixture/attribute.json')) as { id: string }[]
    ).map((card) => card.id)
    expect(ids).toEqual([
      'fixture.agility-pure',
      'fixture.dexterity-basic',
      'fixture.endurance-basic',
      'fixture.strength-basic',
    ])
    expect(await store.findEditorCard(draft.id)).toBeNull()
  })

  it('REQ-49: renomear para outro tipo apaga o arquivo de tipo que fica vazio', async () => {
    const store = await open()
    const item = makeItemCard({ id: 'fixture.blade-of-dusk' })
    await store.saveCard(item, 'draft', 'fixture.blade-of-dusk')

    expect(await exists('fixture/equipment.json')).toBe(false)
    const items = (await readJson('fixture/item.json')) as { id: string }[]
    expect(items.map((card) => card.id)).toEqual([
      'fixture.blade-of-dusk',
      'fixture.healing-potion',
    ])
  })

  it('REQ-49: excluir a última carta de um tipo apaga o arquivo', async () => {
    const store = await open()
    await store.deleteCard('fixture.blade-of-dusk')

    expect(await exists('fixture/equipment.json')).toBe(false)
    expect(await store.findEditorCard('fixture.blade-of-dusk')).toBeNull()
  })

  it('REQ-49: excluir a coleção apaga a pasta', async () => {
    const store = await open()
    await store.deleteCollection('fixture')

    expect(await exists('fixture')).toBe(false)
    expect(await store.listCollections()).toEqual([])
    expect(await store.findEditorCard('fixture.strength-basic')).toBeNull()
  })

  it('REQ-38/REQ-49: classe em rascunho gravada no class.json com status, por playerClass, e relida', async () => {
    const store = await open()
    const warrior = await store.findEditorClass('warrior')
    if (!warrior) throw new Error('fixture sem warrior')
    const mage = {
      ...warrior.classDefinition,
      playerClass: 'mage' as const,
      name: 'Mago',
    }
    await store.saveClass(mage, 'draft')

    const file = (await readJson('fixture/class.json')) as {
      playerClass: string
      status?: string
      collectionId?: string
    }[]
    expect(file.map((c) => c.playerClass)).toEqual(['mage', 'rogue', 'warrior'])
    expect(file[0].status).toBe('draft')
    expect(file[1].status).toBeUndefined()
    expect(file[0].collectionId).toBeUndefined()
    expect(await store.findClass('mage')).toBeNull()

    const reopened = await reopen()
    expect(await reopened.findEditorClass('mage')).toEqual({
      status: 'draft',
      classDefinition: mage,
    })
  })

  it('REQ-38/REQ-49: renomear e excluir classe; vazio apaga o class.json', async () => {
    const store = await open()
    const rogue = await store.findEditorClass('rogue')
    if (!rogue) throw new Error('fixture sem rogue')
    await store.saveClass(
      { ...rogue.classDefinition, playerClass: 'ranger' },
      'draft',
      'rogue'
    )
    expect(await store.findEditorClass('rogue')).toBeNull()
    expect(
      (await store.listEditorClasses()).map(
        (c) => c.classDefinition.playerClass
      )
    ).toEqual(expect.arrayContaining(['ranger', 'warrior']))

    await store.deleteClass('ranger')
    await store.deleteClass('warrior')
    expect(await exists('fixture/class.json')).toBe(false)
    expect(await (await reopen()).listEditorClasses()).toEqual([])
  })

  it('REQ-48/REQ-49: import com classes grava o class.json', async () => {
    const store = await open()
    const card = {
      ...draft,
      id: 'bosque.agility-basic',
      collectionId: 'bosque',
    }
    const classes = [
      {
        status: 'draft' as const,
        classDefinition: {
          playerClass: 'mage' as const,
          collectionId: 'bosque',
          name: 'Mago',
          essentialAttributes: ['intelligence' as const],
          baseModifiers: {
            attack: 1,
            defense: 1,
            accuracy: 1,
            evasion: 1,
            celerity: 1,
            piercing: 0,
            reflection: 0,
          },
          starterDeck: [{ cardId: card.id, copies: 60 }],
        },
      },
    ]
    await store.importCollection(
      {
        collection: { id: 'bosque', name: 'Bosque', description: '' },
        cards: [{ status: 'draft', card }],
        classes,
      },
      false
    )
    expect(await exists('bosque/class.json')).toBe(true)
    expect(
      (await (await reopen()).listEditorClasses()).filter(
        (c) => c.classDefinition.collectionId === 'bosque'
      )
    ).toEqual(classes)
  })

  it('REQ-49: import com replace troca a coleção inteira', async () => {
    const store = await open()
    const cards: TEditorCard[] = [{ status: 'draft', card: draft }]
    await store.importCollection(
      {
        collection: { id: 'fixture', name: 'Nova', description: 'Trocada.' },
        cards,
        classes: [],
      },
      true
    )

    expect(await store.listEditorCards('fixture')).toEqual(cards)
    expect(await exists('fixture/zone.json')).toBe(false)
    // Arquivo sem classes: a coleção trocada fica sem `class.json`.
    expect(await exists('fixture/class.json')).toBe(false)
    expect(await store.listClasses()).toEqual([])
    expect(await readJson('fixture/collection.json')).toEqual({
      name: 'Nova',
      description: 'Trocada.',
    })
    const reopened = await reopen()
    expect(await reopened.listEditorCards('fixture')).toEqual(cards)
    // Nenhuma pasta temporária da troca fica para trás.
    expect(await readdir(root)).toEqual(['fixture'])
  })

  it('REQ-49: import sem replace cria a coleção nova', async () => {
    const store = await open()
    const card = {
      ...draft,
      id: 'bosque.agility-basic',
      collectionId: 'bosque',
    }
    await store.importCollection(
      {
        collection: { id: 'bosque', name: 'Bosque', description: '' },
        cards: [{ status: 'published', card }],
        classes: [],
      },
      false
    )

    expect(await (await reopen()).findCard(card.id)).toEqual(card)
  })

  it('REQ-49: falha de escrita no disco não muda a memória', async () => {
    const failing = {
      ...nodeContentFs,
      writeFile: async () => {
        throw new Error('disco cheio')
      },
    }
    const store = await open(failing)

    await expect(store.saveCard(draft, 'draft')).rejects.toThrow('disco cheio')
    await expect(
      store.createCollection({ id: 'bosque', name: 'Bosque', description: '' })
    ).rejects.toThrow('disco cheio')

    expect(await store.findEditorCard(draft.id)).toBeNull()
    expect(await store.findCollection('bosque')).toBeNull()
    expect(await exists('bosque')).toBe(false)
    const ids = (
      (await readJson('fixture/attribute.json')) as { id: string }[]
    ).map((card) => card.id)
    expect(ids).toEqual([
      'fixture.dexterity-basic',
      'fixture.endurance-basic',
      'fixture.strength-basic',
    ])
  })

  it('REQ-49: falha ao trocar a pasta no import com replace restaura a antiga', async () => {
    let renames = 0
    const failing = {
      ...nodeContentFs,
      rename: async (from: string, to: string) => {
        // 1ª e 2ª: arquivos na pasta nova; 3ª: velha → .tmp-old; 4ª falha.
        renames += 1
        if (renames === 4) throw new Error('rename falhou')
        await nodeContentFs.rename(from, to)
      },
    }
    const store = await open(failing)

    await expect(
      store.importCollection(
        {
          collection: { id: 'fixture', name: 'Nova', description: '' },
          cards: [{ status: 'draft', card: draft }],
          classes: [],
        },
        true
      )
    ).rejects.toThrow('rename falhou')

    expect((await store.findCollection('fixture'))?.name).toBe(
      'Coleção de Teste'
    )
    expect(await readdir(root)).toEqual(['fixture'])
    expect(await exists('fixture/zone.json')).toBe(true)
  })

  it('REQ-49: gravações simultâneas passam pela fila e nenhuma se perde', async () => {
    const store = await open()
    const cards = Array.from({ length: 5 }, (_, i) =>
      makeAttributeCard({ id: `fixture.basic-${i}` })
    )
    await Promise.all(cards.map((card) => store.saveCard(card, 'draft')))

    const reopened = await reopen()
    for (const card of cards) {
      expect(await reopened.findEditorCard(card.id)).not.toBeNull()
    }
  })

  it('REQ-49: depois das gravações, validate:content não acusa problema', async () => {
    const store = await open()
    await store.createCollection({
      id: 'bosque',
      name: 'Bosque',
      description: 'Teste.',
    })
    await store.saveCard(
      { ...draft, id: 'bosque.agility-basic', collectionId: 'bosque' },
      'draft'
    )
    await store.saveCard(draft, 'published')
    await store.deleteCard('fixture.healing-potion')

    const result = await loadContent(root)
    expect(result.ok ? [] : result.problems).toEqual([])
    expect(await exists('fixture/attribute.json.tmp')).toBe(false)
  })
})
