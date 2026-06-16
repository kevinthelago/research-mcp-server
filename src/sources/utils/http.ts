import { guardedFetch, FetchError, type FetchOptions, type FetchResult } from '../../util/fetcher'

export type { FetchOptions, FetchResult }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function is429(err: FetchError): boolean {
  return err.code === 'HTTP_ERROR' && err.message.includes('HTTP 429')
}

function is5xx(err: FetchError): boolean {
  return err.code === 'HTTP_ERROR' && /HTTP 5\d\d/.test(err.message)
}

export async function fetchBuffer(
  url: string,
  opts?: FetchOptions,
  maxRetries = 3,
): Promise<FetchResult> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await guardedFetch(url, opts)
    } catch (err) {
      if (err instanceof FetchError && (is429(err) || is5xx(err))) {
        lastError = err
        const delay = is429(err) ? 10_000 : Math.min(1000 * 2 ** attempt, 30_000)
        await sleep(delay)
        continue
      }
      throw err
    }
  }
  throw lastError ?? new Error(`Failed after ${maxRetries} retries: ${url}`)
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const result = await fetchBuffer(url, opts)
  return result.body.toString('utf-8')
}

export async function fetchJson<T>(url: string, opts?: FetchOptions): Promise<T> {
  const result = await fetchBuffer(url, opts)
  return JSON.parse(result.body.toString('utf-8')) as T
}
