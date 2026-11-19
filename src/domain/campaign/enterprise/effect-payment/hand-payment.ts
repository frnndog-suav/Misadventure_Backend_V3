import type {
  TAttribute,
  TCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { THandRequirement } from '@/domain/catalog/enterprise/value-objects/effect'
import { ATTRIBUTES } from '@/domain/catalog/enterprise/value-objects/card'

const ATTRIBUTE_NAMES: Record<TAttribute, string> = {
  strength: 'Força',
  dexterity: 'Destreza',
  endurance: 'Resistência',
  intelligence: 'Inteligência',
  wisdom: 'Sabedoria',
  charisma: 'Carisma',
  spirit: 'Espírito',
  sanity: 'Sanidade',
  luck: 'Sorte',
}

function joinInPortuguese(parts: readonly string[]): string {
  if (parts.length < 2) return parts.join('')
  return parts.slice(0, -1).join(', ') + ' e ' + parts.at(-1)
}

export function describeHandPayment(costs: readonly THandRequirement[]): {
  count: number
  text: string
} | null {
  const parts: string[] = []
  let count = 0
  for (const cost of costs) {
    if (cost.random) continue
    for (const [index, requirement] of cost.requirements.entries()) {
      const { count: quantity, attribute } = requirement
      count += quantity
      let part = quantity === 1 ? '1 carta' : `${quantity} cartas`
      part +=
        attribute === 'any'
          ? quantity === 1
            ? ' qualquer'
            : ' quaisquer'
          : ` de ${ATTRIBUTE_NAMES[attribute]}`
      if (index === cost.requirements.length - 1) {
        if (cost.excludeAttributes.length > 0) {
          part += ` (exceto ${joinInPortuguese(cost.excludeAttributes.map((key) => ATTRIBUTE_NAMES[key]))})`
        }
        if (cost.constraint === 'same') part += ' do mesmo atributo'
        if (cost.constraint === 'distinct') part += ' de atributos diferentes'
      }
      parts.push(part)
    }
  }
  return count === 0
    ? null
    : { count, text: `Escolha ${joinInPortuguese(parts)}.` }
}

export function handCount(cost: THandRequirement): number {
  return cost.requirements.reduce(
    (sum, requirement) => sum + requirement.count,
    0
  )
}

/** Procura uma atribuição válida, inclusive para cartas com dois atributos. */
export function* matchingHands(
  cost: THandRequirement,
  hand: readonly string[],
  catalog: ReadonlyMap<string, TCard>
): Generator<string[]> {
  const count = handCount(cost)
  if (
    count > hand.length ||
    (cost.constraint === 'distinct' && count > ATTRIBUTES.length)
  )
    return

  const attributesByCard = hand.map((id) => {
    const card = catalog.get(id)
    if (card?.type !== 'attribute') return []
    if (card.attributes.some((attr) => cost.excludeAttributes.includes(attr)))
      return []
    return card.attributes
  })
  const requiredByAttribute = new Map<TAttribute | 'any', number>()
  for (const { attribute, count } of cost.requirements) {
    requiredByAttribute.set(
      attribute,
      (requiredByAttribute.get(attribute) ?? 0) + count
    )
  }
  const requirements = [...requiredByAttribute].map(([attribute, count]) => ({
    attribute,
    count,
    candidates: attributesByCard.filter((attributes) =>
      attribute === 'any'
        ? attributes.length > 0
        : attributes.includes(attribute)
    ).length,
  }))
  if (requirements.some(({ count, candidates }) => count > candidates)) return
  requirements.sort(
    (a, b) =>
      Number(a.attribute === 'any') - Number(b.attribute === 'any') ||
      a.candidates - b.candidates
  )
  const slots = requirements.flatMap(({ attribute, count }) =>
    Array<TAttribute | 'any'>(count).fill(attribute)
  )
  const used = new Set<number>()
  const assigned = new Set<TAttribute>()
  const selection: string[] = []
  const yielded = new Set<string>()

  function* choose(index: number, start: number): Generator<string[]> {
    if (index === count) {
      const key = JSON.stringify([...selection].sort())
      if (!yielded.has(key)) {
        yielded.add(key)
        yield [...selection]
      }
      return
    }
    const requirement = slots[index]
    const seen = new Set<string>()
    for (let position = start; position < hand.length; position++) {
      const id = hand[position]
      if (used.has(position) || seen.has(id)) continue
      seen.add(id)
      const attributes = attributesByCard[position].filter(
        (attribute) => requirement === 'any' || requirement === attribute
      )
      for (const attribute of attributes) {
        if (cost.constraint === 'distinct' && assigned.has(attribute)) continue
        if (
          cost.constraint === 'same' &&
          assigned.size > 0 &&
          !assigned.has(attribute)
        )
          continue
        used.add(position)
        const added = !assigned.has(attribute)
        assigned.add(attribute)
        selection.push(id)
        yield* choose(
          index + 1,
          slots[index + 1] === requirement ? position + 1 : 0
        )
        selection.pop()
        if (added) assigned.delete(attribute)
        used.delete(position)
        if (cost.constraint === 'none') break
      }
    }
  }
  yield* choose(0, 0)
}
