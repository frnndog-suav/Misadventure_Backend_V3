const PRINT_WIDTH = 80
const INDENT = '  '

type TPrimitive = string | number | boolean | null

function isPrimitive(value: unknown): value is TPrimitive {
  return value === null || typeof value !== 'object'
}

/**
 * JSON dos arquivos de conteúdo no mesmo formato que o Prettier daria (D-47),
 * para `npm run format:check` continuar limpo depois do editor: objetos
 * sempre abertos (uma chave por linha); listas de valores simples numa linha
 * quando cabem em 80 colunas, senão um item por linha; quebra de linha final.
 */
export function formatContentJson(value: unknown): string {
  return `${print(value, '', 0, '')}\n`
}

/**
 * `column` = onde o valor começa na linha; `suffix` = o que vem logo depois
 * dele na mesma linha (a vírgula), que também conta para caber.
 */
function print(
  value: unknown,
  indent: string,
  column: number,
  suffix: string
): string {
  if (isPrimitive(value)) return JSON.stringify(value)

  const inner = indent + INDENT

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.every(isPrimitive)) {
      const flat = `[${value.map((item) => JSON.stringify(item)).join(', ')}]`
      if (column + flat.length + suffix.length <= PRINT_WIDTH) return flat
    }
    const items = value.map((item, index) => {
      const comma = index < value.length - 1 ? ',' : ''
      return `${inner}${print(item, inner, inner.length, comma)}${comma}`
    })
    return `[\n${items.join('\n')}\n${indent}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, item]) => item !== undefined
  )
  if (entries.length === 0) return '{}'
  const lines = entries.map(([key, item], index) => {
    const comma = index < entries.length - 1 ? ',' : ''
    const head = `${inner}${JSON.stringify(key)}: `
    return `${head}${print(item, inner, head.length, comma)}${comma}`
  })
  return `{\n${lines.join('\n')}\n${indent}}`
}
