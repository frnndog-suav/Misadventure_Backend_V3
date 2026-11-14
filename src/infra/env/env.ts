import { z } from 'zod'

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Origem do frontend liberada no CORS (padrão: dev server do Vite).
  CORS_ORIGIN: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
  // Liga as rotas /lab/* (D-14). Só 'true' ou 'false'; ausente = desligado.
  LAB_ENABLED: z.enum(['true', 'false']).default('false'),
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
