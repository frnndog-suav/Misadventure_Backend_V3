import { formatContentReport, loadContent } from './load-content'

/**
 * `npm run validate:content -- <arquivo|pasta>` (REQ-11): mesmo validador do
 * boot; código de saída 1 quando há problemas.
 */
async function main(): Promise<void> {
  const path = process.argv[2] ?? 'content'
  const result = await loadContent(path)
  if (!result.ok) {
    process.stderr.write(`${formatContentReport(result.problems)}\n`)
    process.exitCode = 1
    return
  }
  const { collections, cards } = result.content
  process.stdout.write(
    `Conteúdo válido (${path}): ${collections.length} coleção(ões), ${cards.length} carta(s).\n`
  )
}

void main()
