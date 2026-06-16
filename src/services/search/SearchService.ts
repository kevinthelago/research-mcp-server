import type { UnifiedRecord } from '../../models/record.js'
import type { SourceAdapter, SearchParams } from '../../sources/index.js'
import { dedupeAndMerge } from '../../sources/utils/dedupe.js'

export interface QueryCache {
  get(key: string): UnifiedRecord[] | undefined
  set(key: string, records: UnifiedRecord[], ttlMs: number): void
}

interface CacheEntry {
  records: UnifiedRecord[]
  expiresAt: number
}

export class MemoryCache implements QueryCache {
  private store = new Map<string, CacheEntry>()

  get(key: string): UnifiedRecord[] | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.records
  }

  set(key: string, records: UnifiedRecord[], ttlMs: number): void {
    this.store.set(key, { records, expiresAt: Date.now() + ttlMs })
  }
}

export interface SearchOptions {
  query: string
  sources?: string[]
  limit?: number
  offset?: number
  yearFrom?: number
  yearTo?: number
  cacheTtlMs?: number
}

export interface SourceResult {
  source: string
  status: 'ok' | 'error'
  error?: string
  count: number
}

export interface SearchResult {
  records: UnifiedRecord[]
  sourceResults: SourceResult[]
  total: number
}

function cacheKey(opts: SearchOptions): string {
  const { cacheTtlMs: _ttl, ...rest } = opts
  const sorted = Object.fromEntries(
    Object.entries(rest)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  )
  return JSON.stringify(sorted)
}

export class SearchService {
  private cache: QueryCache

  constructor(
    private readonly adapters: SourceAdapter[],
    cache?: QueryCache,
  ) {
    this.cache = cache ?? new MemoryCache()
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const { limit = 10, offset = 0, cacheTtlMs = 5 * 60 * 1000 } = options
    const key = cacheKey(options)

    const cached = this.cache.get(key)
    if (cached) {
      const page = cached.slice(offset, offset + limit)
      return {
        records: page,
        sourceResults: [],
        total: cached.length,
      }
    }

    const activeAdapters = options.sources
      ? this.adapters.filter((a) => options.sources!.includes(a.name))
      : this.adapters

    const searchParams: SearchParams = {
      query: options.query,
      limit,
      ...(options.yearFrom !== undefined ? { yearFrom: options.yearFrom } : {}),
      ...(options.yearTo !== undefined ? { yearTo: options.yearTo } : {}),
    }

    const settled = await Promise.allSettled(
      activeAdapters.map((a) => a.search(searchParams).then((recs) => ({ name: a.name, recs }))),
    )

    const sourceResults: SourceResult[] = []
    const allRecords: UnifiedRecord[] = []

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        sourceResults.push({
          source: result.value.name,
          status: 'ok',
          count: result.value.recs.length,
        })
        allRecords.push(...result.value.recs)
      } else {
        const adapter = activeAdapters[settled.indexOf(result)]
        sourceResults.push({
          source: adapter?.name ?? 'unknown',
          status: 'error',
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          count: 0,
        })
      }
    }

    const deduped = dedupeAndMerge(allRecords)
    this.cache.set(key, deduped, cacheTtlMs)

    const page = deduped.slice(offset, offset + limit)
    return { records: page, sourceResults, total: deduped.length }
  }
}
