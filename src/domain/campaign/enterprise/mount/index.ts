import { type Either, left, right } from '@/core/error/either'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import type {
  TAttributeCard,
  TCard,
  TEquipmentCard,
  TItemCard,
  TMountCard,
  TStarterDeckEntry,
} from '@/domain/catalog/enterprise/value-objects/card'

import {
  addToInventory,
  freeSlots,
  stacksInInventory,
  type TInventorySlot,
} from '../inventory'
import type { TPlayerState } from '../entities/party-member'
import { capacitiesOf, type TExpansions } from '../markets'

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

/** Espaço onde a carta chega (CONTRATO FEAT-18 `ReceiveSpace`; D-148). */
export type TReceiveSpace =
  'inventory' | 'tcgFolder' | 'mountInventory' | 'mountTcgFolder'

/** Quanto entrou em cada espaço, na ordem principal → montaria. */
export type TReceivedPart<S extends TReceiveSpace = TReceiveSpace> = Readonly<{
  space: S
  quantity: number
}>

type TReceiveCapacities = Readonly<{
  inventory: number
  mountInventory: number
}>

const folderCopies = (folder: readonly TStarterDeckEntry[]): number =>
  folder.reduce((sum, { copies }) => sum + copies, 0)

const addCopies = (
  folder: readonly TStarterDeckEntry[],
  cardId: string,
  copies: number
): TStarterDeckEntry[] => {
  const existing = folder.find((entry) => entry.cardId === cardId)
  return [
    ...folder.filter((entry) => entry.cardId !== cardId),
    { cardId, copies: (existing?.copies ?? 0) + copies },
  ].sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0))
}

/**
 * Chegada de recurso (REQ-159; D-144): primeiro o inventário, o resto no
 * inventário extra. O que empilha vai inteiro a um espaço (o slot que já tem
 * a carta ou o primeiro com slot livre); o que não empilha enche os slots
 * livres do inventário e o resto vai à montaria. Não cabe inteiro → `null`.
 */
export function receiveResource(input: {
  inventory: readonly TInventorySlot[]
  mount: TMountState | null | undefined
  card: TEquipmentCard | TItemCard
  quantity: number
  capacities: TReceiveCapacities
}): {
  inventory: TInventorySlot[]
  mount: TMountState | null
  received: TReceivedPart<'inventory' | 'mountInventory'>[]
} | null {
  const { card, quantity, capacities } = input
  const mount = input.mount ?? null
  const main = addToInventory(
    input.inventory,
    card,
    quantity,
    capacities.inventory
  )
  if (main !== null) {
    return {
      inventory: main,
      mount,
      received: [{ space: 'inventory', quantity }],
    }
  }
  if (mount === null) return null
  if (stacksInInventory(card)) {
    const extra = addToInventory(
      mount.inventory,
      card,
      quantity,
      capacities.mountInventory
    )
    if (extra === null) return null
    return {
      inventory: [...input.inventory],
      mount: { ...mount, inventory: extra },
      received: [{ space: 'mountInventory', quantity }],
    }
  }
  const inMain = freeSlots(input.inventory, capacities.inventory)
  const inventory = addToInventory(
    input.inventory,
    card,
    inMain,
    capacities.inventory
  )
  const extra = addToInventory(
    mount.inventory,
    card,
    quantity - inMain,
    capacities.mountInventory
  )
  if (inventory === null || extra === null) return null
  return {
    inventory,
    mount: { ...mount, inventory: extra },
    received: [
      ...(inMain > 0
        ? [{ space: 'inventory' as const, quantity: inMain }]
        : []),
      { space: 'mountInventory', quantity: quantity - inMain },
    ],
  }
}

/**
 * Chegada de atributo (REQ-159; D-144): a pasta até encher, o resto na pasta
 * extra. Não cabe inteiro → `null`.
 */
