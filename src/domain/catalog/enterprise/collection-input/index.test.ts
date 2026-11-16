import { describe, expect, it } from 'vitest'

import { parseCollectionInput, parseCollectionPatch } from '.'

const valid = { id: 'bosque', name: 'Bosque Sombrio', description: 'Teste.' }

function issuesOf(result: ReturnType<typeof parseCollectionInput>) {
  expect(result.isLeft()).toBe(true)
  return result.isLeft() ? result.value : []
}

describe('parseCollectionInput', () => {
  it('REQ-42: aceita um CollectionInput válido e tira os espaços das pontas', () => {
    const result = parseCollectionInput({
      id: 'bosque',
      name: '  Bosque Sombrio ',
      description: ' Teste. ',
    })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value).toEqual(valid)
  })

  it('REQ-42: description pode ser texto vazio', () => {
    expect(parseCollectionInput({ ...valid, description: '' }).isRight()).toBe(
      true
    )
  })

  it.each([null, 'texto', 3, [], undefined])(
    'REQ-42: corpo que não é objeto (%j) → problema no path ""',
    (body) => {
      expect(issuesOf(parseCollectionInput(body))).toEqual([
        { path: '', reason: 'notAnObject' },
      ])
    }
  )

  it.each([
    'Bosque X',
    'bosque-',
    '-bosque',
    'bos--que',
    'bosque.x',
    '',
    7,
    null,
  ])('REQ-42: id %j fora de kebab-case → invalidIdFormat', (id) => {
    expect(issuesOf(parseCollectionInput({ ...valid, id }))).toEqual([
      { path: 'id', reason: 'invalidIdFormat' },
    ])
  })

  it('REQ-42: id ausente → invalidIdFormat', () => {
    expect(
      issuesOf(parseCollectionInput({ name: 'A', description: '' }))
    ).toEqual([{ path: 'id', reason: 'invalidIdFormat' }])
  })

  it.each([' ', '', 3, undefined])(
    'REQ-42: name %j vazio após trim, ausente ou não texto → required',
    (name) => {
      expect(issuesOf(parseCollectionInput({ ...valid, name }))).toEqual([
        { path: 'name', reason: 'required' },
      ])
    }
  )

  it.each([3, null, undefined])(
    'REQ-42: description %j não texto ou ausente → required',
    (description) => {
      expect(issuesOf(parseCollectionInput({ ...valid, description }))).toEqual(
        [{ path: 'description', reason: 'required' }]
      )
    }
  )

  it('REQ-42: junta todos os problemas, na ordem id, name, description', () => {
    expect(
      issuesOf(
        parseCollectionInput({ id: 'Bosque X', name: ' ', description: 1 })
      )
    ).toEqual([
      { path: 'id', reason: 'invalidIdFormat' },
      { path: 'name', reason: 'required' },
      { path: 'description', reason: 'required' },
    ])
  })

  it('REQ-42: campo desconhecido → problema no próprio campo', () => {
    expect(issuesOf(parseCollectionInput({ ...valid, color: 'red' }))).toEqual([
      { path: 'color', reason: 'unknownField' },
    ])
  })
})

describe('parseCollectionPatch', () => {
  it('REQ-42: aceita name e/ou description, sem espaços nas pontas', () => {
    const result = parseCollectionPatch({ name: ' Bosque Antigo ' })

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value).toEqual({ name: 'Bosque Antigo' })
  })

  it('REQ-42: corpo vazio é válido (nada muda)', () => {
    const result = parseCollectionPatch({})

    expect(result.isRight()).toBe(true)
    if (result.isLeft()) return
    expect(result.value).toEqual({})
  })

  it('REQ-42: as mesmas regras de name e description', () => {
    const result = parseCollectionPatch({ name: ' ', description: 4 })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toEqual([
      { path: 'name', reason: 'required' },
      { path: 'description', reason: 'required' },
    ])
  })

  it('REQ-42: id no corpo → idImmutable', () => {
    const result = parseCollectionPatch({ id: 'outro' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toEqual([{ path: 'id', reason: 'idImmutable' }])
  })

  it('REQ-42: outro campo no corpo → unknownField', () => {
    const result = parseCollectionPatch({ color: 'red' })

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toEqual([{ path: 'color', reason: 'unknownField' }])
  })

  it('REQ-42: corpo que não é objeto → path ""', () => {
    const result = parseCollectionPatch('x')

    expect(result.isLeft()).toBe(true)
    if (result.isRight()) return
    expect(result.value).toEqual([{ path: '', reason: 'notAnObject' }])
  })
})
