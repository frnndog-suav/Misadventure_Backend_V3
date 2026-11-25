import type {
  TCard,
  TMountCard,
  TStarterDeckEntry,
} from '@/domain/catalog/enterprise/value-objects/card'

import type { TInventorySlot } from '../inventory'

/**
 * Montaria do jogador (README 26; REQ-157, D-146): a carta em uso, o
 * inventário extra (slots como o inventário, com `equipmentState` por cópia)
 * e a pasta extra (só atributos, em ordem de `cardId`).
 */
export type TMountState = Readonly<{
  cardId: string
  inventory: readonly TInventorySlot[]
  tcgFolder: readonly TStarterDeckEntry[]
}>

/** Origem da carta que vai ao limbo ao perder a montaria (REQ-163). */
export type TMountLimboSource = 'mount' | 'mountInventory' | 'mountTcgFolder'

export type TMountLimboEntry = Readonly<{
  cardId: string
  quantity: number
  from: TMountLimboSource
}>

/**
 * Destino das entradas do limbo ao perder a montaria fora do `activate`
 * (habilidades, efeitos disparados e de evento; REQ-163): o agregado as
 * recebe na ordem em que acontecem e emite um `SentToLimbo` por entrada.
 */
export type TMountLimboSink = Readonly<{
  push: (...entries: TMountLimboEntry[]) => unknown
}>

/** A carta da montaria em uso; `null` sem montaria ou se a carta não é `mount`. */
export function mountCardOf(
  player: Readonly<{ mount?: TMountState | null }>,
  cards: ReadonlyMap<string, TCard>
): TMountCard | null {
  const cardId = player.mount?.cardId
  const card = cardId === undefined ? undefined : cards.get(cardId)
  return card?.type === 'mount' ? card : null
}

/**
 * Perder a montaria (REQ-163; D-150 a): a carta, cada slot do inventário extra
 * e cada entrada da pasta extra, nesta ordem; sem montaria, nada.
 */
export function mountLimbo(
  mount: TMountState | null | undefined
): TMountLimboEntry[] {
  if (!mount) return []
  return [
    { cardId: mount.cardId, quantity: 1, from: 'mount' },
    ...mount.inventory.map(({ cardId, quantity }) => ({
      cardId,
      quantity,
      from: 'mountInventory' as const,
    })),
    ...mount.tcgFolder.map(({ cardId, copies }) => ({
      cardId,
      quantity: copies,
      from: 'mountTcgFolder' as const,
    })),
  ]
}