export function receiveAttribute(input: {
  tcgFolder: readonly TStarterDeckEntry[]
  mount: TMountState | null | undefined
  cardId: string
  quantity: number
  capacities: Readonly<{ tcgFolder: number; mountTcgFolder: number }>
}): {
  tcgFolder: TStarterDeckEntry[]
  mount: TMountState | null
  received: TReceivedPart<'tcgFolder' | 'mountTcgFolder'>[]
} | null {
  const { cardId, quantity, capacities } = input
  const mount = input.mount ?? null
  const inMain = Math.min(
    quantity,
    Math.max(0, capacities.tcgFolder - folderCopies(input.tcgFolder))
  )
  const rest = quantity - inMain
  if (rest > 0) {
    if (
      mount === null ||
      folderCopies(mount.tcgFolder) + rest > capacities.mountTcgFolder
    ) {
      return null
    }
  }
  return {
    tcgFolder:
      inMain > 0
        ? addCopies(input.tcgFolder, cardId, inMain)
        : [...input.tcgFolder],
    mount:
      rest > 0 && mount !== null
        ? { ...mount, tcgFolder: addCopies(mount.tcgFolder, cardId, rest) }
        : mount,
    received: [
      ...(inMain > 0
        ? [{ space: 'tcgFolder' as const, quantity: inMain }]
        : []),
      ...(rest > 0
        ? [{ space: 'mountTcgFolder' as const, quantity: rest }]
        : []),
    ],
  }
}

/** Vagas livres somando a pasta e a pasta extra (REQ-159). */
export function freeFolderCopies(input: {
  tcgFolder: readonly TStarterDeckEntry[]
  mount: TMountState | null | undefined
  capacities: Readonly<{ tcgFolder: number; mountTcgFolder: number }>
}): number {
  const main = Math.max(
    0,
    input.capacities.tcgFolder - folderCopies(input.tcgFolder)
  )
  const extra = input.mount
    ? Math.max(
        0,
        input.capacities.mountTcgFolder - folderCopies(input.mount.tcgFolder)
      )
    : 0
  return main + extra
}

/** Capacidades usadas nas chegadas (REQ-159). */
export type TReceiveAllCapacities = Readonly<{
  inventory: number
  mountInventory: number
  tcgFolder: number
  mountTcgFolder: number
}>

export function receiveCapacitiesOf(
  config: TGameConfigValues,
  expansions?: TExpansions
): TReceiveAllCapacities {
  return {
    inventory: config.inventoryCapacity,
    mountInventory: config.mountInventorySlots,
    tcgFolder: capacitiesOf(config, expansions).tcgFolder,
    mountTcgFolder: config.mountFolderCapacity,
  }
}

/**
 * Uma chegada qualquer ao jogador (REQ-159): atributo → pasta e pasta extra;
 * equipamento/item → inventário e inventário extra. Não cabe → `null`.
 */
export function receiveCard(
  player: TPlayerState,
  card: TAttributeCard | TEquipmentCard | TItemCard,
  quantity: number,
  capacities: TReceiveAllCapacities
): { player: TPlayerState; received: TReceivedPart[] } | null {
  if (card.type === 'attribute') {
    const out = receiveAttribute({
      tcgFolder: player.tcgFolder,
      mount: player.mount,
      cardId: card.id,
      quantity,
      capacities,
    })
    if (out === null) return null
    return {
      player: { ...player, tcgFolder: out.tcgFolder, mount: out.mount },
      received: out.received,
    }
  }
  const out = receiveResource({
    inventory: player.inventory,
    mount: player.mount,
    card,
    quantity,
    capacities,
  })
  if (out === null) return null
  return {
    player: { ...player, inventory: out.inventory, mount: out.mount },
    received: out.received,
  }
}

