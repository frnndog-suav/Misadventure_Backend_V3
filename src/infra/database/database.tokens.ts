import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

// Separado do módulo para os repositórios importarem sem ciclo.
export const PG_POOL = Symbol('PG_POOL')
export const DRIZZLE = Symbol('DRIZZLE')
export type Database = NodePgDatabase
