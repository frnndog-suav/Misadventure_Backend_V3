import type { RngState, SeededRng } from '@/core/rng/seeded-rng'
import type {
  TCombatEventCard,
  TElement,
  TEquipmentSlot,
  TEnemyBehavior,
  TExecutableAbility,
  TModifier,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import type {
  TEffect,
  TQuantity,
  TTrigger,
} from '@/domain/catalog/enterprise/value-objects/effect'
import { effectiveModifiers } from '../effective-modifiers'
import type { TPaymentRefusal } from '../effect-payment'
import type { TPlayerState } from '../entities/party-member'
import { capacitiesOf } from '../markets'
import {
  abilityEffectDuration,
  abilityEffectStatus,
  applyAbilityEffect,
} from './abilities'
import {
  combatStatusesAfterTurn,
  statusesAfterAbility,
  type TPlayerStatus,
} from '../player-status'

export type TCombatRefusal =
  | 'combatInProgress'
  | 'choicePending'
  | 'staleCombat'
  | 'staleCombatTurn'
  | 'wrongCombatPhase'
  | 'combatTargetUnavailable'
  | 'combatAbilityUnavailable'
  | TPaymentRefusal['reason']
  | 'notActivatable'
  | 'playerDown'
  | 'escapeForbidden'

type Participant = {
  id: string
  side: 'player' | 'enemy'
  celerity: number
  health: number
}

function cycleOrder(participants: readonly Participant[]): string[] {
  return participants
    .filter(({ health }) => health > 0)
    .sort(
      (a, b) =>
        b.celerity - a.celerity ||
        Number(b.side === 'enemy') - Number(a.side === 'enemy')
    )
    .map(({ id }) => id)
}

export function advanceCombatTurn(input: {
  cycle: number
  order: readonly string[]
  actorId: string
  participants: readonly Participant[]
}) {
  const { cycle, order, actorId, participants } = input
  const living = new Set(
    participants.filter(({ health }) => health > 0).map(({ id }) => id)
  )
  const next = order
    .slice(order.indexOf(actorId) + 1)
    .find((id) => living.has(id))
  if (next !== undefined) return { cycle, order, actorId: next }
  const nextOrder = cycleOrder(participants)
  return { cycle: cycle + 1, order: nextOrder, actorId: nextOrder[0] ?? null }
}

const advantages: Record<TElement, readonly TElement[]> = {
  earth: ['electric', 'sonic', 'air'],
  water: ['fire', 'toxic', 'earth'],
  fire: ['frost', 'cosmic'],
  air: ['toxic', 'fire'],
  frost: ['water', 'organic'],
  electric: ['water', 'air'],
  organic: ['earth', 'water'],
  toxic: ['organic', 'blood'],
  arcane: ['draconic', 'spiritual', 'cosmic'],
  dark: ['psychic', 'arcane'],
  celestial: ['dark', 'toxic'],
  draconic: ['organic', 'frost'],
  cosmic: ['electric', 'celestial'],
  sonic: ['psychic', 'frost'],
  psychic: ['blood', 'spiritual', 'arcane'],
  blood: ['celestial', 'draconic', 'sonic'],
  spiritual: ['blood', 'dark'],
}

type DamageTarget = {
  id: string
  health: number
  defense: number
  evasion: number
  reflection: number
  element: TElement | null
  resistant: boolean
  immune: boolean
  shield: boolean
  vulnerable?: boolean
}

type DamageInput = {
  targets: readonly DamageTarget[]
  element: TElement | null
  config: TGameConfigValues
  /** Uniforme em [0, 1), fornecido pelo RNG do agregado. */
  roll: () => number
  elemental?: {
    inverted: boolean
    ignoreDisadvantage: boolean
    advantagePercent: number | undefined
  }
} & (
  | { kind: 'effect'; amount: number }
  | {
      kind: 'attack'
      form: 'basic' | 'targeted' | 'projectile' | 'area'
      attack: number
      accuracy: number
      piercing: number
      projectileAccuracyIncluded?: boolean
    }
)

export function resolveCombatDamage(input: DamageInput) {
  const { targets, element, config, roll } = input
  const accuracy =
    input.kind === 'attack'
      ? input.accuracy *
        (input.form === 'projectile' && !input.projectileAccuracyIncluded
          ? 1 + config.projectileAccuracyBonusPercent / 100
          : 1)
      : 0
  return targets
    .filter(({ health }) => health > 0)
    .map((target) => {
      const hit =
        input.kind === 'effect'
          ? null
          : input.form === 'area' ||
            (input.accuracy > 0 &&
              roll() < accuracy / (accuracy + target.evasion))
      if (hit === false)
        return { targetId: target.id, hit, damage: 0, reflectedDamage: 0 }

      let damage: number
      if (input.kind === 'effect') {
        damage = input.amount
      } else {
        damage = Math.max(
          0,
          input.attack - Math.max(0, target.defense - input.piercing)
        )
        if (input.form === 'area') damage *= config.areaDamagePercent / 100
        if (input.form === 'projectile' && target.shield)
          damage *= config.shieldProjectileDamagePercent / 100
      }
      if (element !== null) {
        if (target.immune) damage = 0
        if (target.resistant) damage /= 2
        const relation = elementalRelation(
          element,
          target.element,
          input.elemental?.inverted
        )
        if (relation === 1 || target.vulnerable)
          damage *=
            (100 +
              (input.elemental?.advantagePercent ??
                config.elementAdvantageBonusPercent)) /
            100
        else if (relation === -1 && !input.elemental?.ignoreDisadvantage)
          damage *= (100 - config.elementDisadvantagePenaltyPercent) / 100
      }
      const rounded = Math.floor(damage)
      const reflectedDamage =
        input.kind === 'attack' ? Math.min(rounded, target.reflection) : 0
      return {
        targetId: target.id,
        hit,
        damage: rounded - reflectedDamage,
        reflectedDamage,
      }
    })
}

function elementalRelation(
  element: TElement,
  target: TElement | null,
  inverted = false
) {
  if (target === null) return 0
  const relation = advantages[element].includes(target)
    ? 1
    : advantages[target].includes(element)
      ? -1
      : 0
  return inverted ? -relation : relation
}

function elementalRules(statuses: readonly TPlayerStatus[]) {
  const entries = statuses.flatMap(({ activation }) => activation)
  return {
    inverted: entries.some(({ kind }) => kind === 'invertElementalRelations'),
    ignoreDisadvantage: entries.some(
      ({ kind }) => kind === 'ignoreElementalDisadvantage'
    ),
    advantagePercent: entries.findLast(
      (entry) => entry.kind === 'elementalAdvantageOverride'
    )?.percent,
  }
}

type CombatEnemy = {
  id: string
  blockIndex: number
  copyIndex: number
  health: number
  maxHealth: number
  vigor: number | null
  element: TElement | null
  effectiveModifiers: Readonly<Record<TModifier, number>>
  statuses: readonly TPlayerStatus[]
  skippedTurns?: number
}

export type TCombatState = {
  id: string
  card: TCombatEventCard
  memberId: string
  cycle: number
  maxCycles: number
  order: readonly string[]
  turn: {
    id: string
    actorId: string
    phase: 'prepare' | 'attack'
    attacksRemaining: number
    enemyAbilitiesResolved?: number
  }
  enemies: readonly CombatEnemy[]
  abilityUsage?: readonly CombatAbilityUsage[]
  actedThisCycle?: readonly string[]
}

type CombatAbilityUsage = {
  actorId: string
  equipmentSlot: TEquipmentSlot | null
  abilityId: string
  sourceCardId: string
  element: TElement | null
  uses: number
  cooldown: number
  charges: number | null
  channelHealth: number | null
  activeUntilCycle: number | null
}

export type TCombatUpdate = { combatId: string } & (
  | {
      type: 'combatStarted'
      cardId: string
      cardTitle: string
      participants: (
        | { type: 'player'; id: string; name: string }
        | {
            type: 'enemy'
            id: string
            name: string
            blockIndex: number
            copyIndex: number
          }
      )[]
    }
  | {
      type: 'combatTurnStarted'
      actorId: string
      turnId: string
      cycle: number
    }
  | {
      type: 'combatAbilityUsed'
      actorId: string
      abilityId: string
      equipmentSlot: TEquipmentSlot | null
    }
  | { type: 'combatEffectActivated'; actorId: string; effectId: string }
  | {
      type: 'combatDamageResolved'
      actorId: string | null
      targetId: string
      source: 'attack' | 'ability' | 'effect'
      hit: boolean | null
      damage: number
      reflectedDamage: number
      targetHealth: number
      actorHealth: number | null
    }
  | {
      type: 'combatEscapeAttempted'
      actorId: string
      naturalRoll: number | null
      total: number | null
      threshold: number
      vigorSpent: number
      succeeded: boolean
    }
  | { type: 'combatEnded'; result: import('../entities/party').TCombatResult }
)

type CombatPlayer = {
  health: number
  modifiers: Readonly<Record<TModifier, number>>
  shield?: boolean
  projectileAccuracyIncluded?: boolean
  statuses?: readonly TPlayerStatus[]
  brokenEquipment?: readonly TEquipmentSlot[]
  equippedSlots?: readonly TEquipmentSlot[]
  snapshot?: TPlayerState
  update?: (update: TCombatUpdate) => void
  withSnapshot?: (player: TPlayerState) => CombatPlayer
  reactionPending?: () => boolean
  react?: (
    fighter: CombatPlayer,
    state: TCombatState,
    notices: readonly CombatNotice[],
    rng: SeededRng
  ) => { fighter: CombatPlayer; rng: SeededRng; state?: TCombatState }
  refresh?: (
    health: number,
    statuses: readonly TPlayerStatus[],
    broken: readonly TEquipmentSlot[]
  ) => CombatPlayer
}

export function combatTurnStarted(state: TCombatState): TCombatUpdate {
  return {
    type: 'combatTurnStarted',
    combatId: state.id,
    actorId: state.turn.actorId,
    turnId: state.turn.id,
    cycle: state.cycle,
  }
}

function reportDamage(
  player: CombatPlayer,
  state: TCombatState,
  actorId: string,
  source: 'attack' | 'ability' | 'effect',
  result: ReturnType<typeof resolveCombatDamage>[number],
  playerHealth: number
) {
  const health = (id: string) =>
    id === state.memberId
      ? playerHealth
      : state.enemies.find((enemy) => enemy.id === id)!.health
  player.update?.({
    type: 'combatDamageResolved',
    combatId: state.id,
    actorId,
    source,
    ...result,
    targetHealth: health(result.targetId),
    actorHealth: health(actorId),
  })
}

export type CombatNotice =
  | { type: 'enemyAttack'; behavior: TEnemyBehavior }
  | { type: 'elementDamage'; element: TElement }
  | { type: 'enemyDefeated'; id: string }
  | { type: 'elementalAdvantage' }

export function enemyDefeatNotices(
  before: TCombatState,
  after: TCombatState
): CombatNotice[] {
  return before.enemies.flatMap((previous, index) =>
    previous.health > 0 && after.enemies[index].health === 0
      ? [{ type: 'enemyDefeated', id: previous.id }]
      : []
  )
}

function notifyCombat(
  player: CombatPlayer,
  health: number,
  statuses: readonly TPlayerStatus[],
  brokenEquipment: readonly TEquipmentSlot[],
  state: TCombatState,
  notices: readonly CombatNotice[],
  rng: SeededRng
) {
  const fighter = player.refresh?.(health, statuses, brokenEquipment) ?? {
    ...player,
    health,
    statuses,
    brokenEquipment,
  }
  return health > 0 && notices.length && fighter.react
    ? fighter.react(fighter, state, notices, rng)
    : { fighter, rng, state }
}

export function combatAbilityUsage(
  state: TCombatState,
  actorId: string,
  equipmentSlot: TEquipmentSlot | null,
  abilityId: string
) {
  return state.abilityUsage?.find(
    (entry) =>
      entry.actorId === actorId &&
      entry.equipmentSlot === equipmentSlot &&
      entry.abilityId === abilityId
  )
}

export function registerCombatAbility(
  state: TCombatState,
  actorId: string,
  equipmentSlot: TEquipmentSlot | null,
  ability: TExecutableAbility,
  health: number,
  sourceCardId = state.card.id
) {
  const previous = combatAbilityUsage(state, actorId, equipmentSlot, ability.id)
  const channel = ability.channel
  const nextCharge = (previous?.charges ?? 0) + 1
  const charging = channel !== null && nextCharge < channel.chargesRequired
  const usage = {
    actorId,
    equipmentSlot,
    abilityId: ability.id,
    sourceCardId,
    element: ability.element,
    uses: (previous?.uses ?? 0) + 1,
    cooldown: ability.cooldown + (ability.cooldown > 0 ? 1 : 0),
    charges: channel ? (charging ? nextCharge : 0) : null,
    channelHealth: charging ? (previous?.channelHealth ?? health) : null,
    activeUntilCycle:
      ability.form === 'continuous'
        ? state.cycle +
          (ability.duration?.kind === 'forOwnCombatTurns'
            ? ability.duration.turns
            : ability.duration?.kind === 'forCombatCycles'
              ? ability.duration.cycles
              : 1)
        : null,
  }
  return {
    charging,
    state: {
      ...state,
      abilityUsage: [
        ...(state.abilityUsage ?? []).filter((entry) => entry !== previous),
        usage,
      ],
    },
  }
}

function interruptChannel(
  state: TCombatState,
  actorId: string,
  damage: number,
  config: TGameConfigValues
) {
  if (
    !state.abilityUsage?.some(
      (entry) => entry.actorId === actorId && entry.charges
    )
  )
    return state
  return {
    ...state,
    abilityUsage: state.abilityUsage.map((entry) =>
      entry.actorId === actorId &&
      entry.channelHealth !== null &&
      damage * 100 > entry.channelHealth * config.channelInterruptDamagePercent
        ? { ...entry, charges: 0, channelHealth: null }
        : entry
    ),
  }
}

function participantsOf(
  state: Pick<TCombatState, 'memberId' | 'enemies'>,
  player: CombatPlayer
): Participant[] {
  return [
    {
      id: state.memberId,
      side: 'player',
      health: player.health,
      celerity: player.modifiers.celerity,
    },
    ...state.enemies.map((enemy): Participant => ({
      id: enemy.id,
      side: 'enemy',
      health: enemy.health,
      celerity: enemy.effectiveModifiers.celerity,
    })),
  ]
}

export function createCombat(
  id: string,
  card: TCombatEventCard,
  memberId: string,
  player: CombatPlayer,
  config: TGameConfigValues
): TCombatState {
  const printedEnemies = card.enemies.flatMap((enemy, blockIndex) =>
    Array.from({ length: enemy.count }, (_, copyIndex): CombatEnemy => ({
      id: `${id}:enemy:${blockIndex}:${copyIndex}`,
      blockIndex,
      copyIndex,
      health: enemy.health,
      maxHealth: enemy.health,
      vigor: enemy.vigor,
      element: enemy.element,
      effectiveModifiers: enemy.modifiers,
      statuses: [],
    }))
  )
  const enemies = printedEnemies.map((enemy) =>
    enemyWithModifiers({ card, enemies: printedEnemies }, enemy, config)
  )
  const order = cycleOrder(participantsOf({ memberId, enemies }, player))
  return {
    id,
    card,
    memberId,
    cycle: 1,
    maxCycles: config.maxCombatCycles,
    order,
    enemies,
    turn: {
      id: `${id}:turn:1:0`,
      actorId: order[0] ?? memberId,
      phase: 'prepare',
      attacksRemaining: 1,
    },
  }
}

export function combatIsTerminal(
  state: TCombatState,
  playerHealth: number
): boolean {
  return (
    playerHealth === 0 ||
    state.enemies.every(({ health }) => health === 0) ||
    state.cycle > state.maxCycles
  )
}

export function combatAttackTargets(
  state: TCombatState,
  playerHealth: number
): string[] {
  if (
    state.turn.actorId !== state.memberId ||
    state.turn.attacksRemaining === 0 ||
    combatIsTerminal(state, playerHealth)
  )
    return []
  return state.enemies.filter(({ health }) => health > 0).map(({ id }) => id)
}

function nextTurn(state: TCombatState, player: CombatPlayer): TCombatState {
  const participants = participantsOf(state, player)
  const living = new Set(
    participants.filter(({ health }) => health > 0).map(({ id }) => id)
  )
  const acted = [
    ...(state.actedThisCycle ??
      state.order.slice(0, state.order.indexOf(state.turn.actorId))),
    state.turn.actorId,
  ]
  const nextActor = state.order.find(
    (id) => living.has(id) && !acted.includes(id)
  )
  const order = nextActor ? state.order : cycleOrder(participants)
  const next = {
    cycle: state.cycle + (nextActor ? 0 : 1),
    order,
    actorId: nextActor ?? order[0] ?? null,
  }
  if (next.actorId === null) return state
  return {
    ...state,
    cycle: next.cycle,
    order: next.order,
    actedThisCycle: nextActor ? acted : [],
    ...(state.abilityUsage
      ? {
          abilityUsage: state.abilityUsage.map((entry) =>
            entry.actorId === next.actorId
              ? { ...entry, uses: 0, cooldown: Math.max(0, entry.cooldown - 1) }
              : entry
          ),
        }
      : {}),
    turn: {
      id: `${state.id}:turn:${next.cycle}:${next.order.indexOf(next.actorId)}`,
      actorId: next.actorId,
      phase: 'prepare',
      attacksRemaining: 1,
    },
  }
}

function enemyWithModifiers(
  state: Pick<TCombatState, 'card' | 'enemies' | 'abilityUsage'>,
  enemy: CombatEnemy,
  config: TGameConfigValues
) {
  const block = state.card.enemies[enemy.blockIndex]
  const statuses = enemy.statuses.map((status) => ({
    ...status,
    activation: status.activation.map((effect) =>
      effect.kind === 'enemyModifierFlat'
        ? { ...effect, kind: 'modifierFlat' as const }
        : effect
    ),
  }))
  const passive = block.abilities.flatMap((ability) =>
    ability.id !== undefined &&
    ability.form === 'passive' &&
    ability.timing !== 'outsideCombat'
      ? ability.effects.flatMap((effect, index) => {
          if (effect.cost.length > 0) return []
          const trigger = effect.trigger
          if (trigger !== null) {
            if (enemy.health === 0) return []
            if (trigger.kind === 'whileEnemyCount') {
              const living = state.enemies.filter(
                ({ health }) => health > 0
              ).length
              const { count, op } = trigger
              const matches = {
                eq: living === count,
                lt: living < count,
                lte: living <= count,
                gt: living > count,
                gte: living >= count,
              }[op]
              if (!matches) return []
            } else if (trigger.kind === 'whileUsedAbilitiesSameElement') {
              const used =
                state.abilityUsage?.filter(
                  ({ actorId }) => actorId === enemy.id
                ) ?? []
              const element = used[0]?.element
              if (
                element == null ||
                !used.every((entry) => entry.element === element)
              )
                return []
            } else {
              return []
            }
          }
          const status = abilityEffectStatus(
            {
              ...effect,
              duration: { kind: 'infinite' },
              mark: effect.mark ?? 'buff',
            },
            ability.id,
            `${enemy.id}:${ability.id}:${index}`,
            index
          )
          return status ? [status] : []
        })
      : []
  )
  return {
    ...enemy,
    effectiveModifiers: effectiveModifiers({
      modifiers: block.modifiers,
      peak: 0,
      equipment: [],
      statuses: [...passive, ...statuses],
      combat: {
        exhaustionPenaltyPercent:
          enemy.vigor === 0 ? config.exhaustionPenaltyPercent : 0,
      },
    }),
  }
}

function refreshEnemyCountModifiers(
  before: TCombatState,
  after: TCombatState,
  config: TGameConfigValues
) {
  if (
    before.enemies.every(
      ({ health }, index) => health > 0 === after.enemies[index].health > 0
    )
  )
    return after
  return {
    ...after,
    enemies: after.enemies.map((enemy) =>
      enemyWithModifiers(after, enemy, config)
    ),
  }
}

function damageEnemy(
  state: TCombatState,
  id: string,
  damage: number,
  config: TGameConfigValues,
  element: TElement | null = null
) {
  const damaged = refreshEnemyCountModifiers(
    state,
    interruptChannel(
      {
        ...state,
        enemies: state.enemies.map((enemy) =>
          enemy.id === id
            ? enemyWithModifiers(
                state,
                {
                  ...enemy,
                  health: Math.max(0, enemy.health - damage),
                  statuses:
                    damage > 0
                      ? enemy.statuses.filter(
                          ({ duration }) => duration.kind !== 'untilDamageTaken'
                        )
                      : enemy.statuses,
                },
                config
              )
            : enemy
        ),
      },
      id,
      damage,
      config
    ),
    config
  )
  if (damage <= 0 || element === null) return damaged
  return resolveEnemyAbilityTriggers(
    damaged,
    id,
    config,
    (trigger) =>
      trigger?.kind === 'onElementDamageTaken' &&
      (trigger.element === null || trigger.element === element)
  )
}

function elementalDefense(
  statuses: readonly TPlayerStatus[],
  element: TElement | null
) {
  const activations = statuses.flatMap(({ activation }) => activation)
  return {
    resistant: activations.some(
      (item) => item.kind === 'elementResistance' && item.element === element
    ),
    immune: activations.some(
      (item) => item.kind === 'elementImmunity' && item.element === element
    ),
    vulnerable: activations.some(
      (item) => item.kind === 'elementVulnerability' && item.element === element
    ),
  }
}

function applyEnemyEffect(
  state: TCombatState,
  enemy: CombatEnemy,
  effect: TEffect,
  statusId: string,
  index: number,
  config: TGameConfigValues
) {
  let changed = enemy
  for (const activation of effect.activation) {
    switch (activation.kind) {
      case 'heal':
        changed = {
          ...changed,
          health: Math.min(
            changed.maxHealth,
            changed.health + activation.amount
          ),
        }
        break
      case 'loseLife':
        changed = {
          ...changed,
          health:
            activation.amount === 'halfHealth'
              ? Math.ceil(changed.health / 2)
              : Math.max(0, changed.health - activation.amount),
        }
        break
      case 'restoreVigor':
        if (changed.vigor !== null)
          changed = {
            ...changed,
            vigor: Math.min(
              state.card.enemies[enemy.blockIndex].vigor ?? 0,
              changed.vigor + activation.amount
            ),
          }
        break
      case 'removeEnemyElement':
        changed = { ...changed, element: null }
        break
      case 'defeatEnemy':
        changed = { ...changed, health: 0 }
        break
      case 'skipEnemyTurn':
        changed = {
          ...changed,
          skippedTurns: (changed.skippedTurns ?? 0) + activation.count,
        }
        break
      case 'removeBuffs':
      case 'removeDebuffs': {
        const mark = activation.kind === 'removeBuffs' ? 'buff' : 'debuff'
        changed = {
          ...changed,
          statuses: changed.statuses.filter((status) => status.mark !== mark),
        }
        break
      }
    }
  }
  const status = abilityEffectStatus(effect, state.card.id, statusId, index)
  if (status) changed = { ...changed, statuses: [...changed.statuses, status] }
  return enemyWithModifiers(state, changed, config)
}

export function resolvePlayerAbility(
  state: TCombatState,
  player: CombatPlayer,
  ability: Pick<
    TExecutableAbility,
    'id' | 'form' | 'channel' | 'power' | 'element' | 'effects' | 'duration'
  >,
  targets: readonly CombatEnemy[],
  config: TGameConfigValues,
  rng: SeededRng
) {
  let current = state
  let health = player.health
  let advantageHit = false
  let attacked = false
  let missed = false
  let reflected = 0
  const hitTargets: string[] = []
  const advantageTargets: string[] = []
  const roll = () => rng.nextUint32() / 2 ** 32
  const form = ability.channel?.releaseForm ?? ability.form
  for (const { id } of targets) {
    const enemy = current.enemies.find((entry) => entry.id === id)
    if (!enemy?.health) continue
    let targetAdvantageHit = false
    const target = {
      id: enemy.id,
      health: enemy.health,
      element: enemy.element,
      defense: enemy.effectiveModifiers.defense,
      evasion: enemy.effectiveModifiers.evasion,
      reflection: enemy.effectiveModifiers.reflection,
      shield: false,
      ...elementalDefense(enemy.statuses, ability.element),
    }
    if (
      ability.power !== null &&
      (form === 'targeted' || form === 'projectile' || form === 'area')
    ) {
      const [result] = resolveCombatDamage({
        kind: 'attack',
        form,
        projectileAccuracyIncluded: player.projectileAccuracyIncluded,
        ...player.modifiers,
        element: ability.element,
        config,
        roll,
        targets: [target],
        elemental: elementalRules(player.statuses ?? []),
      })
      attacked = true
      missed ||= result.hit === false
      reflected += result.reflectedDamage
      current = damageEnemy(
        current,
        enemy.id,
        result.damage,
        config,
        ability.element
      )
      health = Math.max(0, health - result.reflectedDamage)
      reportDamage(player, current, state.memberId, 'ability', result, health)
      current = interruptChannel(
        current,
        state.memberId,
        result.reflectedDamage,
        config
      )
      targetAdvantageHit = Boolean(
        result.hit &&
        ability.element !== null &&
        (target.vulnerable ||
          elementalRelation(
            ability.element,
            target.element,
            elementalRules(player.statuses ?? []).inverted
          ) === 1)
      )
      advantageHit ||= targetAdvantageHit
      if (result.hit === false) continue
    }
    hitTargets.push(id)
    if (targetAdvantageHit) advantageTargets.push(id)
    for (const [index, raw] of ability.effects.entries()) {
      if (
        raw.trigger?.kind === 'onElementalAdvantageHit' &&
        !targetAdvantageHit
      )
        continue
      const effect = abilityEffectDuration(ability, raw)
      for (const activation of effect.activation) {
        const victim = current.enemies.find(({ id }) => id === enemy.id)
        if (!victim?.health) break
        if (activation.kind === 'effectDamage') {
          const [result] = resolveCombatDamage({
            kind: 'effect',
            amount: activation.amount,
            element: ability.element,
            targets: [
              {
                ...target,
                health: victim.health,
                element: victim.element,
                ...elementalDefense(victim.statuses, ability.element),
              },
            ],
            config,
            roll,
            elemental: elementalRules(player.statuses ?? []),
          })
          current = damageEnemy(
            current,
            enemy.id,
            result.damage,
            config,
            ability.element
          )
          reportDamage(
            player,
            current,
            state.memberId,
            'effect',
            result,
            health
          )
        }
        if (activation.kind === 'swapCombatOrder') {
          const order = [...current.order]
          const actorIndex = order.indexOf(current.memberId)
          const enemyIndex = order.indexOf(enemy.id)
          if (actorIndex >= 0 && enemyIndex >= 0)
            [order[actorIndex], order[enemyIndex]] = [
              order[enemyIndex],
              order[actorIndex],
            ]
          current = { ...current, order }
        }
      }
      const beforeEffect = current
      current = {
        ...current,
        enemies: current.enemies.map((entry) =>
          entry.id === enemy.id && entry.health > 0
            ? applyEnemyEffect(
                current,
                entry,
                effect,
                `${state.turn.id}:${enemy.id}:${ability.id}:${index}`,
                index,
                config
              )
            : entry
        ),
      }
      current = refreshEnemyCountModifiers(beforeEffect, current, config)
    }
  }
  return {
    state: current,
    health,
    advantageHit,
    attacked,
    missed,
    reflected,
    hitTargets,
    advantageTargets,
  }
}

function reactToEnemyAbilityUse(
  state: TCombatState,
  actorId: string,
  used: TExecutableAbility,
  config: TGameConfigValues
) {
  if (used.element === null) return state
  return resolveEnemyAbilityTriggers(
    state,
    actorId,
    config,
    (trigger) =>
      trigger?.kind === 'onElementAbilityUsed' &&
      trigger.element === used.element,
    used.id
  )
}

function resolveEnemyAbilityTriggers(
  state: TCombatState,
  actorId: string,
  config: TGameConfigValues,
  matches: (trigger: TTrigger | null) => boolean,
  usedAbilityId?: string
) {
  const actor = state.enemies.find(({ id }) => id === actorId)
  if (!actor?.health) return state

  let changed = actor
  const block = state.card.enemies[actor.blockIndex]
  for (const ability of block.abilities) {
    if (
      ability.id === undefined ||
      ability.timing === 'outsideCombat' ||
      ability.target !== 'self' ||
      ability.id === usedAbilityId
    )
      continue
    const usage = combatAbilityUsage(state, actorId, null, ability.id)
    if (
      ability.form !== 'passive' &&
      !(
        ability.form === 'continuous' &&
        (usage?.activeUntilCycle ?? 0) > state.cycle
      )
    )
      continue
    for (const [index, effect] of ability.effects.entries()) {
      if (
        changed.health === 0 ||
        changed.statuses.some(({ activation }) =>
          activation.some(({ kind }) => kind === 'nullifyAbilities')
        ) ||
        !matches(effect.trigger)
      )
        continue
      const paid = payEnemyCosts(changed, effect.cost, ability.element)
      if (!paid?.health) continue
      changed = applyEnemyEffect(
        state,
        paid,
        effect,
        `${state.turn.id}:${actorId}:${ability.id}:trigger:${changed.statuses.length}:${index}`,
        index,
        config
      )
    }
  }
  if (changed === actor) return state
  return {
    ...state,
    enemies: state.enemies.map((enemy) =>
      enemy.id === actorId ? changed : enemy
    ),
  }
}

function chooseEnemyAbility(
  state: TCombatState,
  enemy: CombatEnemy,
  config: TGameConfigValues
) {
  const block = state.card.enemies[enemy.blockIndex]
  const wounded = state.enemies
    .filter(
      (ally) =>
        ally.id !== enemy.id && ally.health > 0 && ally.health < ally.maxHealth
    )
    .sort((a, b) => a.health - b.health)[0]
  const preferences = block.combatRules?.preferredAbilityIds ?? []
  const priority =
    block.combatRules?.abilityPriority ??
    config.enemyAbilityPriorities[block.behavior]
  const silenced = enemy.statuses.some(({ activation }) =>
    activation.some(({ kind }) => kind === 'nullifyAbilities')
  )
  const options = block.abilities.flatMap((ability) => {
    if (silenced) return []
    if (
      ability.id === undefined ||
      ability.form === 'passive' ||
      ability.timing === 'outsideCombat'
    )
      return []
    const usage = combatAbilityUsage(state, enemy.id, null, ability.id)
    if (
      (usage?.cooldown ?? 0) > 0 ||
      (usage?.uses ?? 0) >= ability.usesPerTurn ||
      (ability.form === 'continuous' &&
        state.abilityUsage?.some(
          (entry) =>
            entry.actorId === enemy.id &&
            (entry.activeUntilCycle ?? 0) > state.cycle
        ))
    )
      return []
    const active = enemy.statuses.flatMap(({ activation }) => activation)
    const element =
      active.findLast((entry) => entry.kind === 'changeNextAbilityElement')
        ?.element ??
      ability.element ??
      active.findLast((entry) => entry.kind === 'grantElementToAbility')
        ?.element ??
      null
    const paid = payEnemyCosts(enemy, ability.cost, element)
    if (!paid) return []
    if (ability.target === 'ally' && !wounded) return []
    return [{ ability: { ...ability, element }, paid }]
  })
  for (const criterion of priority) {
    const ranked = options
      .filter(({ ability }) => {
        const selfBuff =
          ability.target === 'self' &&
          ability.effects.some((effect) => effect.mark === 'buff')
        const continuous = ability.form === 'continuous'
        switch (criterion) {
          case 'supportWoundedAlly':
            return (
              ability.target === 'ally' &&
              Boolean(wounded) &&
              ability.effects.some(
                (effect) =>
                  effect.mark === 'buff' ||
                  effect.activation.some(({ kind }) => kind === 'heal')
              )
            )
          case 'selfBuff':
            return selfBuff
          case 'continuous':
            return continuous
          case 'selfBuffOrContinuous':
            return selfBuff || continuous
          case 'highestPower':
            return ability.power !== null
        }
      })
      .sort((a, b) => {
        const preference = (id: string) =>
          preferences.includes(id)
            ? preferences.indexOf(id)
            : preferences.length
        return (
          (criterion === 'highestPower'
            ? (b.ability.power ?? 0) - (a.ability.power ?? 0)
            : 0) || preference(a.ability.id) - preference(b.ability.id)
        )
      })
    if (ranked.length) return { ...ranked[0], wounded }
  }
  return null
}

function enemyQuantity(quantity: TQuantity, actor: CombatEnemy): number | null {
  if (typeof quantity === 'number') return quantity
  const values = Object.values(actor.effectiveModifiers)
  const bases: Partial<Record<typeof quantity.base, number>> = {
    halfHealth: Math.ceil(actor.health / 2),
    halfVigor: Math.ceil((actor.vigor ?? 0) / 2),
    allVigor: actor.vigor ?? 0,
    highestModifier: Math.max(...values),
    lowestModifier: Math.min(...values),
    perEnemy: 1,
  }
  const amount = (bases[quantity.base] ?? 0) * quantity.multiplier
  return amount >= quantity.minimum ? amount : null
}

function payEnemyCosts(
  enemy: CombatEnemy,
  costs: TExecutableAbility['cost'],
  element: TElement | null
) {
  let current = enemy
  const percent = enemy.statuses
    .flatMap(({ activation }) => activation)
    .reduce(
      (sum, entry) =>
        entry.kind === 'elementVigorCostModifier' && entry.element === element
          ? sum + entry.percent
          : sum,
      0
    )
  for (const cost of costs) {
    if (cost.kind !== 'donateLife' && cost.kind !== 'spendVigor') return null
    const base = enemyQuantity(cost.amount, current)
    if (base === null) return null
    if (cost.kind === 'donateLife') {
      if (base > current.health) return null
      current = { ...current, health: current.health - base }
    } else {
      const amount = Math.floor((base * Math.max(0, 100 + percent)) / 100)
      if (amount > (current.vigor ?? 0)) return null
      if (current.vigor !== null)
        current = { ...current, vigor: current.vigor - amount }
    }
  }
  return current
}

function resolveEnemyAbilities(
  state: TCombatState,
  enemy: CombatEnemy,
  player: CombatPlayer,
  config: TGameConfigValues,
  rng: SeededRng
) {
  let current = state
  let health = player.health
  let statuses = player.statuses ?? []
  let brokenEquipment = player.brokenEquipment ?? []
  const limit =
    state.card.enemies[enemy.blockIndex].combatRules?.abilityUsesPerTurn ?? 1
  for (
    let use = state.turn.enemyAbilitiesResolved ?? 0;
    use < limit && health > 0;
    use++
  ) {
    const before = current
    const actor = current.enemies.find(({ id }) => id === enemy.id)!
    if (actor.health === 0) break
    const option = chooseEnemyAbility(current, actor, config)
    if (!option) break
    const { ability, paid, wounded } = option
    player.update?.({
      type: 'combatAbilityUsed',
      combatId: state.id,
      actorId: actor.id,
      abilityId: ability.id,
      equipmentSlot: null,
    })
    const registered = registerCombatAbility(
      current,
      actor.id,
      null,
      ability,
      actor.health
    )
    current = {
      ...registered.state,
      enemies: registered.state.enemies.map((entry) =>
        entry.id === actor.id
          ? enemyWithModifiers(
              registered.state,
              {
                ...paid,
                statuses: statusesAfterAbility(entry.statuses, ability.element),
              },
              config
            )
          : entry
      ),
    }
    if (paid.health === 0) continue
    if (registered.charging) {
      current = reactToEnemyAbilityUse(current, actor.id, ability, config)
      continue
    }
    let payer = current.enemies.find(({ id }) => id === actor.id)!
    const effects = ability.effects.flatMap((effect) => {
      const trigger = effect.trigger
      const matches =
        trigger === null ||
        (trigger.kind === 'onElementAbilityUsed' &&
          trigger.element === ability.element)
      if (!matches) return []
      const cost = payEnemyCosts(payer, effect.cost, ability.element)
      if (!cost || cost.health === 0) return []
      payer = cost
      return [effect]
    })
    current = {
      ...current,
      enemies: current.enemies.map((entry) =>
        entry.id === payer.id
          ? enemyWithModifiers(current, payer, config)
          : entry
      ),
    }
    const beneficiary =
      ability.target === 'ally'
        ? wounded
        : ability.target === 'self'
          ? actor
          : null
    if (beneficiary) {
      current = {
        ...current,
        enemies: current.enemies.map((entry) =>
          entry.id === beneficiary.id
            ? effects.reduce(
                (changed, effect, index) =>
                  applyEnemyEffect(
                    current,
                    changed,
                    abilityEffectDuration(ability, effect),
                    `${state.turn.id}:${actor.id}:${use}:${index}`,
                    index,
                    config
                  ),
                entry
              )
            : entry
        ),
      }
      if (beneficiary.id === actor.id) {
        const extraAttacks = effects
          .flatMap(({ activation }) => activation)
          .reduce(
            (count, entry) =>
              entry.kind === 'extraAttack' ? count + entry.count : count,
            0
          )
        if (extraAttacks)
          current = {
            ...current,
            turn: {
              ...current.turn,
              attacksRemaining: current.turn.attacksRemaining + extraAttacks,
            },
          }
      }
      current = reactToEnemyAbilityUse(current, actor.id, ability, config)
      continue
    }
    const roll = () => rng.nextUint32() / 2 ** 32
    const target = {
      id: state.memberId,
      health,
      element: null,
      ...elementalDefense(player.statuses ?? [], ability.element),
      defense: player.modifiers.defense,
      evasion: player.modifiers.evasion,
      reflection: player.modifiers.reflection,
      shield: player.shield ?? false,
    }
    const form = ability.channel?.releaseForm ?? ability.form
    const notices: CombatNotice[] = []
    let hit = true
    if (
      ability.power !== null &&
      (form === 'targeted' || form === 'projectile' || form === 'area')
    ) {
      const modifiers = effectiveModifiers({
        ...actor,
        modifiers: state.card.enemies[actor.blockIndex].modifiers,
        peak: 0,
        equipment: [],
        combat: {
          power: ability.power,
          projectileAccuracyBonusPercent:
            form === 'projectile' ? config.projectileAccuracyBonusPercent : 0,
          exhaustionPenaltyPercent:
            payer.vigor === 0 ? config.exhaustionPenaltyPercent : 0,
        },
      })
      const [result] = resolveCombatDamage({
        kind: 'attack',
        form,
        projectileAccuracyIncluded: true,
        ...modifiers,
        element: ability.element,
        config,
        roll,
        targets: [target],
        elemental: elementalRules(actor.statuses),
      })
      health = Math.max(0, health - result.damage)
      current = interruptChannel(current, state.memberId, result.damage, config)
      current = damageEnemy(current, actor.id, result.reflectedDamage, config)
      reportDamage(player, current, actor.id, 'ability', result, health)
      if (result.damage > 0)
        statuses = statuses.filter(
          ({ duration }) => duration.kind !== 'untilDamageTaken'
        )
      hit = result.hit !== false
      notices.push({
        type: 'enemyAttack',
        behavior: state.card.enemies[enemy.blockIndex].behavior,
      })
      if (result.damage > 0 && ability.element !== null)
        notices.push({ type: 'elementDamage', element: ability.element })
    }
    for (const [effectIndex, raw] of (hit && health > 0
      ? effects
      : []
    ).entries()) {
      const effect = abilityEffectDuration(ability, raw)
      const { activation } = effect
      for (const effect of activation) {
        if (effect.kind === 'breakEquipment') {
          const eligible = (player.equippedSlots ?? []).filter(
            (slot) =>
              !brokenEquipment.includes(slot) &&
              (!effect.slots.length || effect.slots.includes(slot))
          )
          const chosen =
            eligible.length > 1
              ? eligible[Math.floor(roll() * eligible.length)]
              : eligible[0]
          if (chosen) brokenEquipment = [...brokenEquipment, chosen]
        }
        if (effect.kind === 'removeBuffs' || effect.kind === 'removeDebuffs') {
          const mark = effect.kind === 'removeBuffs' ? 'buff' : 'debuff'
          statuses = statuses.filter((status) => status.mark !== mark)
        }
        if (effect.kind !== 'effectDamage' || health === 0) continue
        const [result] = resolveCombatDamage({
          kind: 'effect',
          amount: effect.amount,
          element: ability.element,
          config,
          roll,
          targets: [{ ...target, health }],
          elemental: elementalRules(actor.statuses),
        })
        health = Math.max(0, health - result.damage)
        reportDamage(player, current, actor.id, 'effect', result, health)
        current = interruptChannel(
          current,
          state.memberId,
          result.damage,
          config
        )
        if (result.damage > 0)
          statuses = statuses.filter(
            ({ duration }) => duration.kind !== 'untilDamageTaken'
          )
        if (result.damage > 0 && ability.element !== null)
          notices.push({ type: 'elementDamage', element: ability.element })
      }
      const status = abilityEffectStatus(
        effect,
        ability.id,
        `${state.turn.id}:${use}:${effectIndex}`,
        effectIndex
      )
      if (player.snapshot && player.withSnapshot) {
        const changed = applyAbilityEffect(
          { ...player.snapshot, health, statuses, brokenEquipment },
          effect,
          state.card.id,
          `${state.turn.id}:${use}:${effectIndex}`,
          capacitiesOf(config, player.snapshot.expansions).purse,
          effectIndex
        )
        if (changed.health < health) {
          current = interruptChannel(
            current,
            state.memberId,
            health - changed.health,
            config
          )
        }
        player = player.withSnapshot(changed)
        health = changed.health
        statuses = changed.statuses
        brokenEquipment = changed.brokenEquipment ?? []
      } else if (status) {
        statuses = [...statuses, status]
      }
    }
    current = reactToEnemyAbilityUse(current, actor.id, ability, config)
    const reaction = notifyCombat(
      player,
      health,
      statuses,
      brokenEquipment,
      current,
      [...notices, ...enemyDefeatNotices(before, current)],
      rng
    )
    player = reaction.fighter
    rng = reaction.rng
    current = reaction.state ?? current
    health = player.health
    statuses = player.statuses ?? []
    brokenEquipment = player.brokenEquipment ?? []
    if (player.reactionPending?.()) {
      current = {
        ...current,
        turn: { ...current.turn, enemyAbilitiesResolved: use + 1 },
      }
      break
    }
  }
  return { state: current, health, statuses, brokenEquipment, player, rng }
}

export function resolveCombatTurn(
  state: TCombatState,
  player: CombatPlayer,
  config: TGameConfigValues,
  rng: SeededRng,
  targetId?: string,
  resume = false,
  failedEscape = false
): {
  state: TCombatState
  health: number
  statuses: readonly TPlayerStatus[]
  brokenEquipment: readonly TEquipmentSlot[]
  snapshot: TPlayerState | undefined
  rngState: RngState
  playerDownBeforeLastEnemy: boolean
} {
  let current = state
  let health = player.health
  let statuses = player.statuses ?? []
  let brokenEquipment = player.brokenEquipment ?? []
  let playerDownBeforeLastEnemy = false
  const roll = () => rng.nextUint32() / 2 ** 32
  const finish = () => ({
    state: current,
    health,
    statuses,
    brokenEquipment,
    snapshot: player.snapshot,
    rngState: rng.state(),
    playerDownBeforeLastEnemy,
  })
  const notify = (notices: readonly CombatNotice[]) => {
    const reaction = notifyCombat(
      player,
      health,
      statuses,
      brokenEquipment,
      current,
      notices,
      rng
    )
    player = reaction.fighter
    rng = reaction.rng
    current = reaction.state ?? current
    health = player.health
    statuses = player.statuses ?? []
    brokenEquipment = player.brokenEquipment ?? []
  }
  const advance = () => {
    const actorId = current.turn.actorId
    if (actorId === current.memberId) {
      statuses = combatStatusesAfterTurn(statuses, true, false)
      player = player.refresh?.(health, statuses, brokenEquipment) ?? {
        ...player,
        health,
        statuses,
      }
    }
    const participants = {
      ...current,
      enemies: current.enemies.map((enemy) =>
        enemy.id === actorId
          ? enemyWithModifiers(
              current,
              {
                ...enemy,
                statuses: combatStatusesAfterTurn(enemy.statuses, true, false),
              },
              config
            )
          : enemy
      ),
    }
    const advanced = nextTurn(participants, { ...player, health })
    if (advanced.cycle !== current.cycle) {
      statuses = combatStatusesAfterTurn(statuses, false, true)
      player = player.refresh?.(health, statuses, brokenEquipment) ?? {
        ...player,
        health,
        statuses,
      }
      const enemies = participants.enemies.map((enemy) =>
        enemyWithModifiers(
          current,
          {
            ...enemy,
            statuses: combatStatusesAfterTurn(enemy.statuses, false, true),
          },
          config
        )
      )
      current = nextTurn({ ...participants, enemies }, { ...player, health })
    } else {
      current = advanced
    }
    if (
      current.turn.id !== participants.turn.id &&
      current.cycle <= current.maxCycles
    )
      player.update?.(combatTurnStarted(current))
    const expires = (status: TPlayerStatus, actor: string) => {
      const { duration } = status
      return (
        duration.kind === 'whileAbilityActive' &&
        !current.abilityUsage?.some(
          (usage) =>
            usage.actorId === actor &&
            usage.sourceCardId === duration.cardId &&
            (usage.activeUntilCycle ?? 0) > current.cycle
        )
      )
    }
    const remaining = statuses.filter(
      (status) => !expires(status, current.memberId)
    )
    if (remaining.length !== statuses.length) {
      statuses = remaining
      player = player.refresh?.(health, statuses, brokenEquipment) ?? {
        ...player,
        health,
        statuses,
      }
    }
    current = {
      ...current,
      enemies: current.enemies.map((enemy) => {
        const remaining = enemy.statuses.filter(
          (status) => !expires(status, enemy.id)
        )
        return remaining.length === enemy.statuses.length
          ? enemy
          : enemyWithModifiers(
              current,
              { ...enemy, statuses: remaining },
              config
            )
      }),
    }
  }

  const basicEnemyAttack = (enemy: CombatEnemy) => {
    const [result] = resolveCombatDamage({
      kind: 'attack',
      form: 'basic',
      ...enemy.effectiveModifiers,
      element: null,
      config,
      roll,
      targets: [
        {
          id: current.memberId,
          health,
          element: null,
          defense: player.modifiers.defense,
          evasion: player.modifiers.evasion,
          reflection: player.modifiers.reflection,
          resistant: false,
          immune: false,
          shield: false,
        },
      ],
    })
    health = Math.max(0, health - result.damage)
    playerDownBeforeLastEnemy = health === 0
    if (result.damage > 0)
      statuses = statuses.filter(
        ({ duration }) => duration.kind !== 'untilDamageTaken'
      )
    const before = current
    current = interruptChannel(current, current.memberId, result.damage, config)
    current = interruptChannel(
      current,
      enemy.id,
      result.reflectedDamage,
      config
    )
    current = damageEnemy(current, enemy.id, result.reflectedDamage, config)
    reportDamage(player, current, enemy.id, 'attack', result, health)
    notify([
      {
        type: 'enemyAttack',
        behavior: current.card.enemies[enemy.blockIndex].behavior,
      },
      ...enemyDefeatNotices(before, current),
    ])
  }

  if (failedEscape && !combatIsTerminal(current, health)) {
    const position = current.order.indexOf(current.memberId)
    const circularOrder = [
      ...current.order.slice(position + 1),
      ...current.order.slice(0, position),
    ]
    const attacker = circularOrder
      .map((id) => current.enemies.find((enemy) => enemy.id === id))
      .find((enemy) => enemy && enemy.health > 0)
    current = {
      ...current,
      turn: { ...current.turn, phase: 'attack', attacksRemaining: 0 },
    }
    if (attacker) basicEnemyAttack(attacker)
    if (player.reactionPending?.()) return finish()
  }

  if (combatIsTerminal(current, health)) return finish()
  if (current.turn.actorId === current.memberId) {
    if (resume && current.turn.attacksRemaining > 0) return finish()
    const target = current.enemies.find(({ id }) => id === targetId)
    if (target) {
      const before = current
      const modifiers = target.effectiveModifiers
      const [result] = resolveCombatDamage({
        kind: 'attack',
        form: 'basic',
        ...player.modifiers,
        element: null,
        config,
        roll,
        targets: [
          {
            id: target.id,
            health: target.health,
            element: target.element,
            defense: modifiers.defense,
            evasion: modifiers.evasion,
            reflection: modifiers.reflection,
            resistant: false,
            immune: false,
            shield: false,
          },
        ],
      })
      current = {
        ...damageEnemy(current, target.id, result.damage, config),
        turn: {
          ...current.turn,
          phase: 'attack',
          attacksRemaining: current.turn.attacksRemaining - 1,
        },
      }
      health = Math.max(0, health - result.reflectedDamage)
      reportDamage(player, current, state.memberId, 'attack', result, health)
      statuses = statuses.filter(
        ({ duration }) =>
          duration.kind !== 'untilAttackMade' &&
          (result.hit !== false || duration.kind !== 'untilAttackMissed') &&
          (result.reflectedDamage === 0 || duration.kind !== 'untilDamageTaken')
      )
      current = interruptChannel(
        current,
        state.memberId,
        result.reflectedDamage,
        config
      )
      notify(enemyDefeatNotices(before, current))
      if (
        player.reactionPending?.() ||
        current.turn.attacksRemaining > 0 ||
        combatIsTerminal(current, health)
      )
        return finish()
    }
    advance()
  }

  while (
    current.turn.actorId !== current.memberId &&
    !combatIsTerminal(current, health)
  ) {
    let enemy = current.enemies.find(({ id }) => id === current.turn.actorId)
    if (!enemy) break
    if (enemy.skippedTurns) {
      const { id, skippedTurns } = enemy
      current = {
        ...current,
        enemies: current.enemies.map((entry) =>
          entry.id === id ? { ...entry, skippedTurns: skippedTurns - 1 } : entry
        ),
      }
      advance()
      continue
    }
    if (current.turn.phase === 'prepare') {
      const used = resolveEnemyAbilities(
        current,
        enemy,
        { ...player, health },
        config,
        rng
      )
      current = used.state
      health = used.health
      statuses = used.statuses
      brokenEquipment = used.brokenEquipment
      player = used.player
      rng = used.rng
      if (player.reactionPending?.()) return finish()
    }
    if (combatIsTerminal(current, health)) break
    enemy = current.enemies.find(({ id }) => id === current.turn.actorId)!
    if (enemy.health === 0) {
      advance()
      continue
    }
    if (current.turn.attacksRemaining === 0) {
      advance()
      continue
    }
    current = {
      ...current,
      turn: {
        ...current.turn,
        phase: 'attack',
        attacksRemaining: current.turn.attacksRemaining - 1,
      },
    }
    basicEnemyAttack(enemy)
    if (player.reactionPending?.()) return finish()
    if (
      !combatIsTerminal(current, health) &&
      current.turn.attacksRemaining === 0
    )
      advance()
  }
  return finish()
}