/** As cartas de um espaço do jogador, como `{ cardId, copies }` (REQ-159). */
export function holdingsIn(
  player: Pick<TPlayerState, 'inventory' | 'tcgFolder' | 'mount'>,
  space: TReceiveSpace
): { cardId: string; copies: number }[] {
  const slots = (inventory: readonly TInventorySlot[]) =>
    inventory.map(({ cardId, quantity }) => ({ cardId, copies: quantity }))
  switch (space) {
    case 'inventory':
      return slots(player.inventory)
    case 'tcgFolder':
      return [...player.tcgFolder]
    case 'mountInventory':
      return slots(player.mount?.inventory ?? [])
    case 'mountTcgFolder':
      return [...(player.mount?.tcgFolder ?? [])]
    default: {
      const _exhaustive: never = space
      return _exhaustive
    }
  }
}

/**
 * Ajustar deck com a pasta extra (REQ-65, REQ-159): o que entra na build sai
 * primeiro da pasta extra e depois da pasta; o que sai da build vai à pasta e,
 * cheia, à pasta extra (em ordem de `cardId`). Sem montaria, só a pasta.
 * Passou de alguma capacidade → `null`.
 */
export function adjustFolders(input: {
  oldBuild: readonly TStarterDeckEntry[]
  tcgFolder: readonly TStarterDeckEntry[]
  mountTcgFolder: readonly TStarterDeckEntry[] | null
  newBuild: readonly TStarterDeckEntry[]
  capacities: Readonly<{ tcgFolder: number; mountTcgFolder: number }>
}): {
  tcgFolder: TStarterDeckEntry[]
  mountTcgFolder: TStarterDeckEntry[] | null
} | null {
  const countIn = (entries: readonly TStarterDeckEntry[]) =>
    new Map(entries.map(({ cardId, copies }) => [cardId, copies]))
  const before = countIn(input.oldBuild)
  const after = countIn(input.newBuild)
  const main = countIn(input.tcgFolder)
  const extra = countIn(input.mountTcgFolder ?? [])
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  )
  const leaving: [string, number][] = []
  for (const cardId of ids) {
    const delta = (after.get(cardId) ?? 0) - (before.get(cardId) ?? 0)
    if (delta > 0) {
      const fromExtra = Math.min(extra.get(cardId) ?? 0, delta)
      extra.set(cardId, (extra.get(cardId) ?? 0) - fromExtra)
      main.set(cardId, (main.get(cardId) ?? 0) - (delta - fromExtra))
    } else if (delta < 0) {
      leaving.push([cardId, -delta])
    }
  }
  const total = (counts: Map<string, number>) =>
    [...counts.values()].reduce((sum, copies) => sum + copies, 0)
  let room = Math.max(0, input.capacities.tcgFolder - total(main))
  for (const [cardId, copies] of leaving) {
    const toMain =
      input.mountTcgFolder === null ? copies : Math.min(room, copies)
    room -= Math.min(room, toMain)
    main.set(cardId, (main.get(cardId) ?? 0) + toMain)
    extra.set(cardId, (extra.get(cardId) ?? 0) + copies - toMain)
  }
  const entries = (counts: Map<string, number>) =>
    [...counts]
      .filter(([, copies]) => copies > 0)
      .map(([cardId, copies]) => ({ cardId, copies }))
      .sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0))
  if (
    total(main) > input.capacities.tcgFolder ||
    (input.mountTcgFolder !== null &&
      total(extra) > input.capacities.mountTcgFolder)
  )
    return null
  return {
    tcgFolder: entries(main),
    mountTcgFolder: input.mountTcgFolder === null ? null : entries(extra),
  }
}

export type TTransferMountRefusal =
  'noMount' | 'notOwned' | 'inventoryFull' | 'tcgFolderFull'

/**
 * Transferir para a montaria ou de volta (Apêndice B U1; REQ-160; D-143). Move
 * `quantity` cópias entre o inventário e o inventário extra, ou entre a pasta
 * e a pasta extra, com o estado do equipamento. Sem `inventorySlotIndex`, saem
 * primeiro as cópias de estado padrão, na ordem dos slots. `card` é a carta
 * citada (`null` se o catálogo não tem). Recusas na ordem do contrato.
 */
