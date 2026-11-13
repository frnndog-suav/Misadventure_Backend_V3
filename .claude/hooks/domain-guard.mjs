#!/usr/bin/env node
// Guarda da Constituição para src/core/ e src/domain/ (domínio puro e determinístico).
// Modo hook (PostToolUse): lê o JSON do stdin e checa só o arquivo editado (sai com 2 para bloquear).
// Modo CLI: `node .claude/hooks/domain-guard.mjs --all` varre as pastas inteiras.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Raiz = duas pastas acima deste arquivo (.claude/hooks/). Não depende do formato
// de CLAUDE_PROJECT_DIR (no Git Bash do Windows ele pode vir como /d/...).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CORE_DIRS = ['src/core', 'src/domain'].map((d) => resolve(ROOT, d))
const EXT = /\.ts$/

// Uma regra por proibição. A mensagem cita o princípio do CLAUDE.md.
const RULES = [
  { re: /\bMath\.random\s*\(/, msg: 'Math.random() é proibido; use a porta Rng com semente (princípio 3).' },
  { re: /\bDate\.now\s*\(|\bnew Date\s*\(/, msg: 'Relógio do sistema quebra o determinismo; use a porta Clock (princípio 3).' },
  { re: /\brandomUUID\b|['"](node:)?crypto['"]/, msg: 'IDs/aleatório do crypto são proibidos; use IdGenerator/Rng (princípio 3).' },
  { re: /from\s+['"]@nestjs\//, msg: 'O domínio não importa NestJS; a ligação fica em src/infra (princípio 2).' },
  { re: /from\s+['"](drizzle-orm|pg|postgres|socket\.io)[^'"]*['"]/, msg: 'O domínio não importa banco nem transporte (princípio 2).' },
  { re: /from\s+['"]@\/infra/, msg: 'O domínio não importa src/infra (princípio 2).' },
  { re: /['"](node:)?(fs|fs\/promises|http|https|net|child_process)['"]/, msg: 'O domínio não faz I/O (princípio 2).' },
  { re: /\bprocess\.env\b/, msg: 'O domínio não lê process.env; receba configuração injetada (princípios 2 e 7).' },
  { re: /\bfetch\s*\(/, msg: 'O domínio não acessa rede (princípio 2).' },
  { re: /\bconsole\.\w+\s*\(/, msg: 'Sem console no domínio; devolva eventos ou erros (princípio 2).' },
  { re: /(:\s*any\b|\bas\s+any\b|<any\b|\bany\[\])/, msg: 'Sem `any`; use `unknown` + validação (princípio 10).' },
  { re: /@ts-ignore|@ts-nocheck/, msg: 'Sem @ts-ignore/@ts-nocheck (princípio 10).' },
]

const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p)
const isCoreFile = (f) => {
  const abs = norm(resolve(ROOT, f))
  return EXT.test(abs) && CORE_DIRS.some((d) => abs.startsWith(norm(d)))
}

// Remove comentários preservando as quebras de linha (os números de linha batem).
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')

function check(file) {
  const problems = []
  stripComments(readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((line, i) => {
      for (const { re, msg } of RULES) if (re.test(line)) problems.push(`${relative(ROOT, file)}:${i + 1}  ${msg}`)
    })
  return problems
}

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

if (process.argv.includes('--all')) {
  const dirs = CORE_DIRS.filter(existsSync)
  if (!dirs.length) {
    console.log('src/core e src/domain ainda não existem; nada a checar.')
    process.exit(0)
  }
  const problems = dirs.flatMap(walk).filter(isCoreFile).flatMap(check)
  if (problems.length) {
    console.error(`Violações da Constituição (${problems.length}):\n${problems.join('\n')}`)
    process.exit(1)
  }
  console.log('domain-guard: OK.')
  process.exit(0)
}

let input = ''
process.stdin.on('data', (c) => (input += c))
process.stdin.on('end', () => {
  let file
  try {
    file = JSON.parse(input)?.tool_input?.file_path
  } catch {
    process.exit(0)
  }
  if (!file || !isCoreFile(file) || !existsSync(file)) process.exit(0)
  const problems = check(file)
  if (problems.length) {
    console.error(`domain-guard: corrija antes de continuar.\n${problems.join('\n')}`)
    process.exit(2)
  }
})
