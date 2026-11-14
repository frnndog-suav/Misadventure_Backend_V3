import { Clock } from '@/core/ports/clock'

class FixedClock extends Clock {
  constructor(private readonly instant: string) {
    super()
  }

  now(): Date {
    return new Date(this.instant)
  }
}

/** Relógio parado num instante ISO 8601 (cópia nova a cada `now()`). */
export const fixedClock = (instant = '2026-11-14T12:00:00.000Z'): Clock =>
  new FixedClock(instant)