export function transferMount(input: {
  player: TPlayerState
  direction: 'toMount' | 'fromMount'
  space: 'inventory' | 'tcgFolder'
  cardId: string
  quantity: number
  inventorySlotIndex?: number
  card: TEquipmentCard | TItemCard | TAttributeCard | null
  capacities: TReceiveAllCapacities
}): Either<TTransferMountRefusal, TPlayerState> {
  const { player, direction, cardId, quantity, capacities } = input
  const mount = player.mount ?? null
  if (mount === null) return left('noMount')
  const toMount = direction === 'toMount'

  if (input.space === 'tcgFolder') {
    if (input.inventorySlotIndex !== undefined) return left('notOwned')
    const from = toMount ? player.tcgFolder : mount.tcgFolder
    const to = toMount ? mount.tcgFolder : player.tcgFolder
    const owned = from.find((entry) => entry.cardId === cardId)?.copies ?? 0
    if (owned < quantity) return left('notOwned')
    const capacity = toMount ? capacities.mountTcgFolder : capacities.tcgFolder
    if (folderCopies(to) + quantity > capacity) return left('tcgFolderFull')
    const nextFrom = from
      .map((entry) =>
        entry.cardId === cardId
          ? { cardId, copies: entry.copies - quantity }
          : entry
      )
      .filter(({ copies }) => copies > 0)
    const nextTo = addCopies(to, cardId, quantity)
    return right(
      toMount
        ? {
            ...player,
            tcgFolder: nextFrom,
            mount: { ...mount, tcgFolder: nextTo },
          }
        : {
            ...player,
            tcgFolder: nextTo,
            mount: { ...mount, tcgFolder: nextFrom },
          }
    )
  }

  const from = toMount ? player.inventory : mount.inventory
  const to = toMount ? mount.inventory : player.inventory
  const capacity = toMount ? capacities.mountInventory : capacities.inventory
  const card = input.card
  let picked: number[]
  if (input.inventorySlotIndex !== undefined) {
    const slot = from[input.inventorySlotIndex] as TInventorySlot | undefined
    if (quantity !== 1 || slot?.cardId !== cardId || card?.type !== 'equipment')
      return left('notOwned')
    picked = [input.inventorySlotIndex]
  } else {
    const indexes = from.flatMap((slot, i) =>
      slot.cardId === cardId ? [i] : []
    )
    const owned = indexes.reduce((sum, i) => sum + from[i].quantity, 0)
    if (
      owned < quantity ||
      (card?.type !== 'equipment' && card?.type !== 'item')
    )
      return left('notOwned')
    picked = [
      ...indexes.filter((i) => from[i].equipmentState === undefined),
      ...indexes.filter((i) => from[i].equipmentState !== undefined),
    ]
  }
  if (card?.type !== 'equipment' && card?.type !== 'item')
    return left('notOwned')

  if (stacksInInventory(card)) {
    const added = addToInventory(to, card, quantity, capacity)
    if (added === null) return left('inventoryFull')
    const remaining = from
      .map((slot) =>
        slot.cardId === cardId
          ? { cardId, quantity: slot.quantity - quantity }
          : slot
      )
      .filter((slot) => slot.quantity > 0)
    return right(placeInventories(player, mount, toMount, remaining, added))
  }
  const moving = picked.slice(0, quantity)
  if (freeSlots(to, capacity) < moving.length) return left('inventoryFull')
  const remaining = from.filter((_, i) => !moving.includes(i))
  const added = [...to, ...moving.map((i) => from[i])]
  return right(placeInventories(player, mount, toMount, remaining, added))
}

function placeInventories(
  player: TPlayerState,
  mount: TMountState,
  toMount: boolean,
  from: TInventorySlot[],
  to: TInventorySlot[]
): TPlayerState {
  return toMount
    ? { ...player, inventory: from, mount: { ...mount, inventory: to } }
    : { ...player, inventory: to, mount: { ...mount, inventory: from } }
}
