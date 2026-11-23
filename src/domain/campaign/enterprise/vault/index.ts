import { type Either, left, right } from '@/core/error/either'
import type {
  TCard,
  TStarterDeckEntry,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import type { TPlayerState } from '../entities/party-member'
import { addToInventory, type TInventorySlot } from '../inventory'
import { capacitiesOf } from '../markets'
import type { TVaultOperation } from '../party-action'
import { sortedByCardId } from '../starting-player'

/** Cofre do jogador (README 6.4; REQ-83, D-83, D-84). */
export type TVault = Readonly<{
  /** Toda carta empilha: 1 slot por `cardId`, na ordem de chegada. */
  slots: readonly TInventorySlot[]
  /** Decks guardados (sem a build em uso): só atributo, em ordem de `cardId`. */
  decks: readonly (readonly TStarterDeckEntry[])[]
  gold: number
}>

export function emptyVault(): TVault {
  return { slots: [], decks: [], gold: 0 }
}

/** Motivos de recusa de uma operação (REQ-88 item 3). */
export type TVaultRefusalReason =
  | 'notInInventory'
  | 'notInTcgFolder'
  | 'notStorable'
  | 'notInVault'
  | 'vaultFull'
  | 'inventoryFull'
  | 'tcgFolderFull'
  | 'notEnoughGold'
  | 'vaultGoldFull'
  | 'notEnoughVaultGold'
  | 'purseFull'
  | 'notAttribute'
  | 'deckSlotsFull'
  | 'deckNotFound'
  | 'notOwned'
  | 'copyLimitExceeded'
  | 'buildBelowMinimum'

export type TVaultRefusal = Readonly<{
  reason: TVaultRefusalReason
  /** Índice da primeira operação que falha (a partir de 0). */
  operationIndex: number
  /** Só em `notOwned` e `copyLimitExceeded` (CONTRATO FEAT-32). */
  cardId?: string
}>

/** Carta enviada ao limbo por um `discard` (README 6.5; REQ-86). */
export type TLimboEntry = Readonly<{ cardId: string; quantity: number }>

export type TVaultOutcome = Readonly<{
  /** O jogador com as mudanças das operações; deck, mão e descarte ficam como estavam. */
  player: TPlayerState
  limbo: readonly TLimboEntry[]
  /** `swapBuild` ou `editBuild` no lote: o fim do lote refaz o deck (README 4.4; REQ-87). */
  buildChanged: boolean
}>

type TSlots = readonly TInventorySlot[]

/** Soma `quantity` ao slot de `cardId` ou abre um no fim; sem espaço → `null`. */
function addToSlots(
  slots: TSlots,
  cardId: string,
  quantity: number,
  capacity: number
): TSlots | null {
  const index = slots.findIndex((slot) => slot.cardId === cardId)
  if (index >= 0) {
    return slots.map((slot, i) =>
      i === index ? { cardId, quantity: slot.quantity + quantity } : slot
    )
  }
  if (slots.length >= capacity) return null
  return [...slots, { cardId, quantity }]
}

/** Tira `quantity` do slot de `cardId` (o slot sai se esvaziar); faltando → `null`. */
function removeFromSlots(
  slots: TSlots,
  cardId: string,
  quantity: number
): TSlots | null {
  const index = slots.findIndex((slot) => slot.cardId === cardId)
  if (index < 0 || slots[index].quantity < quantity) return null
  return slots.flatMap((slot, i) =>
    i !== index
      ? [slot]
      : slot.quantity > quantity
        ? [{ cardId, quantity: slot.quantity - quantity }]
        : []
  )
}

/** Tira `quantity` unidades de `cardId` do inventário, dos primeiros slots (REQ-85); faltando → `null`. */
export function removeFromInventory(
  inventory: TSlots,
  cardId: string,
  quantity: number
): TSlots | null {
  const owned = inventory
    .filter((slot) => slot.cardId === cardId)
    .reduce((sum, slot) => sum + slot.quantity, 0)
  if (owned < quantity) return null
  let remaining = quantity
  return inventory.flatMap((slot) => {
    if (slot.cardId !== cardId || remaining === 0) return [slot]
    const taken = Math.min(remaining, slot.quantity)
    remaining -= taken
    return slot.quantity > taken
      ? [{ cardId, quantity: slot.quantity - taken }]
      : []
  })
}

const folderSize = (folder: readonly TStarterDeckEntry[]): number =>
  folder.reduce((sum, { copies }) => sum + copies, 0)

const buildSizeOf = folderSize

/**
 * Aplica as operações do Usar cofre em ordem (REQ-84 a REQ-88), cada uma sobre
 * o resultado da anterior. Devolve o jogador novo ou a recusa da primeira que
 * falha (nada é aplicado). `cards` traz as cartas que as operações, o cofre, a
 * build e a pasta citam; a que falta é tratada como inexistente (`notStorable`)
 * ou como atributo sem limite de cópias.
 */
export function applyVaultOperations(input: {
  player: TPlayerState
  config: TGameConfigValues
  cards: readonly TCard[]
  operations: readonly TVaultOperation[]
}): Either<TVaultRefusal, TVaultOutcome> {
  const { config, cards, operations } = input
  const capacity = capacitiesOf(config, input.player.expansions)
  let { inventory, tcgFolder, gold, build } = input.player
  let { slots, decks, gold: vaultGold } = input.player.vault
  const limbo: TLimboEntry[] = []
  let buildChanged = false

  const cardOf = (cardId: string) => cards.find((c) => c.id === cardId)
  const isAttribute = (cardId: string) => cardOf(cardId)?.type === 'attribute'
  /** Primeira carta de atributo não básica acima do limite de cópias (REQ-66 item 4). */
  const copyLimitFailure = (
    entries: readonly TStarterDeckEntry[]
  ): string | null => {
    for (const { cardId, copies } of entries) {
      const card = cardOf(cardId)
      if (
        card?.type === 'attribute' &&
        card.attributeKind !== 'basic' &&
        copies > config.maxCopiesPerCard
      ) {
        return cardId
      }
    }
    return null
  }

  for (const [operationIndex, operation] of operations.entries()) {
    const refuse = (
      reason: TVaultRefusalReason,
      cardId?: string
    ): Either<TVaultRefusal, never> =>
      left(
        cardId === undefined
          ? { reason, operationIndex }
          : { reason, operationIndex, cardId }
      )

    switch (operation.operation) {
      case 'store': {
        const { cardId, quantity } = operation
        const card = cardOf(cardId)
        if (
          !card ||
          (card.type !== 'attribute' &&
            card.type !== 'equipment' &&
            card.type !== 'item')
        ) {
          return refuse('notStorable')
        }
        if (card.type === 'attribute') {
          const entry = tcgFolder.find((e) => e.cardId === cardId)
          if (!entry || entry.copies < quantity) {
            return refuse('notInTcgFolder')
          }
          const added = addToSlots(slots, cardId, quantity, capacity.vaultSlots)
          if (added === null) return refuse('vaultFull')
          slots = added
          tcgFolder = tcgFolder.flatMap((e) =>
            e.cardId !== cardId
              ? [e]
              : e.copies > quantity
                ? [{ cardId, copies: e.copies - quantity }]
                : []
          )
        } else {
          const removed = removeFromInventory(inventory, cardId, quantity)
          if (removed === null) return refuse('notInInventory')
          const added = addToSlots(slots, cardId, quantity, capacity.vaultSlots)
          if (added === null) return refuse('vaultFull')
          slots = added
          inventory = removed
        }
        break
      }
      case 'take': {
        const { cardId, quantity } = operation
        const removed = removeFromSlots(slots, cardId, quantity)
        if (removed === null) return refuse('notInVault')
        const card = cardOf(cardId)
        if (!card) return refuse('notStorable')
        if (card.type === 'attribute') {
          if (folderSize(tcgFolder) + quantity > capacity.tcgFolder) {
            return refuse('tcgFolderFull')
          }
          const existing = tcgFolder.find((e) => e.cardId === cardId)
          tcgFolder = sortedByCardId([
            ...tcgFolder.filter((e) => e.cardId !== cardId),
            { cardId, copies: (existing?.copies ?? 0) + quantity },
          ])
        } else if (card.type === 'equipment' || card.type === 'item') {
          const added = addToInventory(
            inventory,
            card,
            quantity,
            config.inventoryCapacity
          )
          if (added === null) return refuse('inventoryFull')
          inventory = added
        } else {
          return refuse('notStorable')
        }
        slots = removed
        break
      }
      case 'storeGold': {
        const { amount } = operation
        if (gold < amount) return refuse('notEnoughGold')
        if (vaultGold + amount > capacity.vaultGold) {
          return refuse('vaultGoldFull')
        }
        gold -= amount
        vaultGold += amount
        break
      }
      case 'takeGold': {
        const { amount } = operation
        if (vaultGold < amount) return refuse('notEnoughVaultGold')
        if (gold + amount > capacity.purse) return refuse('purseFull')
        gold += amount
        vaultGold -= amount
        break
      }
      case 'discard': {
        const { cardId, quantity } = operation
        const removed = removeFromSlots(slots, cardId, quantity)
        if (removed === null) return refuse('notInVault')
        slots = removed
        limbo.push({ cardId, quantity })
        break
      }
      case 'saveDeck': {
        const { cards: deckCards } = operation
        let remaining = slots
        for (const { cardId, copies } of deckCards) {
          const next = removeFromSlots(remaining, cardId, copies)
          if (next === null) return refuse('notInVault')
          remaining = next
        }
        if (!deckCards.every(({ cardId }) => cardOf(cardId) !== undefined)) {
          return refuse('notStorable')
        }
        if (!deckCards.every(({ cardId }) => isAttribute(cardId))) {
          return refuse('notAttribute')
        }
        // A build em uso também ocupa um slot de decks (README 6.4).
        if (decks.length + 2 > capacity.deckSlots) {
          return refuse('deckSlotsFull')
        }
        slots = remaining
        decks = [...decks, sortedByCardId(deckCards)]
        break
      }
      case 'unpackDeck': {
        const deck = decks[operation.deckIndex]
        if (deck === undefined) return refuse('deckNotFound')
        let next: TSlots = slots
        for (const { cardId, copies } of deck) {
          const added = addToSlots(next, cardId, copies, capacity.vaultSlots)
          if (added === null) return refuse('vaultFull')
          next = added
        }
        slots = next
        decks = decks.filter((_, i) => i !== operation.deckIndex)
        break
      }
      case 'swapBuild': {
        const deck = decks[operation.deckIndex]
        if (deck === undefined) return refuse('deckNotFound')
        const offender = copyLimitFailure(deck)
        if (offender !== null) return refuse('copyLimitExceeded', offender)
        if (buildSizeOf(deck) < config.minDeckSize) {
          return refuse('buildBelowMinimum')
        }
        decks = decks.map((d, i) =>
          i === operation.deckIndex ? sortedByCardId(build) : d
        )
        build = sortedByCardId(deck)
        buildChanged = true
        break
      }
      case 'editBuild': {
        // O pool é a build mais as cartas de atributo do cofre (a pasta não entra).
        const pool = new Map<string, number>()
        for (const { cardId, copies } of build) {
          pool.set(cardId, (pool.get(cardId) ?? 0) + copies)
        }
        for (const { cardId, quantity } of slots) {
          if (isAttribute(cardId)) {
            pool.set(cardId, (pool.get(cardId) ?? 0) + quantity)
          }
        }
        for (const { cardId, copies } of operation.build) {
          if (copies > (pool.get(cardId) ?? 0)) {
            return refuse('notOwned', cardId)
          }
        }
        const offender = copyLimitFailure(operation.build)
        if (offender !== null) return refuse('copyLimitExceeded', offender)
        if (buildSizeOf(operation.build) < config.minDeckSize) {
          return refuse('buildBelowMinimum')
        }

        const used = new Map(operation.build.map((e) => [e.cardId, e.copies]))
        // As de atributo do cofre ficam com a sobra no lugar; as que só estavam na build vão para o fim.
        let leftover: TSlots = slots.flatMap((slot) => {
          if (!isAttribute(slot.cardId)) return [slot]
          const rest =
            (pool.get(slot.cardId) ?? 0) - (used.get(slot.cardId) ?? 0)
          return rest > 0 ? [{ cardId: slot.cardId, quantity: rest }] : []
        })
        for (const { cardId } of sortedByCardId(build)) {
          if (slots.some((slot) => slot.cardId === cardId)) continue
          const rest = (pool.get(cardId) ?? 0) - (used.get(cardId) ?? 0)
          if (rest <= 0) continue
          const added = addToSlots(leftover, cardId, rest, capacity.vaultSlots)
          if (added === null) return refuse('vaultFull')
          leftover = added
        }
        slots = leftover
        build = sortedByCardId(operation.build)
        buildChanged = true
        break
      }
      default: {
        const _exhaustive: never = operation
        return _exhaustive
      }
    }
  }

  return right({
    player: {
      ...input.player,
      inventory,
      tcgFolder,
      gold,
      build,
      vault: { slots, decks, gold: vaultGold },
    },
    limbo,
    buildChanged,
  })
}
