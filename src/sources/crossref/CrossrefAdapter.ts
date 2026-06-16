import PQueue from 'p-queue'
import type { SourceAdapter as RetrievalAdapter, SourceResult } from '../../contracts/search'
import type { UnifiedRecord } from '../../models/record'
import type { NormalizedId } from '../../util/identifiers'
import type { FetchParams, ResolveParams, SearchParams, SourceAdapter } from '../index'
import { fetchJson } from '../utils/http'

const BASE_URL = 'https://api.crossref.org'
const POLITE_UA = 'research-mcp/0.1.0 (mailto:kevinthelago@gmail.com)'

interface CrossrefDateParts { 'date-parts': number[][] }
interface CrossrefAuthor { given?: string; family?: string; name?: string }
interface CrossrefWork {
  DOI?: string
  title?: string[]
  author?: CrossrefAuthor[]
  issued?: CrossrefDateParts
  'container-title'?: string[]
  event?: { name?: string }
  'is-referenced-by-count'?: number
  URL?: string
  abstract?: string
}
interface CrossrefResponse { message?: CrossrefWork }
interface CrossrefListResponse { message?: { items?: CrossrefWork[] } }

function workToRecord(work: CrossrefWork): UnifiedRecord {
  const authors = (work.author ?? []).map((a) => {
    if (a.name) return a.name
    return [a.given, a.family].filter(Boolean).join(' ')
  })
  const year = work.issued?.['date-parts']?.[0]?.[0]
  return {
    ids: { doi: work.DOI?.toLowerCase() },
    title: work.title?.[0] ?? '',
    authors,
    abstract: work.abstract,
    venue: work['container-title']?.[0] ?? work.event?.name,
    year,
    url: work.URL,
    citationCount: work['is-referenced-by-count'],
    sources: ['crossref'],
  }
}

function recordToSourceResult(rec: UnifiedRecord): SourceResult {
  return {
    metadata: {
      title: rec.title,
      authors: rec.authors,
      year: rec.year,
      doi: rec.ids.doi,
      abstract: rec.abstract,
      journal: rec.venue,
      url: rec.url,
    },
  }
}

export class CrossrefAdapter implements SourceAdapter, RetrievalAdapter {
  readonly name = 'crossref'
  private queue: PQueue
  private opts: { headers: Record<string, string> }

  constructor() {
    this.queue = new PQueue({ concurrency: 1, intervalCap: 1, interval: 1000 })
    this.opts = { headers: { 'User-Agent': POLITE_UA } }
  }

  /** Retrieval contract: fetch by NormalizedId */
  async fetch(id: NormalizedId): Promise<SourceResult | null>
  /** Search stream interface: fetch by flexible params */
  async fetch(params: FetchParams): Promise<UnifiedRecord | null>
  async fetch(idOrParams: NormalizedId | FetchParams): Promise<SourceResult | UnifiedRecord | null> {
    if ('type' in idOrParams) {
      const id = idOrParams as NormalizedId
      if (id.type !== 'doi') return null
      const rec = await this.fetchByDoi(id.canonical)
      return rec ? recordToSourceResult(rec) : null
    }
    const params = idOrParams as FetchParams
    if (!params.doi) return null
    return this.fetchByDoi(params.doi)
  }

  async search(params: SearchParams): Promise<UnifiedRecord[]> {
    const { query, limit = 10, offset = 0, yearFrom, yearTo } = params
    const url = new URL(`${BASE_URL}/works`)
    url.searchParams.set('query.bibliographic', query)
    url.searchParams.set('rows', String(Math.min(limit, 1000)))
    url.searchParams.set('offset', String(offset))
    if (yearFrom != null || yearTo != null) {
      const filters: string[] = []
      if (yearFrom != null) filters.push(`from-pub-date:${yearFrom}`)
      if (yearTo != null) filters.push(`until-pub-date:${yearTo}`)
      url.searchParams.set('filter', filters.join(','))
    }

    return this.queue.add(async () => {
      try {
        const json = await fetchJson<CrossrefListResponse>(url.toString(), this.opts)
        return (json.message?.items ?? []).map(workToRecord)
      } catch {
        return []
      }
    }) as Promise<UnifiedRecord[]>
  }

  async resolve(params: ResolveParams): Promise<UnifiedRecord | null> {
    if (params.doi) return this.fetchByDoi(params.doi)

    const url = new URL(`${BASE_URL}/works`)
    url.searchParams.set('rows', '1')

    if (params.title) {
      url.searchParams.set('query.bibliographic', params.title)
      if (params.authors?.[0]) url.searchParams.set('query.author', params.authors[0])
    } else if (params.rawRef) {
      url.searchParams.set('query.bibliographic', params.rawRef)
    } else {
      return null
    }

    return this.queue.add(async () => {
      try {
        const json = await fetchJson<CrossrefListResponse>(url.toString(), this.opts)
        const first = json.message?.items?.[0]
        return first ? workToRecord(first) : null
      } catch {
        return null
      }
    }) as Promise<UnifiedRecord | null>
  }

  private async fetchByDoi(doi: string): Promise<UnifiedRecord | null> {
    const url = `${BASE_URL}/works/${encodeURIComponent(doi)}`
    return this.queue.add(async () => {
      try {
        const json = await fetchJson<CrossrefResponse>(url, this.opts)
        if (!json.message) return null
        return workToRecord(json.message)
      } catch {
        return null
      }
    }) as Promise<UnifiedRecord | null>
  }
}
