import * as core from '@actions/core'
import { replaceInFile } from 'replace-in-file'

export interface Token {
  key: string
  value: string
}

function escapeDelimiter(delimiter: string): string {
  return delimiter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
}

export function combineTokens(
  existingTokens: Token[],
  newTokens: Token[]
): Token[] {
  const combinedTokens: Token[] = []
  combinedTokens.push(...existingTokens)
  for (const token of newTokens) {
    const existingToken = combinedTokens.find(t => t.key === token.key)
    if (existingToken) {
      existingToken.value = token.value
    } else {
      combinedTokens.push(token)
    }
  }
  return combinedTokens
}

export async function replaceTokensInFile(
  filePaths: string[],
  tokens: Token[],
  prefix: string,
  suffix: string
): Promise<string[]> {
  const resolvedTokens = resolveNestedTokens(prefix, suffix, tokens)
  const fromRegEx = new RegExp(
    `${escapeDelimiter(prefix)}(.+?)${escapeDelimiter(suffix)}`,
    'gm'
  )
  const matchRegEx = new RegExp(
    `${escapeDelimiter(prefix)}(.+?)${escapeDelimiter(suffix)}`
  )

  const result = await replaceInFile({
    files: filePaths,
    allowEmptyPaths: true,
    from: fromRegEx,
    to: (match: string) => {
      const m = match.match(matchRegEx)
      if (m) {
        const tokenName = m[1]
        const token = resolvedTokens.find(t => t.key === tokenName)
        return token?.value || ''
      }

      return ''
    }
  })

  return result.filter(r => r.hasChanged).map(r => r.file)
}
function resolveNestedTokens(
  prefix: string,
  suffix: string,
  rawTokens: Token[]
): Token[] {
  let resolvedToken = rawTokens.filter(
    t => !t.value.includes(prefix) && !t.value.includes(suffix)
  )
  let unresolvedToken = rawTokens.filter(
    t => t.value.includes(prefix) || t.value.includes(suffix)
  )
  let resolveCount = 0
  while (unresolvedToken.length > 0 && resolveCount < 20) {
    for (const token of unresolvedToken) {
      for (const t of resolvedToken) {
        token.value = token.value.replace(
          new RegExp(prefix + t.key + suffix, 'g'),
          t.value
        )
      }
    }
    resolvedToken = resolvedToken.concat(
      unresolvedToken.filter(
        t => !t.value.includes(prefix) && !t.value.includes(suffix)
      )
    )
    unresolvedToken = unresolvedToken.filter(
      t => t.value.includes(prefix) || t.value.includes(suffix)
    )
    resolveCount++
  }
  if (resolveCount >= 20) {
    core.warning(
      'The token replacement has reached the maximum number of iterations. Some token are not been resolved. Either some token value are not provided or tokens has circular references.'
    )
  }
  return resolvedToken
}
