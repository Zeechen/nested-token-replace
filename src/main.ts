import * as core from '@actions/core'
import { Token, combineTokens, replaceTokensInFile } from './token-replace'
import { promises as fs } from 'fs'
import { context, getOctokit } from '@actions/github'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const files: string[] = resolveFilesArray('files')

    if (files.length === 0) {
      core.setFailed('No files were provided to replace tokens in.')
    }
    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Replace below files: ${files}`)

    // Log the current timestamp, wait, then log the new timestamp
    core.debug(new Date().toTimeString())
    core.debug('Resolve Tokens...')
    const tokens = await resolveInputTokens()
    core.debug(new Date().toTimeString())
    let changedFiles: string[] = []
    if (tokens.length > 0) {
      const prefix = core.getInput('tokenPrefix')
      const suffix = core.getInput('tokenSuffix')
      changedFiles = await replaceTokensInFile(files, tokens, prefix, suffix)
      //output result
      for (const file of changedFiles) {
        core.info(`Replaced tokens in file: ${file}.`)
      }
    } else {
      core.warning('No tokens were provided.')
    }
    // Set outputs for other workflow steps to use
    core.setOutput('changedFiles', changedFiles)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

function resolveFilesArray(inputName: string): string[] {
  let files =
    core.getInput(inputName, {
      required: true
    }) || ''
  files = files.replace('\\', '\\\\')
  if (files.trim().startsWith('[')) {
    return JSON.parse(files)
  }

  return [files]
}

async function resolveInputTokens(): Promise<Token[]> {
  const tokenFiles = resolveFilesArray('tokenValueFiles')
  const environment = core.getInput('environment')
  const gitHubToken = core.getInput('repo-token')
  let tokens: Token[] = []

  // Read tokens from files
  if (tokenFiles && tokenFiles.length > 0 && tokenFiles[0] !== '') {
    core.debug(new Date().toTimeString())
    core.info('read tokens from files')
    for (const file of tokenFiles) {
      const fileTokens = await readTokensFromFile(file)
      tokens = combineTokens(tokens, fileTokens)
    }
  }

  // Read tokens from environment
  if (environment !== '' && gitHubToken !== '') {
    core.debug(new Date().toTimeString())
    core.info('read tokens from environment variables')
    const envTokens = await loadTokensFromEnvironment(environment, gitHubToken)
    tokens = combineTokens(tokens, envTokens)
  } else if (environment !== '' && gitHubToken === '') {
    core.setFailed(
      'When environment is provided the GitHub token must be provided to read tokens from environment.'
    )
  }

  return tokens
}

async function readTokensFromFile(fileName: string): Promise<Token[]> {
  const tokenFileContent = await fs.readFile(fileName, 'utf8')
  return JSON.parse(tokenFileContent) as Token[]
}

export async function loadTokensFromEnvironment(
  environment: string,
  repoToken: string
): Promise<Token[]> {
  const octoKit = getOctokit(repoToken)
  let pageNumber = 1
  const tokens: Token[] = []

  const repoId = (
    await octoKit.rest.repos.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
  ).data.id
  const listEnvVariablesResult = ''
  do {
    const listEnvVariablesResult =
      await octoKit.rest.actions.listEnvironmentVariables({
        repository_id: repoId,
        environment_name: environment,
        page: pageNumber,
        per_page: 30,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })
    listEnvVariablesResult.data.variables.forEach(variable => {
      const variableName = variable.name
      const variableValue = variable.value
      const newEnvToken = { key: variableName, value: variableValue } as Token
      tokens.push(newEnvToken)
    })
    pageNumber++
  } while (listEnvVariablesResult != '')
  return tokens
}
