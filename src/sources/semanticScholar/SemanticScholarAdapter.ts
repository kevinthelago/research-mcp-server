import PQueue from 'p-queue'
import type { UnifiedRecord } from '../../models/record.js'
import type { FetchParams, ResolveParams, SearchParams, SourceAdapter } from '../index.js'
import { fetchWithRetry } from '../utils/http.js'

const BASE_URL = 'https://api.semanticscholar.org/graph/v1'
const FIELDS = 'paperId,title,authors,year,abstract,externalIds,publicationVenue,citationCount,openAccessPdf'

interface S2Author {
  authorId: string
  name: string
}

interface S2ExternalIds {
  DOI?: string
  ArXiv?: string
  PubMed?: string
  CorpusId?: number
}

interface S2Venue {
  name?: string
}

interface S2OpenAccess {
  url?: string
}

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

interface S2SearchResponse {
  data?: S2Paper[]
}

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

export class SemanticScholarAdapter implements SourceAdapter {
  readonly name = 'semantic-scholar'
  private queue: PQueue
  private headers: Record<string, string>

  constructor(apiKey?: string) {
    const rate = apiKey ? 10 : 1
    this.queue = new PQueue({ concurrency: 1, intervalCap: rate, interval: 1000 })
    this.headers = apiKey ? { 'x-api-key': apiKey } : {}
  }

  async search(params: SearchParams): Promise<UnifiedRecord[]> {
    const { query, limit = 10, offset = 0 } = params
    const url = new URL(`${BASE_URL}/paper/search`)
    url.searchParams.set('query', query)
    url.searchParams.set('fields', FIELDS)
    url.searchParams.set('limit', String(Math.min(limit, 100)))
    url.searchParams.set('offset', String(offset))

    return this.queue.add(async () => {
      const res = await fetchWithRetry(url.toString(), { headers: this.headers })
      if (res.status === 404) return []
      const json = (await res.json()) as S2SearchResponse
      return (json.data ?? []).map(paperToRecord)
    }) as Promise<UnifiedRecord[]>
  }

  async fetch(params: FetchParams): Promise<UnifiedRecord | null> {
    let paperId: string | undefined

    if (params.s2Id) paperId = params.s2Id
    else if (params.doi) paperId = `DOI:${params.doi}`
    else if (params.arxivId) paperId = `ARXIV:${params.arxivId}`
    else if (params.pmid) paperId = `PMID:${params.pmid}`

    if (!paperId) return null

    const url = `${BASE_URL}/paper/${encodeURIComponent(paperId)}?fields=${FIELDS}`

    return this.queue.add(async () => {
      const res = await fetchWithRetry(url, { headers: this.headers })
      if (res.status === 404) return null
      const paper = (await res.json()) as S2Paper
      return paperToRecord(paper)
    }) as Promise<UnifiedRecord | null>
  }

  async resolve(params: ResolveParams): Promise<UnifiedRecord | null> {
    if (params.doi) return this.fetch({ doi: params.doi })
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
}
