import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'

export class InMemoryGameConfigRepository implements GameConfigRepository {
  public item: GameConfig | null = null

  async get(): Promise<GameConfig | null> {
    return this.item
  }

  async save(config: GameConfig): Promise<void> {
    this.item = config
  }

  async delete(): Promise<void> {
    this.item = null
  }
}
