import { execFile } from 'node:child_process'
import path from 'node:path'

const GIT_TIMEOUT_MS = 8000
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout)
        reject(Object.assign(error, { stderr }))
      },
    )
  })
}

/**
 * Returns the text of a file in the last commit of its repository.
 *
 * @throws Error If git is not installed, the file is not in a repository, or the last commit has no such file.
 */
export async function committedText(file: string): Promise<string> {
  const folder = path.dirname(file)
  try {
    // `git show HEAD:./name` reads the path relative to the working folder of the command.
    return await run(['-C', folder, 'show', `HEAD:./${path.basename(file)}`])
  } catch (error) {
    const code = (error as { code?: unknown }).code
    const raw = (error as { stderr?: unknown }).stderr
    const stderr = typeof raw === 'string' ? raw : ''
    if (code === 'ENOENT') throw new Error('Git is not installed, or it is not on the PATH.', { cause: error })
    if (/not a git repository/i.test(stderr)) throw new Error('This file is not in a git repository.', { cause: error })
    if (/does not exist|exists on disk, but not in/i.test(stderr)) {
      throw new Error('The last commit has no version of this file.', { cause: error })
    }
    if (/bad revision|unknown revision|ambiguous argument 'HEAD'/i.test(stderr)) {
      throw new Error('The repository has no commit yet.', { cause: error })
    }
    throw new Error(stderr.trim() || 'Git could not read the last commit.', { cause: error })
  }
}
