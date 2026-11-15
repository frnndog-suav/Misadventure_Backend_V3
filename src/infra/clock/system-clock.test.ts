import { describe, expect, it } from 'vitest'
import { SystemClock } from './system-clock'

describe('SystemClock (D-26)', () => {
  it('devolve o instante atual', () => {
    const before = Date.now()
    const now = new SystemClock().now().getTime()
    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(Date.now())
  })
})
