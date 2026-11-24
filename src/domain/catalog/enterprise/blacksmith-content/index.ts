import {
  checkEffects,
  type TEffectIssueReason,
} from '@/domain/catalog/enterprise/effect-rules'
import type {
  TAbility,
  TCard,
  TEquipmentCard,
  TItemCard,
  TMaterialRequirement,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TEffect } from '@/domain/catalog/enterprise/value-objects/effect'

/**
 * Regras de conteúdo do ferreiro (REQ-145, README 3.4, 5.1, 5.2, 25): refino
 * e encantamento do equipamento, receita do documento e encantamentos da
 * zona. Chamadas por `checkCatalogIntegrity`; as cartas citadas são
 * procuradas em `cardsById`.
 */

export type TBlacksmithIssueReason =
  | 'refinementMaterialsRequired'
  | 'materialNotMaterial'
  | 'duplicateMaterial'
  | 'minRefinementAboveMax'
  | 'recipeNotAllowed'
  | 'recipeEquipmentInvalid'
  | 'blacksmithMismatch'
  | 'duplicateEnchantment'
  | 'enemyOnlyAbility'
  | 'unknownCard'
  | 'outOfRange'
  | 'empty'
  | TEffectIssueReason

type TReport = (field: string, reason: TBlacksmithIssueReason) => void
type TCards = ReadonlyMap<string, TCard>

function isIntegerBetween(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

/** `materials` de refino, receita ou encantamento (D-129). */
function checkMaterials(
  materials: readonly TMaterialRequirement[],
  path: string,
  cardsById: TCards,
  report: TReport
): void {
  const seen = new Set<string>()
  materials.forEach(({ cardId, quantity }, index) => {
    const entry = `${path}.${index}`
    const cited = cardsById.get(cardId)
    if (!cited) report(`${entry}.cardId`, 'unknownCard')
    else if (cited.type !== 'item' || cited.itemCategory !== 'material') {
      report(`${entry}.cardId`, 'materialNotMaterial')
    } else if (seen.has(cardId)) report(`${entry}.cardId`, 'duplicateMaterial')
    seen.add(cardId)
    if (!isIntegerBetween(quantity, 1, Infinity)) {
      report(`${entry}.quantity`, 'outOfRange')
    }
  })
}

/** README 25.2, 25.3: materiais do refino e slots de encantamento. */
export function checkEquipmentForge(
  card: TEquipmentCard,
  cardsById: TCards,
  report: TReport
): void {
  if (card.refinement) {
    if (!isIntegerBetween(card.refinement.maxLevel, 1, 10)) {
      report('refinement.maxLevel', 'outOfRange')
    }
    // D-135: lista vazia (conteúdo legado) só bloqueia publicar.
    checkMaterials(
      card.refinement.materials,
      'refinement.materials',
      cardsById,
      report
    )
  }

  if (card.enchantment) {
    const { slots } = card.enchantment
    if (slots.length === 0) report('enchantment.slots', 'empty')
    const maxLevel = card.refinement?.maxLevel ?? 0
    slots.forEach(({ minRefinement }, index) => {
      const path = `enchantment.slots.${index}.minRefinement`
      if (!isIntegerBetween(minRefinement, 0, 10)) report(path, 'outOfRange')
      else if (minRefinement > maxLevel) report(path, 'minRefinementAboveMax')
    })
  }
}

/** README 5.2: só o documento tem receita. */
export function checkRecipe(
  card: TItemCard,
  cardsById: TCards,
  report: TReport
): void {
  const { recipe } = card
  if (recipe === null) return
  if (card.itemCategory !== 'document') {
    report('recipe', 'recipeNotAllowed')
    return
  }
  if (cardsById.get(recipe.equipmentId)?.type !== 'equipment') {
    report('recipe.equipmentId', 'recipeEquipmentInvalid')
  }
  if (!isIntegerBetween(recipe.gold, 0, Infinity)) {
    report('recipe.gold', 'outOfRange')
  }
  checkMaterials(recipe.materials, 'recipe.materials', cardsById, report)
}

/** README 17.5: efeitos que quebram equipamento são só de inimigos. */
function breaksEquipment(effects: readonly TEffect[]): boolean {
  return effects.some(({ activation }) =>
    activation.some(({ kind }) => kind === 'breakEquipment')
  )
}

function isEnemyOnly(ability: TAbility): boolean {
  return ability.id !== undefined && breaksEquipment(ability.effects)
}

/** README 3.4, 25.3: o ferreiro da zona e a lista de encantamentos. */
export function checkBlacksmith(
  card: TZoneCard,
  cardsById: TCards,
  report: TReport
): void {
  if (
    (card.blacksmith !== null) !==
    card.zoneActions.includes('visitBlacksmith')
  ) {
    report('blacksmith', 'blacksmithMismatch')
  }

  const ids = new Set<string>()
  card.blacksmith?.enchantments.forEach((enchantment, index) => {
    const path = `blacksmith.enchantments.${index}`
    if (ids.has(enchantment.id)) report(`${path}.id`, 'duplicateEnchantment')
    ids.add(enchantment.id)

    if (enchantment.materials.length === 0) report(`${path}.materials`, 'empty')
    else
      checkMaterials(
        enchantment.materials,
        `${path}.materials`,
        cardsById,
        report
      )

    if (enchantment.kind === 'element') {
      if (!isIntegerBetween(enchantment.bonusPercent, 1, 100)) {
        report(`${path}.bonusPercent`, 'outOfRange')
      }
      return
    }

    if (enchantment.effects.length + enchantment.abilities.length === 0) {
      report(`${path}.effects`, 'empty')
    }
    checkEffects(
      { type: 'specialization', effects: enchantment.effects },
      (field, reason) => report(`${path}.${field}`, reason)
    )
    enchantment.effects.forEach((effect, effectIndex) => {
      if (breaksEquipment([effect])) {
        report(`${path}.effects.${effectIndex}`, 'enemyOnlyAbility')
      }
    })
    enchantment.abilities.forEach((ability, abilityIndex) => {
      if (isEnemyOnly(ability)) {
        report(`${path}.abilities.${abilityIndex}`, 'enemyOnlyAbility')
      }
    })
  })
}
