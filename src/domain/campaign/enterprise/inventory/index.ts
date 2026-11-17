import type {
  TEquipmentCard,
  TItemCard,
  TItemCategory,
} from '@/domain/catalog/enterprise/value-objects/card'

/** Um slot do inventário (README 6.2; D-75): sem estado por cópia. */
export type TInventorySlot = Readonly<{ cardId: string; quantity: number }>

/** Categorias de item que empilham num único slot (README 6.2; REQ-70). */
const STACKING_CATEGORIES: readonly TItemCategory[] = [
  'consumable',
  'material',
  'treasure',
  'booster',
]

/** Equipamento e item `relic`/`tool`/`document`/`special` ocupam 1 slot por cópia. */
export function stacksInInventory(card: TEquipmentCard | TItemCard): boolean {
  switch (card.type) {
    case 'equipment':
      return false
    case 'item':
      return STACKING_CATEGORIES.includes(card.itemCategory)
    default: {
      const _exhaustive: never = card
      return _exhaustive
    }
  }
}

export function freeSlots(
  inventory: readonly TInventorySlot[],
  capacity: number
): number {
  return Math.max(0, capacity - inventory.length)
}

/**
 * Acrescenta `quantity` cópias (REQ-70, D-75). A que empilha e já tem slot soma
 * nele, sem mudar a posição; as demais abrem slots no fim. Não cabe inteira →
 * `null` (nada pela metade).
 */
export function addToInventory(
  inventory: readonly TInventorySlot[],
  card: TEquipmentCard | TItemCard,
  quantity: number,
  capacity: number
): TInventorySlot[] | null {
  if (stacksInInventory(card)) {
    const index = inventory.findIndex((slot) => slot.cardId === card.id)
    if (index >= 0) {
      return inventory.map((slot, i) =>
        i === index
          ? { cardId: slot.cardId, quantity: slot.quantity + quantity }
          : slot
      )
    }
    if (freeSlots(inventory, capacity) < 1) return null
    return [...inventory, { cardId: card.id, quantity }]
  }
  if (freeSlots(inventory, capacity) < quantity) return null
  return [
    ...inventory,
    ...Array.from({ length: quantity }, () => ({
      cardId: card.id,
      quantity: 1,
    })),
  ]
}
