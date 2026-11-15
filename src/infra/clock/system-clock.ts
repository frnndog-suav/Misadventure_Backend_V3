import { Injectable } from '@nestjs/common'
import { Clock } from '@/core/ports/clock'

/** Relógio real (D-26). */
@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date()
  }
}
