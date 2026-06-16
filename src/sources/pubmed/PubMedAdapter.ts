import PQueue from 'p-queue'
import type { SourceAdapter as RetrievalAdapter, SourceResult } from '../../contracts/search'
import type { UnifiedRecord } from '../../models/record'
import type { NormalizedId } from '../../util/identifiers'
import type { FetchParams, ResolveParams, SearchParams, SourceAdapter } from '../index'
import { fetchJson } from '../utils/http'

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const TOOL = 'research-mcp'
const EMAIL = 'kevinthelago@gmail.com'

interface ESearchResult { esearchresult?: { idlist?: string[] } }
interface ESummaryArticleId { idtype: string; value: string }
interface ESummaryAuthor { name: string }
interface ESummaryDoc {
  uid: string
  title?: string
  authors?: ESummaryAuthor[]
  pubdate?: string
  source?: string
  fulljournalname?: string
  articleids?: ESummaryArticleId[]
}
interface ESummaryResult { result?: Record<string, ESummaryDoc | string[]> }

function buildParams(extra: Record<string, string> = {}): string {
  return new URLSearchParams({ tool: TOOL, email: EMAIL, ...extra }).toString()
}

function summaryToRecord(doc: ESummaryDoc): UnifiedRecord {
  const doi = doc.articleids?.find((a) => a.idtype === 'doi')?.value
  const pmcid = doc.articleids?.find((a) => a.idtype === 'pmc')?.value
  return {
    ids: {
      pmid: doc.uid,
      doi,
      pmcid: pmcid ? `PMC${pmcid}` : undefined,
    },
    title: doc.title ?? '',
    authors: doc.authors?.map((a) => a.name) ?? [],
    year: doc.pubdate ? parseInt(doc.pubdate.slice(0, 4), 10) : undefined,
    venue: doc.fulljournalname ?? doc.source,
    sources: ['pubmed'],
  }
}

function recordToSourceResult(rec: UnifiedRecord): SourceResult {
  return {
    metadata: {
      title: rec.title,
      authors: rec.authors,
      year: rec.year,
      doi: rec.ids.doi,
      pmid: rec.ids.pmid,
      pmcid: rec.ids.pmcid,
      journal: rec.venue,
    },
  }
}

export class PubMedAdapter implements SourceAdapter, RetrievalAdapter {
  readonly name = 'pubmed'
  private queue: PQueue

  constructor(apiKey?: string) {
    const rate = apiKey ? 10 : 3
    this.queue = new PQueue({ concurrency: 1, intervalCap: rate, interval: 1000 })
  }

  /** Retrieval contract: fetch by NormalizedId */
  async fetch(id: NormalizedId): Promise<SourceResult | null>
  /** Search stream interface: fetch by flexible params */
  async fetch(params: FetchParams): Promise<UnifiedRecord | null>
  async fetch(idOrParams: NormalizedId | FetchParams): Promise<SourceResult | UnifiedRecord | null> {
    if ('type' in idOrParams) {
      const id = idOrParams as NormalizedId
      if (id.type === 'pmid') {
        const records = await this.fetchSummaries([id.canonical])
        const rec = records[0] ?? null
        return rec ? recordToSourceResult(rec) : null
      }
      if (id.type === 'pmcid') {
        const results = await this.search({ query: `${id.canonical}[pmcid]`, limit: 1 })
        const rec = results[0] ?? null
        return rec ? recordToSourceResult(rec) : null
      }
      if (id.type === 'doi') {
        const results = await this.search({ query: `${id.canonical}[doi]`, limit: 1 })
        const rec = results[0] ?? null
        return rec ? recordToSourceResult(rec) : null
      }
      return null
    }
    // Search stream path
    const params = idOrParams as FetchParams
    if (params.pmid) {
      const records = await this.fetchSummaries([params.pmid])
      return records[0] ?? null
    }
    if (params.pmcid) {
      const results = await this.search({ query: `${params.pmcid}[pmcid]`, limit: 1 })
      return results[0] ?? null
    }
    if (params.doi) {
      const results = await this.search({ query: `${params.doi}[doi]`, limit: 1 })
      return results[0] ?? null
    }
    return null
  }

  async search(params: SearchParams): Promise<UnifiedRecord[]> {
    const { query, limit = 10, offset = 0 } = params
    const searchUrl =
      `${BASE_URL}/esearch.fcgi?` +
      buildParams({ db: 'pubmed', term: query, retmode: 'json', retmax: String(limit), retstart: String(offset) })

    const ids = await this.queue.add(async () => {
      const json = await fetchJson<ESearchResult>(searchUrl)
      return json.esearchresult?.idlist ?? []
    }) as string[]

    if (!ids || ids.length === 0) return []
    return this.fetchSummaries(ids)
  }

  async resolve(params: ResolveParams): Promise<UnifiedRecord | null> {
    if (params.doi) {
      const results = await this.search({ query: `${params.doi}[doi]`, limit: 1 })
      return results[0] ?? null
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

  private async fetchSummaries(ids: string[]): Promise<UnifiedRecord[]> {
    const summaryUrl =
      `${BASE_URL}/esummary.fcgi?` +
      buildParams({ db: 'pubmed', id: ids.join(','), retmode: 'json' })

    return this.queue.add(async () => {
      const json = await fetchJson<ESummaryResult>(summaryUrl)
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
