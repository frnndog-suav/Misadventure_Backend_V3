import { describe, expect, it } from 'vitest'

import { makeCollection, makeItemCard } from '../../../test/factories/make-card'

import { ContentCardCatalog } from './content-card-catalog'

describe('ContentCardCatalog', () => {
  const card = makeItemCard()
  const catalog = new ContentCardCatalog({
    collections: [makeCollection()],
    cards: [card],
  })

  it('REQ-10: entrega coleções e cartas pela porta CardCatalog', async () => {
    expect(await catalog.listCollections()).toEqual([makeCollection()])
    expect(await catalog.findCollection('fixture')).toEqual(makeCollection())
    expect(await catalog.findCollection('nope')).toBeNull()
    expect(await catalog.listCards('fixture')).toEqual([card])
    expect(await catalog.listCards('nope')).toEqual([])
    expect(await catalog.findCard(card.id)).toEqual(card)
    expect(await catalog.findCard('fixture.nope')).toBeNull()
  })
})
