import { describe, expect, it } from 'vitest'
import { UuidIdGenerator } from './uuid-id-generator'

describe('UuidIdGenerator (D-26)', () => {
  it('gera uuids v4 distintos', () => {
    const ids = new UuidIdGenerator()
    const a = ids.next().toString()
    const b = ids.next().toString()
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(a).not.toBe(b)
  })
})
