import { describe, expect, it } from 'vitest'

import type { TContentIssue } from '@/domain/catalog/enterprise/value-objects/content'

import { catalogIssueMessage, contentIssueMessage } from './content-messages'

const message = (issue: TContentIssue) => contentIssueMessage(issue)

describe('content-messages (D-49)', () => {
  it('REQ-42: textos do contrato para a coleção', () => {
    expect(message({ path: 'id', reason: 'invalidIdFormat' })).toBe(
      'Use só letras minúsculas, números e hífens.'
    )
    expect(message({ path: 'name', reason: 'required' })).toBe(
      'Informe o nome.'
    )
    expect(message({ path: 'description', reason: 'required' })).toBe(
      'Informe a descrição.'
    )
    expect(message({ path: 'id', reason: 'idImmutable' })).toBe(
      'O identificador não pode mudar.'
    )
    expect(message({ path: 'id', reason: 'idTaken' })).toBe(
      'Já existe uma coleção com este identificador.'
    )
    expect(message({ path: '', reason: 'notAnObject' })).toBe(
      'Envie um objeto JSON.'
    )
  })

  it('REQ-43: textos do contrato para a carta', () => {
    expect(message({ path: 'slug', reason: 'invalidIdFormat' })).toBe(
      'Use só letras minúsculas, números e hífens.'
    )
    expect(message({ path: 'attributes', reason: 'basicAttributeCount' })).toBe(
      'Carta básica tem exatamente 1 atributo.'
    )
    expect(message({ path: 'slug', reason: 'idTaken' })).toBe(
      'Já existe uma carta com este identificador.'
    )
  })

  it('REQ-43: problema de formato usa o texto do Zod', () => {
    expect(
      message({ path: 'rarity', reason: 'invalidFormat', message: 'Zod.' })
    ).toBe('Zod.')
  })

  it('REQ-46: textos dos filtros', () => {
    expect(message({ path: 'type', reason: 'unknownCardType' })).toBe(
      'Tipo de carta desconhecido.'
    )
    expect(message({ path: 'status', reason: 'unknownStatus' })).toBe(
      'Situação desconhecida.'
    )
    expect(message({ path: 'q', reason: 'repeatedParam' })).toBe(
      'Informe a busca uma vez só.'
    )
  })

  it('REQ-48: textos do import', () => {
    expect(
      message({ path: 'formatVersion', reason: 'unsupportedFormatVersion' })
    ).toBe('Versão do arquivo não suportada.')
    expect(message({ path: 'classes', reason: 'classesNotSupported' })).toBe(
      'Classes entram na FEAT-06.'
    )
    expect(message({ path: 'collection.id', reason: 'idTaken' })).toBe(
      'Já existe uma coleção com este identificador.'
    )
    expect(message({ path: 'cards.0.card.id', reason: 'idTaken' })).toBe(
      'Já existe uma carta com este identificador.'
    )
    expect(message({ path: 'cards', reason: 'invalidFormat' })).toBe(
      'Informe a lista de cartas.'
    )
  })

  it('REQ-11: o relatório do boot usa a mesma tabela', () => {
    expect(catalogIssueMessage('synergyAttributeCount')).toBe(
      'Carta de sinergia tem de 2 a 4 atributos.'
    )
    expect(message({ path: 'title', reason: 'duplicateTitle' })).toBe(
      catalogIssueMessage('duplicateTitle')
    )
  })
})
