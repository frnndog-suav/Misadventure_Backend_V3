import { z } from 'zod'

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config)
  if (!result.success) {
    throw new Error(
      `Variáveis de ambiente inválidas (confira o .env com base no .env.example):\n${z.prettifyError(result.error)}`
    )
  }
  return result.data
}
