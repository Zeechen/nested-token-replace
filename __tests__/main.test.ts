/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import * as main from '../src/main'
import { promises as fs } from 'fs'

// Mock the action's main function
const runMock = jest.spyOn(main, 'run')

// Other utilities
const timeRegex = /^\d{2}:\d{2}:\d{2}/

// Mock the GitHub Actions core library
let debugMock: jest.SpiedFunction<typeof core.debug>
let errorMock: jest.SpiedFunction<typeof core.error>
let warningMock: jest.SpiedFunction<typeof core.warning>
let infoMock: jest.SpiedFunction<typeof core.info>
let getInputMock: jest.SpiedFunction<typeof core.getInput>
let setFailedMock: jest.SpiedFunction<typeof core.setFailed>
let setOutputMock: jest.SpiedFunction<typeof core.setOutput>
let getOctokitMock: jest.SpiedFunction<typeof getOctokit>
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'owner', repo: 'repo' }
  },
  getOctokit: jest.fn()
}))
describe('replace tokens from environment variables', () => {
  let mockOctokit: any
  beforeEach(async () => {
    jest.clearAllMocks()

    debugMock = jest.spyOn(core, 'debug').mockImplementation()
    errorMock = jest.spyOn(core, 'error').mockImplementation()
    warningMock = jest.spyOn(core, 'warning').mockImplementation()
    infoMock = jest.spyOn(core, 'info').mockImplementation()
    getInputMock = jest.spyOn(core, 'getInput').mockImplementation()
    setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
    setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()

    mockOctokit = {
      rest: {
        repos: { get: jest.fn() },
        actions: {
          listEnvironmentVariables: jest.fn()
        }
      }
    }
    ;(getOctokit as jest.Mock).mockReturnValue(mockOctokit)
    await fs.writeFile('test.txt', 'hello #{token1}#', 'utf8')
    await fs.writeFile('test1.txt', 'hello #{token2}#', 'utf8')
  })

  it('should set output fail if no github token', async () => {
    getInputMock.mockImplementation(name => {
      switch (name) {
        case 'tokenPrefix':
          return '#{'
        case 'tokenSuffix':
          return '}#'
        case 'tokenValueFiles':
          return ''
        case 'files':
          return '["test.txt"]'
        case 'environment':
          return 'DEV'
        case 'repo-token':
          return ''
        default:
          return ''
      }
    })

    await main.run()
    expect(runMock).toHaveReturned()

    expect(setFailedMock).toHaveBeenNthCalledWith(
      1,
      'When environment is provided the GitHub token must be provided to read tokens from environment.'
    )
    expect(errorMock).not.toHaveBeenCalled()
  })

  it('should replace tokens in multiple files with environment variables', async () => {
    getInputMock.mockImplementation(name => {
      switch (name) {
        case 'tokenPrefix':
          return '#{'
        case 'tokenSuffix':
          return '}#'
        case 'tokenValueFiles':
          return ''
        case 'files':
          return '["test.txt", "test1.txt"]'
        case 'environment':
          return 'DEV'
        case 'repo-token':
          return 'z$C&F)J@NcRfUjXn2r5u8x/A?D*G-KaP'
        default:
          return ''
      }
    })
    mockOctokit.rest.repos.get.mockReturnValue({ data: { id: 123 } })
    mockOctokit.rest.actions.listEnvironmentVariables.mockReturnValue({
      data: {
        variables: [
          { name: 'token1', value: 'test' },
          { name: 'token2', value: 'Mr #{token1}#' }
        ]
      }
    })
    await main.run()
    expect(runMock).toHaveReturned()

    //Verify the result is correct
    const content = await fs.readFile('test.txt', 'utf8')
    expect(content).toBe('hello test')

    const content1 = await fs.readFile('test1.txt', 'utf8')
    expect(content1).toBe('hello Mr test')

    //Verify that all of the core library functions were called correctly
    expect(infoMock).toHaveBeenNthCalledWith(
      1,
      'read tokens from environment variables'
    )

    expect(infoMock).toHaveBeenNthCalledWith(
      2,
      'Replaced tokens in file: test.txt.'
    )
    expect(infoMock).toHaveBeenNthCalledWith(
      3,
      'Replaced tokens in file: test1.txt.'
    )
    expect(setOutputMock).toHaveBeenCalled()
    expect(errorMock).not.toHaveBeenCalled()

    expect(setOutputMock).toHaveBeenNthCalledWith(1, 'changedFiles', [
      'test.txt',
      'test1.txt'
    ])
  })
})
describe('replace tokens from token files', () => {
  beforeEach(async () => {
    jest.clearAllMocks()

    debugMock = jest.spyOn(core, 'debug').mockImplementation()
    errorMock = jest.spyOn(core, 'error').mockImplementation()
    warningMock = jest.spyOn(core, 'warning').mockImplementation()
    infoMock = jest.spyOn(core, 'info').mockImplementation()
    getInputMock = jest.spyOn(core, 'getInput').mockImplementation()
    setFailedMock = jest.spyOn(core, 'setFailed').mockImplementation()
    setOutputMock = jest.spyOn(core, 'setOutput').mockImplementation()

    await fs.writeFile('test.txt', 'hello #{token1}#', 'utf8')
    await fs.writeFile('test1.txt', 'hello #{token2}#', 'utf8')
  })

  beforeAll(async () => {
    await fs.writeFile(
      'token1.tkconf',
      '[{ "key": "token1", "value": "test"} ]',
      'utf8'
    )
    await fs.writeFile(
      'token2.tkconf',
      '[{ "key": "token2", "value": "Mr #{token1}#"} ]',
      'utf8'
    )
  })

  it('should set output fail if no file', async () => {
    getInputMock.mockImplementation(name => {
      switch (name) {
        case 'tokenPrefix':
          return '#{'
        case 'tokenSuffix':
          return '}#'
        case 'tokenValueFiles':
          return ''
        case 'files':
          return '[]'
        case 'environment':
          return ''
        case 'repo-token':
          return ''
        default:
          return ''
      }
    })

    await main.run()
    expect(runMock).toHaveReturned()

    expect(setFailedMock).toHaveBeenNthCalledWith(
      1,
      'No files were provided to replace tokens in.'
    )
    expect(errorMock).not.toHaveBeenCalled()
  })

  it('replace token on single file', async () => {
    // Set the action's inputs as return values from core.getInput()
    getInputMock.mockImplementation(name => {
      switch (name) {
        case 'tokenPrefix':
          return '#{'
        case 'tokenSuffix':
          return '}#'
        case 'tokenValueFiles':
          return 'token1.tkconf'
        case 'files':
          return 'test.txt'
        case 'environment':
          return ''
        case 'repo-token':
          return ''
        default:
          return ''
      }
    })

    await main.run()
    expect(runMock).toHaveReturned()

    //Verify the result is correct
    const content = await fs.readFile('test.txt', 'utf8')
    expect(content).toBe('hello test')

    //Verify that all of the core library functions were called correctly
    expect(infoMock).toHaveBeenNthCalledWith(1, 'read tokens from files')

    expect(infoMock).toHaveBeenNthCalledWith(
      2,
      'Replaced tokens in file: test.txt.'
    )
    expect(setOutputMock).toHaveBeenCalled()
    expect(errorMock).not.toHaveBeenCalled()

    expect(setOutputMock).toHaveBeenNthCalledWith(1, 'changedFiles', [
      'test.txt'
    ])
  })

  it('replace token on multiple files', async () => {
    // Set the action's inputs as return values from core.getInput()
    getInputMock.mockImplementation(name => {
      switch (name) {
        case 'tokenPrefix':
          return '#{'
        case 'tokenSuffix':
          return '}#'
        case 'tokenValueFiles':
          return '[ "token1.tkconf", "token2.tkconf" ]'
        case 'files':
          return '[ "test.txt", "test1.txt" ]'
        case 'environment':
          return ''
        case 'repo-token':
          return ''
        default:
          return ''
      }
    })

    await main.run()
    expect(runMock).toHaveReturned()

    //Verify the result is correct
    const content = await fs.readFile('test.txt', 'utf8')
    expect(content).toBe('hello test')

    const content1 = await fs.readFile('test1.txt', 'utf8')
    expect(content1).toBe('hello Mr test')

    //Verify that all of the core library functions were called correctly
    expect(infoMock).toHaveBeenNthCalledWith(1, 'read tokens from files')

    expect(infoMock).toHaveBeenNthCalledWith(
      2,
      'Replaced tokens in file: test.txt.'
    )
    expect(infoMock).toHaveBeenNthCalledWith(
      3,
      'Replaced tokens in file: test1.txt.'
    )
    expect(setOutputMock).toHaveBeenCalled()
    expect(errorMock).not.toHaveBeenCalled()

    expect(setOutputMock).toHaveBeenNthCalledWith(1, 'changedFiles', [
      'test.txt',
      'test1.txt'
    ])
  })

  // it('sets a failed status', async () => {
  //   // Set the action's inputs as return values from core.getInput()
  //   getInputMock.mockImplementation(name => {
  //     switch (name) {
  //       case 'milliseconds':
  //         return 'this is not a number'
  //       default:
  //         return ''
  //     }
  //   })

  //   await main.run()
  //   expect(runMock).toHaveReturned()

  //   // Verify that all of the core library functions were called correctly
  //   expect(setFailedMock).toHaveBeenNthCalledWith(
  //     1,
  //     'milliseconds not a number'
  //   )
  //   expect(errorMock).not.toHaveBeenCalled()
  // })
})
