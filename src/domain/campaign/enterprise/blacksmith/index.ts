import { type Either, left, right } from '@/core/error/either'
import type { SeededRng } from '@/core/rng/seeded-rng'
import {
  EQUIPMENT_SLOTS,
  type TBlacksmithEnchantment,
  type TCard,
  type TEquipmentCard,
  type TItemCard,
  type TMaterialRequirement,
  type TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import type { TPlayerState } from '../entities/party-member'
import {
  copySlot,
  DEFAULT_EQUIPMENT_STATE,
  type TEquipmentState,
  withWornState,
  wornStateOf,
} from '../equipment-state'
import type { TInventorySlot } from '../inventory'
import type { TBlacksmithOperation, TEquipmentTarget } from '../party-action'

/**
 * Ir ao Ferreiro (README 12.2, 25; REQ-149, REQ-150, REQ-152; D-132, D-138).
 * Valores inteiros vindos da configuração; o lote é conferido inteiro sem
 * rolar, supondo sucesso das anteriores, e depois executado em ordem.
 */

type TCards = ReadonlyMap<string, TCard>
type TRng = Pick<SeededRng, 'nextInt'>

export type TBlacksmithOperationResult =
  | {
      operation: 'repair'
      target: TEquipmentTarget
      cardId: string
      gold: number
      repairMarks: number
      skipped: boolean
    }
  | {
      operation: 'refine'
      target: TEquipmentTarget
      cardId: string
      targetLevel: number
      gold: number
      roll: number | null
      d20Bonus: number
      threshold: number
      success: boolean
      broke: boolean
      skipped: boolean
    }
  | {
      operation: 'craft'
      recipeCardId: string
      equipmentId: string
      gold: number
      inventorySlotIndex: number
      skipped: boolean
    }

/** Resultado do Ir ao Ferreiro aceito (REQ-149). */
export type TBlacksmithVisitResult = Readonly<{
  source: 'blacksmith'
  zoneId: string
  actionPointsSpent: number
  results: readonly TBlacksmithOperationResult[]
}>

export type TBlacksmithRefusalReason =
  | 'equipmentNotFound'
  | 'notBroken'
  | 'equipmentBroken'
  | 'notRefinable'
  | 'refinementMaterialsMissing'
  | 'refineLevelMax'
  | 'enchantmentNotOffered'
  | 'materialsMissing'
  | 'notEnoughGold'
  | 'notInInventory'
  | 'recipeMissing'
  | 'inventoryFull'

export type TBlacksmithRefusal = Readonly<{
  reason: TBlacksmithRefusalReason
  /** Índice da primeira operação recusada (a partir de 0). */
  operationIndex: number
  cardId?: string
}>

/** Custo do conserto (README 25.1): base + por nível × refino. */
export const repairGold = (
  config: TGameConfigValues,
  refinement: number
): number => config.repairBaseGold + config.repairGoldPerLevel * refinement

/** Limiar do D20 pela faixa do nível desejado (README 25.2); 0 = sem rolagem. */
export function refineThreshold(
  config: TGameConfigValues,
  targetLevel: number
): number {
  if (targetLevel <= 3) return config.refineThreshold1to3
  if (targetLevel <= 6) return config.refineThreshold4to6
  if (targetLevel <= 9) return config.refineThreshold7to9
  return config.refineThreshold10
}

/** Artífice ativo (D-133): a classe com a trava cumprida. */
export const artificerActive = (player: Pick<TPlayerState, 'playerClasses'>) =>
  player.playerClasses.some(
    ({ playerClass, deckLockMet }) => playerClass === 'artificer' && deckLockMet
  )

/** Slot do inventário com a posição que tinha antes do lote (`null` = criado no lote). */
type TTrackedSlot = Readonly<{ origin: number | null; slot: TInventorySlot }>

type TWork = {
  player: TPlayerState
  inventory: TTrackedSlot[]
  gold: number
}

function materialCount(inventory: readonly TTrackedSlot[], cardId: string) {
  return inventory
    .filter(({ slot }) => slot.cardId === cardId)
    .reduce((sum, { slot }) => sum + slot.quantity, 0)
}

const hasMaterials = (
  inventory: readonly TTrackedSlot[],
  materials: readonly TMaterialRequirement[]
) =>
  materials.every(
    ({ cardId, quantity }) => materialCount(inventory, cardId) >= quantity
  )

/** Tira as cópias na ordem dos slots; o slot que zera sai. */
function consume(
  inventory: readonly TTrackedSlot[],
  materials: readonly TMaterialRequirement[]
): TTrackedSlot[] {
  let result = [...inventory]
  for (const { cardId, quantity } of materials) {
    let left = quantity
    result = result.flatMap((entry) => {
      if (left === 0 || entry.slot.cardId !== cardId) return [entry]
      const taken = Math.min(left, entry.slot.quantity)
      left -= taken
      const remaining = entry.slot.quantity - taken
      return remaining > 0
        ? [{ ...entry, slot: { ...entry.slot, quantity: remaining } }]
        : []
    })
  }
  return result
}

type TTargetFound = Readonly<{
  card: TEquipmentCard
  state: TEquipmentState
  write: (work: TWork, state: TEquipmentState) => void
}>

function findTarget(
  work: TWork,
  target: TEquipmentTarget,
  cards: TCards
): TTargetFound | null {
  switch (target.location) {
    case 'equipment': {
      const cardId = work.player.equipment[target.slot]
      const card = cardId === null ? undefined : cards.get(cardId)
      if (card?.type !== 'equipment') return null
      return {
        card,
        state: wornStateOf(work.player, target.slot),
        write: (w, state) => {
          w.player = withWornState(w.player, target.slot, state)
        },
      }
    }
    case 'inventory': {
      const entry = work.inventory.find(
        ({ origin }) => origin === target.inventorySlotIndex
      )
      const card = entry ? cards.get(entry.slot.cardId) : undefined
      if (!entry || card?.type !== 'equipment') return null
      return {
        card,
        state: entry.slot.equipmentState ?? DEFAULT_EQUIPMENT_STATE,
        write: (w, state) => {
          w.inventory = w.inventory.map((tracked) => {
            if (tracked.origin !== target.inventorySlotIndex) return tracked
            return {
              ...tracked,
              slot: copySlot(tracked.slot.cardId, state),
            }
          })
        },
      }
    }
    default: {
      const _exhaustive: never = target
      return _exhaustive
    }
  }
}

/** A operação pronta para aplicar, ou o motivo da recusa. */
type TPlanned =
  | { reason: TBlacksmithRefusalReason; cardId?: string }
  | {
      reason: null
      apply: (rng: TRng | null) => TBlacksmithOperationResult
      skipped: () => TBlacksmithOperationResult
      /** Nível desejado de um `refine`. */
      targetLevel?: number
    }

function plan(
  work: TWork,
  operation: TBlacksmithOperation,
  input: Readonly<{
    config: TGameConfigValues
    cards: TCards
    d20Bonus: number
  }>
): TPlanned {
  const { config, cards } = input
  switch (operation.operation) {
    case 'repair': {
      const found = findTarget(work, operation.target, cards)
      if (!found) return { reason: 'equipmentNotFound' }
      const { card, state, write } = found
      if (!state.broken) return { reason: 'notBroken', cardId: card.id }
      const cost = repairGold(config, state.refinement)
      if (work.gold < cost) return { reason: 'notEnoughGold', cardId: card.id }
      const base = {
        operation: 'repair' as const,
        target: operation.target,
        cardId: card.id,
      }
      return {
        reason: null,
        apply: () => {
          const repairMarks = state.repairMarks + 1
          work.gold -= cost
          write(work, { ...state, broken: false, repairMarks })
          return { ...base, gold: -cost, repairMarks, skipped: false }
        },
        skipped: () => ({
          ...base,
          gold: 0,
          repairMarks: state.repairMarks,
          skipped: true,
        }),
      }
    }
    case 'refine': {
      const found = findTarget(work, operation.target, cards)
      if (!found) return { reason: 'equipmentNotFound' }
      const { card, state, write } = found
      const cardId = card.id
      if (state.broken) return { reason: 'equipmentBroken', cardId }
      if (card.refinement === null) return { reason: 'notRefinable', cardId }
      const { materials, maxLevel } = card.refinement
      if (materials.length === 0)
        return { reason: 'refinementMaterialsMissing', cardId }
      if (state.refinement >= maxLevel)
        return { reason: 'refineLevelMax', cardId }
      if (!hasMaterials(work.inventory, materials))
        return { reason: 'materialsMissing', cardId }
      const targetLevel = state.refinement + 1
      const cost = config.refineGoldPerLevel * targetLevel
      if (work.gold < cost) return { reason: 'notEnoughGold', cardId }
      const threshold = refineThreshold(config, targetLevel)
      const base = {
        operation: 'refine' as const,
        target: operation.target,
        cardId,
        targetLevel,
        d20Bonus: input.d20Bonus,
        threshold,
      }
      return {
        reason: null,
        targetLevel,
        apply: (rng) => {
          work.gold -= cost
          work.inventory = consume(work.inventory, materials)
          // Na conferência (sem RNG) supõe sucesso (D-132).
          const roll = threshold > 0 && rng ? rng.nextInt(1, 20) : null
          const success = roll === null || roll + input.d20Bonus >= threshold
          const broke = !success && targetLevel >= config.refineBreakFromLevel
          if (success) write(work, { ...state, refinement: targetLevel })
          else if (broke) write(work, { ...state, broken: true })
          return { ...base, gold: -cost, roll, success, broke, skipped: false }
        },
        skipped: () => ({
          ...base,
          gold: 0,
          roll: null,
          success: false,
          broke: false,
          skipped: true,
        }),
      }
    }
    case 'enchant': {
      // Encantar entra na T-70 (D-138): por ora, nenhum encantamento é oferecido.
      const found = findTarget(work, operation.target, cards)
      if (!found) return { reason: 'equipmentNotFound' }
      const cardId = found.card.id
      if (found.state.broken) return { reason: 'equipmentBroken', cardId }
      return { reason: 'enchantmentNotOffered', cardId }
    }
    case 'craft': {
      const entry = work.inventory.find(
        ({ origin }) => origin === operation.inventorySlotIndex
      )
      if (!entry) return { reason: 'notInInventory' }
      const recipeCard = cards.get(entry.slot.cardId)
      const recipeCardId = entry.slot.cardId
      const recipe = recipeCard?.type === 'item' ? recipeCard.recipe : null
      const equipment = recipe ? cards.get(recipe.equipmentId) : undefined
      if (
        !recipe ||
        recipeCard?.type !== 'item' ||
        recipeCard.itemCategory !== 'document' ||
        equipment?.type !== 'equipment'
      )
        return { reason: 'recipeMissing', cardId: recipeCardId }
      if (!hasMaterials(work.inventory, recipe.materials))
        return { reason: 'materialsMissing', cardId: recipeCardId }
      if (work.gold < recipe.gold)
        return { reason: 'notEnoughGold', cardId: recipeCardId }
      const after = afterCraft(work.inventory, entry, recipe)
      if (after.length >= input.config.inventoryCapacity)
        return { reason: 'inventoryFull', cardId: recipeCardId }
      const base = {
        operation: 'craft' as const,
        recipeCardId,
        equipmentId: equipment.id,
      }
      return {
        reason: null,
        apply: () => {
          work.gold -= recipe.gold
          work.inventory = [
            ...afterCraft(work.inventory, entry, recipe),
            { origin: null, slot: { cardId: equipment.id, quantity: 1 } },
          ]
          return {
            ...base,
            gold: -recipe.gold,
            inventorySlotIndex: work.inventory.length - 1,
            skipped: false,
          }
        },
        skipped: () => ({
          ...base,
          gold: 0,
          inventorySlotIndex: operation.inventorySlotIndex,
          skipped: true,
        }),
      }
    }
    default: {
      const _exhaustive: never = operation
      return _exhaustive
    }
  }
}

function afterCraft(
  inventory: readonly TTrackedSlot[],
  recipeEntry: TTrackedSlot,
  recipe: NonNullable<TItemCard['recipe']>
): TTrackedSlot[] {
  const consumed = consume(inventory, recipe.materials)
  return recipe.consumed
    ? consumed.filter((entry) => entry.origin !== recipeEntry.origin)
    : consumed
}

const startWork = (player: TPlayerState): TWork => ({
  player,
  inventory: player.inventory.map((slot, origin) => ({ origin, slot })),
  gold: player.gold,
})

/**
 * Aplica o lote do Ir ao Ferreiro (REQ-149; D-132). 1º passo: confere tudo em
 * ordem, sem RNG, supondo sucesso; a primeira recusa devolve o índice e nada
 * muda. 2º passo: executa em ordem, rolando 1 D20 por refino com limiar > 0; a
 * operação que ficou impossível por uma falha anterior (ou o refino cujo nível
 * desejado mudou) sai `skipped`, sem custo.
 */
export function applyBlacksmithOperations(input: {
  player: TPlayerState
  config: TGameConfigValues
  cards: TCards
  operations: readonly TBlacksmithOperation[]
  zoneId: string
  actionPointsSpent: number
  rng: TRng
}): Either<
  TBlacksmithRefusal,
  { player: TPlayerState; result: TBlacksmithVisitResult }
> {
  const { config, cards, operations } = input
  const d20Bonus = artificerActive(input.player) ? config.artificerD20Bonus : 0
  const context = { config, cards, d20Bonus }

  const check = startWork(input.player)
  const checked: Extract<TPlanned, { reason: null }>[] = []
  for (const [operationIndex, operation] of operations.entries()) {
    const planned = plan(check, operation, context)
    if (planned.reason !== null) {
      return left({
        reason: planned.reason,
        operationIndex,
        ...(planned.cardId !== undefined && { cardId: planned.cardId }),
      })
    }
    checked.push(planned)
    planned.apply(null)
  }

  const work = startWork(input.player)
  const results = operations.map((operation, i) => {
    const planned = plan(work, operation, context)
    if (
      planned.reason !== null ||
      planned.targetLevel !== checked[i].targetLevel
    )
      return checked[i].skipped()
    return planned.apply(input.rng)
  })

  return right({
    player: {
      ...work.player,
      inventory: work.inventory.map(({ slot }) => slot),
      gold: work.gold,
    },
    result: {
      source: 'blacksmith',
      zoneId: input.zoneId,
      actionPointsSpent: input.actionPointsSpent,
      results,
    },
  })
}

export type TRefineStep = Readonly<{
  targetLevel: number
  materials: readonly TMaterialRequirement[]
  gold: number
  threshold: number
  d20Bonus: number
  breaksOnFailure: boolean
}>

export type TServiceEquipment = Readonly<{
  target: TEquipmentTarget
  cardId: string
  state: TEquipmentState
  repair: { gold: number } | null
  refineSteps: readonly TRefineStep[]
  enchantOptions: readonly {
    enchantmentId: string
    replaceRequired: boolean
    extra: boolean
    requiresRefinement: number
  }[]
}>

export type TBlacksmithView = Readonly<{
  zoneId: string | null
  blacksmith: Readonly<{ equipment: readonly TServiceEquipment[] }> | null
  workshop: Readonly<{ equipment: readonly TServiceEquipment[] }> | null
  enchantments: readonly {
    enchantment: TBlacksmithEnchantment
    gold: number
    threshold: number
  }[]
  recipes: readonly {
    inventorySlotIndex: number
    cardId: string
    equipmentId: string
    materials: readonly TMaterialRequirement[]
    gold: number
    consumed: boolean
    canCraft: boolean
  }[]
}>

/** Cada nível seguinte até o máximo, supondo os anteriores alcançados (REQ-149). */
function refineStepsOf(
  config: TGameConfigValues,
  card: TEquipmentCard,
  state: TEquipmentState,
  d20Bonus: number
): TRefineStep[] {
  if (state.broken || card.refinement === null) return []
  const { maxLevel, materials } = card.refinement
  if (materials.length === 0) return []
  const steps: TRefineStep[] = []
  for (let level = state.refinement + 1; level <= maxLevel; level++) {
    steps.push({
      targetLevel: level,
      materials,
      gold: config.refineGoldPerLevel * level,
      threshold: refineThreshold(config, level),
      d20Bonus,
      breaksOnFailure: level >= config.refineBreakFromLevel,
    })
  }
  return steps
}

/**
 * Projeção do ferreiro para o membro da vez numa zona com `visitBlacksmith`
 * (REQ-149). A Oficina (`workshop`) e as opções de encantamento entram nas
 * T-71 e T-70 (D-138).
 */
export function describeBlacksmith(input: {
  config: TGameConfigValues
  player: TPlayerState
  cards: TCards
  zone: TZoneCard
}): TBlacksmithView | null {
  const { config, player, cards, zone } = input
  if (!zone.zoneActions.includes('visitBlacksmith') || !zone.blacksmith)
    return null
  const d20Bonus = artificerActive(player) ? config.artificerD20Bonus : 0
  const service = (
    target: TEquipmentTarget,
    card: TEquipmentCard,
    state: TEquipmentState
  ): TServiceEquipment => ({
    target,
    cardId: card.id,
    state,
    repair: state.broken
      ? { gold: repairGold(config, state.refinement) }
      : null,
    refineSteps: refineStepsOf(config, card, state, d20Bonus),
    enchantOptions: [],
  })
  const equipment: TServiceEquipment[] = []
  for (const slot of EQUIPMENT_SLOTS) {
    const cardId = player.equipment[slot]
    const card = cardId === null ? undefined : cards.get(cardId)
    if (card?.type === 'equipment')
      equipment.push(
        service(
          { location: 'equipment', slot },
          card,
          wornStateOf(player, slot)
        )
      )
  }
  const inventory = player.inventory.map((slot, origin) => ({ origin, slot }))
  for (const { origin, slot } of inventory) {
    const card = cards.get(slot.cardId)
    if (card?.type === 'equipment')
      equipment.push(
        service(
          { location: 'inventory', inventorySlotIndex: origin },
          card,
          slot.equipmentState ?? DEFAULT_EQUIPMENT_STATE
        )
      )
  }
  const recipes = inventory.flatMap(({ origin, slot }) => {
    const card = cards.get(slot.cardId)
    if (
      card?.type !== 'item' ||
      card.itemCategory !== 'document' ||
      !card.recipe
    )
      return []
    const { equipmentId, materials, gold, consumed } = card.recipe
    return [
      {
        inventorySlotIndex: origin,
        cardId: card.id,
        equipmentId,
        materials,
        gold,
        consumed,
        canCraft: hasMaterials(inventory, materials) && player.gold >= gold,
      },
    ]
  })
  return {
    zoneId: zone.id,
    blacksmith: { equipment },
    workshop: null,
    enchantments: zone.blacksmith.enchantments.map((enchantment) => ({
      enchantment,
      gold:
        enchantment.kind === 'element'
          ? config.enchantElementGold
          : config.enchantEffectGold,
      threshold:
        enchantment.kind === 'element'
          ? config.enchantElementThreshold
          : config.enchantEffectThreshold,
    })),
    recipes,
  }
}
