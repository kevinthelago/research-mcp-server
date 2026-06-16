import PQueue from 'p-queue'
import type { UnifiedRecord } from '../../models/record.js'
import type { FetchParams, ResolveParams, SearchParams, SourceAdapter } from '../index.js'
import { fetchWithRetry } from '../utils/http.js'

const BASE_URL = 'https://api.crossref.org'
const POLITE_UA = 'research-mcp/0.1.0 (mailto:kevinthelago@gmail.com)'

interface CrossrefDateParts {
  'date-parts': number[][]
}

interface CrossrefAuthor {
  given?: string
  family?: string
  name?: string
}

interface CrossrefWork {
  DOI?: string
  title?: string[]
  author?: CrossrefAuthor[]
  issued?: CrossrefDateParts
  'container-title'?: string[]
  'event'?: { name?: string }
  'is-referenced-by-count'?: number
  URL?: string
  abstract?: string
}

interface CrossrefResponse {
  message?: CrossrefWork
}

interface CrossrefListResponse {
  message?: {
    items?: CrossrefWork[]
  }
}

function workToRecord(work: CrossrefWork): UnifiedRecord {
  const authorStr = (work.author ?? []).map((a) => {
    if (a.name) return a.name
    return [a.given, a.family].filter(Boolean).join(' ')
  })

  const year =
    work.issued?.['date-parts']?.[0]?.[0] ??
    undefined

  return {
    ids: {
      doi: work.DOI?.toLowerCase(),
    },
    title: work.title?.[0] ?? '',
    authors: authorStr,
    abstract: work.abstract,
    venue: work['container-title']?.[0] ?? work.event?.name,
    year,
    url: work.URL,
    citationCount: work['is-referenced-by-count'],
    sources: ['crossref'],
  }
}

export class CrossrefAdapter implements SourceAdapter {
  readonly name = 'crossref'
  private queue: PQueue
  private requestHeaders: Record<string, string>

  constructor() {
    this.queue = new PQueue({ concurrency: 1, intervalCap: 1, interval: 1000 })
    this.requestHeaders = { 'User-Agent': POLITE_UA }
  }

  async search(params: SearchParams): Promise<UnifiedRecord[]> {
    const { query, limit = 10, offset = 0, yearFrom, yearTo } = params
    const url = new URL(`${BASE_URL}/works`)
    url.searchParams.set('query.bibliographic', query)
    url.searchParams.set('rows', String(Math.min(limit, 1000)))
    url.searchParams.set('offset', String(offset))
    if (yearFrom ?? yearTo) {
      const filters: string[] = []
      if (yearFrom) filters.push(`from-pub-date:${yearFrom}`)
      if (yearTo) filters.push(`until-pub-date:${yearTo}`)
      url.searchParams.set('filter', filters.join(','))
    }

    return this.queue.add(async () => {
      const res = await fetchWithRetry(url.toString(), { headers: this.requestHeaders })
      if (res.status === 404) return []
      const json = (await res.json()) as CrossrefListResponse
      return (json.message?.items ?? []).map(workToRecord)
    }) as Promise<UnifiedRecord[]>
  }

  async fetch(params: FetchParams): Promise<UnifiedRecord | null> {
    if (!params.doi) return null

    const url = `${BASE_URL}/works/${encodeURIComponent(params.doi)}`

    return this.queue.add(async () => {
      const res = await fetchWithRetry(url, { headers: this.requestHeaders })
      if (res.status === 404) return null
      const json = (await res.json()) as CrossrefResponse
      if (!json.message) return null
      return workToRecord(json.message)
    }) as Promise<UnifiedRecord | null>
  }

  async resolve(params: ResolveParams): Promise<UnifiedRecord | null> {
    if (params.doi) return this.fetch({ doi: params.doi })

    const url = new URL(`${BASE_URL}/works`)
    url.searchParams.set('rows', '1')

    if (params.title) {
      url.searchParams.set('query.bibliographic', params.title)
      if (params.authors?.[0]) {
        url.searchParams.set('query.author', params.authors[0])
      }
    } else if (params.rawRef) {
      url.searchParams.set('query.bibliographic', params.rawRef)
    } else {
      return null
    }

    return this.queue.add(async () => {
      const res = await fetchWithRetry(url.toString(), { headers: this.requestHeaders })
      if (res.status === 404) return null
      const json = (await res.json()) as CrossrefListResponse
      const first = json.message?.items?.[0]
      return first ? workToRecord(first) : null
    }) as Promise<UnifiedRecord | null>
  }
}
