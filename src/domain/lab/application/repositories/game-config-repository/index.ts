import type { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'

/** Ajuste do laboratório salvo (D-11, D-13). `null`: nenhum ajuste salvo. */
export abstract class GameConfigRepository {
  abstract get(): Promise<GameConfig | null>
  abstract save(config: GameConfig): Promise<void>
  abstract delete(): Promise<void>
}
