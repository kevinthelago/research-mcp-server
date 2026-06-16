import PQueue from 'p-queue'
import type { SourceAdapter as RetrievalAdapter, SourceResult } from '../../contracts/search'
import type { UnifiedRecord } from '../../models/record'
import type { NormalizedId } from '../../util/identifiers'
import type { FetchParams, ResolveParams, SearchParams, SourceAdapter } from '../index'
import { fetchJson } from '../utils/http'

const BASE_URL = 'https://api.semanticscholar.org/graph/v1'
const FIELDS = 'paperId,title,authors,year,abstract,externalIds,publicationVenue,citationCount,openAccessPdf'

interface S2Author { authorId: string; name: string }
interface S2ExternalIds { DOI?: string; ArXiv?: string; PubMed?: string }
interface S2Venue { name?: string }
interface S2OpenAccess { url?: string }

interface S2Paper {
  paperId: string
  title: string
  authors?: S2Author[]
  year?: number
  abstract?: string
  externalIds?: S2ExternalIds
  publicationVenue?: S2Venue
  citationCount?: number
  openAccessPdf?: S2OpenAccess
}

interface S2SearchResponse { data?: S2Paper[] }

function paperToRecord(paper: S2Paper): UnifiedRecord {
  return {
    ids: {
      s2Id: paper.paperId,
      doi: paper.externalIds?.DOI,
      arxivId: paper.externalIds?.ArXiv,
      pmid: paper.externalIds?.PubMed,
    },
    title: paper.title,
    authors: paper.authors?.map((a) => a.name) ?? [],
    abstract: paper.abstract,
    venue: paper.publicationVenue?.name,
    year: paper.year,
    citationCount: paper.citationCount,
    openAccessPdfUrl: paper.openAccessPdf?.url,
    sources: ['semantic-scholar'],
  }
}

function recordToSourceResult(rec: UnifiedRecord): SourceResult {
  return {
    metadata: {
      title: rec.title,
      authors: rec.authors,
      year: rec.year,
      doi: rec.ids.doi,
      arxivId: rec.ids.arxivId,
      pmid: rec.ids.pmid,
      abstract: rec.abstract,
      journal: rec.venue,
    },
    ...(rec.openAccessPdfUrl != null ? { openAccessPdfUrl: rec.openAccessPdfUrl } : {}),
  }
}

export class SemanticScholarAdapter implements SourceAdapter, RetrievalAdapter {
  readonly name = 'semantic-scholar'
  private queue: PQueue
  private headers: Record<string, string>

  constructor(apiKey?: string) {
    const rate = apiKey ? 10 : 1
    this.queue = new PQueue({ concurrency: 1, intervalCap: rate, interval: 1000 })
    this.headers = apiKey ? { 'x-api-key': apiKey } : {}
  }

  /** Retrieval contract: fetch by NormalizedId */
  async fetch(id: NormalizedId): Promise<SourceResult | null>
  /** Search stream interface: fetch by flexible params */
  async fetch(params: FetchParams): Promise<UnifiedRecord | null>
  async fetch(idOrParams: NormalizedId | FetchParams): Promise<SourceResult | UnifiedRecord | null> {
    if ('type' in idOrParams) {
      const id = idOrParams as NormalizedId
      let paperId: string | undefined
      if (id.type === 'doi') paperId = `DOI:${id.canonical}`
      else if (id.type === 'arxiv') paperId = `ARXIV:${id.canonical}`
      else if (id.type === 'pmid') paperId = `PMID:${id.canonical}`
      if (!paperId) return null
      const rec = await this.fetchByS2Id(paperId)
      return rec ? recordToSourceResult(rec) : null
    }
    // Search stream path
    const params = idOrParams as FetchParams
    let paperId: string | undefined
    if (params.s2Id) paperId = params.s2Id
    else if (params.doi) paperId = `DOI:${params.doi}`
    else if (params.arxivId) paperId = `ARXIV:${params.arxivId}`
    else if (params.pmid) paperId = `PMID:${params.pmid}`
    if (!paperId) return null
    return this.fetchByS2Id(paperId)
  }

  async search(params: SearchParams): Promise<UnifiedRecord[]> {
    const { query, limit = 10, offset = 0 } = params
    const url = new URL(`${BASE_URL}/paper/search`)
    url.searchParams.set('query', query)
    url.searchParams.set('fields', FIELDS)
    url.searchParams.set('limit', String(Math.min(limit, 100)))
    url.searchParams.set('offset', String(offset))

    return this.queue.add(async () => {
      try {
        const json = await fetchJson<S2SearchResponse>(url.toString(), { headers: this.headers })
        return (json.data ?? []).map(paperToRecord)
      } catch {
        return []
      }
    }) as Promise<UnifiedRecord[]>
  }

  async resolve(params: ResolveParams): Promise<UnifiedRecord | null> {
    if (params.doi) {
      const rec = await this.fetchByS2Id(`DOI:${params.doi}`)
      return rec
    }
    if (params.title) {
      const results = await this.search({ query: params.title, limit: 1 })
      return results[0] ?? null
    }
    if (params.rawRef) {
      const results = await this.search({ query: params.rawRef, limit: 1 })
      return results[0] ?? null
    }
    return null
  }

  private async fetchByS2Id(paperId: string): Promise<UnifiedRecord | null> {
    const url = `${BASE_URL}/paper/${encodeURIComponent(paperId)}?fields=${FIELDS}`
    return this.queue.add(async () => {
      try {
        const paper = await fetchJson<S2Paper>(url, { headers: this.headers })
        return paperToRecord(paper)
      } catch {
        return null
      }
    }) as Promise<UnifiedRecord | null>
  }
}
