import { describe, expect, it } from 'vitest'

import { parsePartyAction } from '.'

const issuesOf = (body: unknown) => {
  const result = parsePartyAction(body)
  return result.isLeft() ? result.value : null
}

const withOperations = (...operations: unknown[]) => ({
  type: 'visitBlacksmith',
  operations,
})

describe('parsePartyAction — visitBlacksmith (REQ-149; D-138)', () => {
  it('REQ-149: as quatro operações válidas → a ação, com os campos lidos', () => {
    const body = withOperations(
      {
        operation: 'repair',
        target: { location: 'equipment', slot: 'weapon' },
      },
      {
        operation: 'refine',
        target: { location: 'inventory', inventorySlotIndex: 0 },
      },
      {
        operation: 'enchant',
        target: { location: 'inventory', inventorySlotIndex: 2 },
        enchantmentId: 'ember-edge',
        replaceIndex: 0,
        extra: false,
      },
      { operation: 'craft', inventorySlotIndex: 3 }
    )
    expect(parsePartyAction(body).value).toEqual(body)
  })

  it('REQ-149: operations ausente → required; não lista → notArray; vazia ou > 50 → invalidLength', () => {
    expect(issuesOf({ type: 'visitBlacksmith' })).toEqual([
      { field: 'operations', reason: 'required' },
    ])
    expect(issuesOf({ type: 'visitBlacksmith', operations: {} })).toEqual([
      { field: 'operations', reason: 'notArray' },
    ])
    expect(issuesOf(withOperations())).toEqual([
      { field: 'operations', reason: 'invalidLength' },
    ])
    const many = Array.from({ length: 51 }, () => ({
      operation: 'craft',
      inventorySlotIndex: 0,
    }))
    expect(issuesOf(withOperations(...many))).toEqual([
      { field: 'operations', reason: 'invalidLength' },
    ])
  })

  it('CONTRATO FEAT-17: slot e location desconhecidos → unknownOption; target não objeto → notObject', () => {
    expect(
      issuesOf(
        withOperations(
          {
            operation: 'repair',
            target: { location: 'equipment', slot: 'tail' },
          },
          {
            operation: 'refine',
            target: { location: 'vault', inventorySlotIndex: 0 },
          },
          { operation: 'refine', target: 3 },
          { operation: 'refine' }
        )
      )
    ).toEqual([
      { field: 'operations.0.target.slot', reason: 'unknownOption' },
      { field: 'operations.1.target.location', reason: 'unknownOption' },
      { field: 'operations.2.target', reason: 'notObject' },
      { field: 'operations.3.target', reason: 'required' },
    ])
  })

  it('CONTRATO FEAT-17: índices negativos ou fracionados → notNonNegativeInteger; extra não booleano → unknownOption; chave a mais → unknownKey', () => {
    expect(
      issuesOf(
        withOperations(
          { operation: 'craft', inventorySlotIndex: -1 },
          {
            operation: 'refine',
            target: { location: 'inventory', inventorySlotIndex: 1.5 },
          },
          {
            operation: 'enchant',
            target: { location: 'equipment', slot: 'weapon' },
            enchantmentId: 'x',
            replaceIndex: -2,
            extra: 'sim',
          },
          { operation: 'craft', inventorySlotIndex: 0, cardId: 'x' }
        )
      )
    ).toEqual([
      {
        field: 'operations.0.inventorySlotIndex',
        reason: 'notNonNegativeInteger',
      },
      {
        field: 'operations.1.target.inventorySlotIndex',
        reason: 'notNonNegativeInteger',
      },
      { field: 'operations.2.replaceIndex', reason: 'notNonNegativeInteger' },
      { field: 'operations.2.extra', reason: 'unknownOption' },
      { field: 'operations.3.cardId', reason: 'unknownKey' },
    ])
  })

  it('CONTRATO FEAT-17: operation desconhecida → unknownOperation; ausente → required', () => {
    expect(
      issuesOf(withOperations({ operation: 'polish' }, { target: {} }))
    ).toEqual([
      { field: 'operations.0.operation', reason: 'unknownOperation' },
      { field: 'operations.1.operation', reason: 'required' },
    ])
  })
})

describe('parsePartyAction — artificerWorkshop (REQ-153)', () => {
  it('REQ-153: mesmas operações e regras do Ir ao Ferreiro', () => {
    const body = {
      type: 'artificerWorkshop',
      operations: [
        {
          operation: 'repair',
          target: { location: 'equipment', slot: 'weapon' },
        },
        { operation: 'craft', inventorySlotIndex: 1 },
      ],
    }
    expect(parsePartyAction(body).value).toEqual(body)
    expect(issuesOf({ type: 'artificerWorkshop', operations: [] })).toEqual([
      { field: 'operations', reason: 'invalidLength' },
    ])
  })
})
