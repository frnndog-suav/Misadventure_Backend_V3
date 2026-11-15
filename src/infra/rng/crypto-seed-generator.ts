import { randomInt } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { SeedGenerator } from '@/core/ports/seed-generator'

const UINT32_RANGE = 2 ** 32

/** Única fonte de entropia (D-26): semente inteira em [0, 2^32 - 1]. */
@Injectable()
export class CryptoSeedGenerator extends SeedGenerator {
  next(): number {
    return randomInt(0, UINT32_RANGE)
  }
}
