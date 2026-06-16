function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchWithRetry(
  url: string,
  opts?: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let res: Response
    try {
      res = await fetch(url, opts)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      await sleep(Math.min(1000 * 2 ** attempt, 30_000))
      continue
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '10', 10)
      await sleep((Number.isFinite(retryAfter) ? retryAfter : 10) * 1000)
      continue
    }

    if (res.status >= 500) {
      lastError = new Error(`HTTP ${res.status} from ${url}`)
      await sleep(Math.min(1000 * 2 ** attempt, 30_000))
      continue
    }

    return res
  }
  throw lastError ?? new Error(`Failed after ${maxRetries} retries: ${url}`)
}
