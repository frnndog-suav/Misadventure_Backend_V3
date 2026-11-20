import type { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TCombatEventCard,
  TElement,
  TModifier,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import type { TPlayerStatus } from '../player-status'

export type TCombatRefusal =
  | 'combatInProgress'
  | 'staleCombat'
  | 'staleCombatTurn'
  | 'wrongCombatPhase'
  | 'combatTargetUnavailable'
  | 'playerDown'

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
}

type DamageInput = {
  targets: readonly DamageTarget[]
  element: TElement | null
  config: TGameConfigValues
  /** Uniforme em [0, 1), fornecido pelo RNG do agregado. */
  roll: () => number
} & (
  | { kind: 'effect'; amount: number }
  | {
      kind: 'attack'
      form: 'basic' | 'targeted' | 'projectile' | 'area'
      attack: number
      accuracy: number
      piercing: number
    }
)

export function resolveCombatDamage(input: DamageInput) {
  const { targets, element, config, roll } = input
  return targets
    .filter(({ health }) => health > 0)
    .map((target) => {
      const hit =
        input.kind === 'effect'
          ? null
          : input.form === 'area' ||
            (input.accuracy > 0 &&
              roll() < input.accuracy / (input.accuracy + target.evasion))
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
        if (target.element !== null) {
          if (advantages[element].includes(target.element))
            damage *= (100 + config.elementAdvantageBonusPercent) / 100
          else if (advantages[target.element].includes(element))
            damage *= (100 - config.elementDisadvantagePenaltyPercent) / 100
        }
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
  }
  enemies: readonly CombatEnemy[]
}

type CombatPlayer = {
  health: number
  modifiers: Readonly<Record<TModifier, number>>
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
  const enemies = card.enemies.flatMap((enemy, blockIndex) =>
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
  const next = advanceCombatTurn({
    ...state,
    actorId: state.turn.actorId,
    participants: participantsOf(state, player),
  })
  if (next.actorId === null) return state
  return {
    ...state,
    cycle: next.cycle,
    order: next.order,
    turn: {
      id: `${state.id}:turn:${next.cycle}:${next.order.indexOf(next.actorId)}`,
      actorId: next.actorId,
      phase: 'prepare',
      attacksRemaining: 1,
    },
  }
}

export function resolveCombatTurn(
  state: TCombatState,
  player: CombatPlayer,
  config: TGameConfigValues,
  rng: SeededRng,
  targetId?: string
): { state: TCombatState; health: number } {
  let current = state
  let health = player.health
  const roll = () => rng.nextUint32() / 2 ** 32

  if (current.turn.actorId === current.memberId) {
    const target = current.enemies.find(({ id }) => id === targetId)
    if (target) {
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
        ...current,
        enemies: current.enemies.map((enemy) =>
          enemy.id === target.id
            ? { ...enemy, health: Math.max(0, enemy.health - result.damage) }
            : enemy
        ),
        turn: {
          ...current.turn,
          phase: 'attack',
          attacksRemaining: current.turn.attacksRemaining - 1,
        },
      }
      health = Math.max(0, health - result.reflectedDamage)
      if (
        current.turn.attacksRemaining > 0 ||
        combatIsTerminal(current, health)
      )
        return { state: current, health }
    }
    current = nextTurn(current, { ...player, health })
  }

  while (
    current.turn.actorId !== current.memberId &&
    !combatIsTerminal(current, health)
  ) {
    const enemy = current.enemies.find(({ id }) => id === current.turn.actorId)
    if (!enemy) break
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
    current = {
      ...current,
      enemies: current.enemies.map((target) =>
        target.id === enemy.id
          ? {
              ...target,
              health: Math.max(0, target.health - result.reflectedDamage),
            }
          : target
      ),
      turn: { ...current.turn, phase: 'attack', attacksRemaining: 0 },
    }
    if (!combatIsTerminal(current, health))
      current = nextTurn(current, { ...player, health })
  }
  return { state: current, health }
}
