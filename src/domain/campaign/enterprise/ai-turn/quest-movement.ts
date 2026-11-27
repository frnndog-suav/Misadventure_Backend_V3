import type {
  TCard,
  TQuestLocation,
} from '@/domain/catalog/enterprise/value-objects/card'
import { moveRoutes } from '../connected-zones'
import type { TPlayerState } from '../entities/party-member'
import type { TPartyMap } from '../map-assembly'
import type { TPartyAction } from '../party-action'

const MAX_ROUTE_DEPTH = 4
const MAX_ROUTE_ZONES = 64

export function movesTowardQuests(
  map: TPartyMap,
  player: TPlayerState,
  cards: ReadonlyMap<string, TCard>
): Extract<TPartyAction, { type: 'move' }>[] {
  const locations = (player.openZoneQuests ?? []).flatMap((quest) => {
    const card = cards.get(quest.questCardId)
    const stage = card?.type === 'zoneQuest' && card.stages[quest.stageIndex]
    return stage && quest.status !== 'inProgress' ? [stage.location] : []
  })
  return movesTowardLocations(map, player, cards, locations)
}

export function movesTowardLocations(
  map: TPartyMap,
  player: TPlayerState,
  cards: ReadonlyMap<string, TCard>,
  locations: readonly TQuestLocation[]
): Extract<TPartyAction, { type: 'move' }>[] {
  if (!locations.length) return []

  function matches(zoneId: string, location: TQuestLocation) {
    const zone = cards.get(zoneId)
    if (zone?.type !== 'zone') return false
    return location.type === 'zoneTitle'
      ? zone.title === location.title
      : zone.zoneType === location.zoneType
  }

  const goals = map.zones
    .map(({ zoneId }) => zoneId)
    .filter((zoneId) =>
      locations.some(
        (location) =>
          !matches(player.zoneId, location) && matches(zoneId, location)
      )
    )
    .slice(0, MAX_ROUTE_ZONES)
  const withMount = player.mount != null
  const routes = moveRoutes(map, player.zoneId, withMount)
  const distances = new Map(goals.map((zoneId) => [zoneId, 0]))
  const queue = [...goals]
  for (
    let index = 0;
    index < queue.length && !distances.has(player.zoneId);
    index++
  ) {
    const zoneId = queue[index]
    const distance = distances.get(zoneId)!
    if (distance >= MAX_ROUTE_DEPTH) break
    for (const route of moveRoutes(map, zoneId, withMount)) {
      if (distances.size >= MAX_ROUTE_ZONES) break
      if (distances.has(route.zoneId)) continue
      distances.set(route.zoneId, distance + 1)
      queue.push(route.zoneId)
    }
  }

  const remaining = distances.get(player.zoneId)
  if (remaining === undefined) return []
  return routes
    .filter(({ zoneId }) => distances.get(zoneId) === remaining - 1)
    .map(({ zoneId }) => ({ type: 'move', zoneId }))
}
