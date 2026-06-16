import PQueue from 'p-queue'
import type { UnifiedRecord } from '../../models/record.js'
import type { FetchParams, ResolveParams, SearchParams, SourceAdapter } from '../index.js'
import { fetchWithRetry } from '../utils/http.js'

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const TOOL = 'research-mcp'
const EMAIL = 'kevinthelago@gmail.com'

interface ESearchResult {
  esearchresult?: {
    idlist?: string[]
  }
}

interface ESummaryArticleId {
  idtype: string
  value: string
}

interface ESummaryAuthor {
  name: string
}

interface ESummaryDoc {
  uid: string
  title?: string
  authors?: ESummaryAuthor[]
  pubdate?: string
  source?: string
  fulljournalname?: string
  articleids?: ESummaryArticleId[]
}

interface ESummaryResult {
  result?: Record<string, ESummaryDoc | string[]>
}

function buildParams(extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ tool: TOOL, email: EMAIL, ...extra })
  return p.toString()
}

function summaryToRecord(doc: ESummaryDoc): UnifiedRecord {
  const doi = doc.articleids?.find((a) => a.idtype === 'doi')?.value
  return {
    ids: {
      pmid: doc.uid,
      doi,
    },
    title: doc.title ?? '',
    authors: doc.authors?.map((a) => a.name) ?? [],
    year: doc.pubdate ? parseInt(doc.pubdate.slice(0, 4), 10) : undefined,
    venue: doc.fulljournalname ?? doc.source,
    sources: ['pubmed'],
  }
}

export class PubMedAdapter implements SourceAdapter {
  readonly name = 'pubmed'
  private queue: PQueue

  constructor(apiKey?: string) {
    const rate = apiKey ? 10 : 3
    this.queue = new PQueue({ concurrency: 1, intervalCap: rate, interval: 1000 })
  }

  async search(params: SearchParams): Promise<UnifiedRecord[]> {
    const { query, limit = 10, offset = 0 } = params
    const searchUrl =
      `${BASE_URL}/esearch.fcgi?` +
      buildParams({
        db: 'pubmed',
        term: query,
        retmode: 'json',
        retmax: String(limit),
        retstart: String(offset),
      })

    const ids = await this.queue.add(async () => {
      const res = await fetchWithRetry(searchUrl)
      const json = (await res.json()) as ESearchResult
      return json.esearchresult?.idlist ?? []
    })

    if (!ids || ids.length === 0) return []
    return this.fetchSummaries(ids)
  }

  async fetch(params: FetchParams): Promise<UnifiedRecord | null> {
    if (params.pmid) {
      const results = await this.fetchSummaries([params.pmid])
      return results[0] ?? null
    }
    if (params.doi) {
      const results = await this.search({ query: `${params.doi}[doi]`, limit: 1 })
      return results[0] ?? null
    }
    return null
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

  private async fetchSummaries(ids: string[]): Promise<UnifiedRecord[]> {
    const summaryUrl =
      `${BASE_URL}/esummary.fcgi?` +
      buildParams({
        db: 'pubmed',
        id: ids.join(','),
        retmode: 'json',
      })

    return this.queue.add(async () => {
      const res = await fetchWithRetry(summaryUrl)
      const json = (await res.json()) as ESummaryResult
      if (!json.result) return []

      return ids
        .map((id) => {
          const doc = json.result![id]
          if (!doc || Array.isArray(doc)) return null
          return summaryToRecord(doc)
        })
        .filter((r): r is UnifiedRecord => r !== null)
    }) as Promise<UnifiedRecord[]>
  }
}
