import { XMLParser } from 'fast-xml-parser'
import PQueue from 'p-queue'
import type { SourceAdapter as RetrievalAdapter, SourceResult } from '../../contracts/search'
import type { UnifiedRecord } from '../../models/record'
import type { NormalizedId } from '../../util/identifiers'
import type { FetchParams, ResolveParams, SearchParams, SourceAdapter } from '../index'
import { fetchText } from '../utils/http'

const BASE_URL = 'https://export.arxiv.org/api/query'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['entry', 'author'].includes(name),
})

interface ArxivAuthor {
  name: string
}

interface ArxivLink {
  '@_title'?: string
  '@_href'?: string
}

interface ArxivEntry {
  id: string
  title: string
  summary?: string
  author?: ArxivAuthor[]
  published?: string
  'arxiv:doi'?: string
  'arxiv:journal_ref'?: string
  link?: ArxivLink | ArxivLink[]
}

interface ArxivFeed {
  entry?: ArxivEntry[]
}

interface ParsedXml {
  feed?: ArxivFeed
}

function extractArxivId(idUrl: string): string {
  const match = /abs\/([^v]+)/.exec(idUrl)
  return match?.[1] ?? idUrl
}

function entryToRecord(entry: ArxivEntry): UnifiedRecord {
  const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : []
  const pdfLink = links.find((l) => l['@_title'] === 'pdf')
  const authors =
    entry.author?.map((a) => a.name).filter((n): n is string => Boolean(n)) ?? []

  return {
    ids: {
      arxivId: extractArxivId(entry.id),
      doi: entry['arxiv:doi'],
    },
    title: entry.title.replace(/\s+/g, ' ').trim(),
    authors,
    abstract: entry.summary?.trim(),
    venue: entry['arxiv:journal_ref'],
    year: entry.published ? parseInt(entry.published.slice(0, 4), 10) : undefined,
    url: `https://arxiv.org/abs/${extractArxivId(entry.id)}`,
    openAccessPdfUrl: pdfLink?.['@_href'],
    sources: ['arxiv'],
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
      abstract: rec.abstract,
      journal: rec.venue,
      url: rec.url,
    },
    ...(rec.openAccessPdfUrl != null ? { openAccessPdfUrl: rec.openAccessPdfUrl } : {}),
  }
}

export class ArxivAdapter implements SourceAdapter, RetrievalAdapter {
  readonly name = 'arxiv'
  private queue: PQueue

  constructor() {
    this.queue = new PQueue({ concurrency: 1, intervalCap: 3, interval: 1000 })
  }

  /** Retrieval contract: fetch by NormalizedId */
  async fetch(id: NormalizedId): Promise<SourceResult | null>
  /** Search stream interface: fetch by flexible params */
  async fetch(params: FetchParams): Promise<UnifiedRecord | null>
  async fetch(idOrParams: NormalizedId | FetchParams): Promise<SourceResult | UnifiedRecord | null> {
    // Retrieval contract path: NormalizedId has `type` property
    if ('type' in idOrParams) {
      const id = idOrParams as NormalizedId
      if (id.type === 'arxiv') {
        const rec = await this.fetchByArxivId(id.canonical)
        return rec ? recordToSourceResult(rec) : null
      }
      if (id.type === 'doi') {
        const results = await this.search({ query: `doi:${id.canonical}`, limit: 1 })
        const rec = results[0] ?? null
        return rec ? recordToSourceResult(rec) : null
      }
      return null
    }
    // Search stream path
    const params = idOrParams as FetchParams
    if (params.arxivId) return this.fetchByArxivId(params.arxivId)
    if (params.doi) {
      const results = await this.search({ query: `doi:${params.doi}`, limit: 1 })
      return results[0] ?? null
    }
    return null
  }

  async search(params: SearchParams): Promise<UnifiedRecord[]> {
    const { query, limit = 10, offset = 0 } = params
    let searchQuery = `all:${encodeURIComponent(query)}`
    if (params.yearFrom != null || params.yearTo != null) {
      const from = params.yearFrom ?? 1900
      const to = params.yearTo ?? 2100
      searchQuery += `+AND+submittedDate:[${from}0101+TO+${to}1231]`
    }
    const url = `${BASE_URL}?search_query=${searchQuery}&start=${offset}&max_results=${limit}`

    return this.queue.add(async () => {
      const text = await fetchText(url)
      return this.parseEntries(text)
    }) as Promise<UnifiedRecord[]>
  }

  async resolve(params: ResolveParams): Promise<UnifiedRecord | null> {
    if (params.doi) {
      const results = await this.search({ query: `doi:${params.doi}`, limit: 1 })
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

  private async fetchByArxivId(arxivId: string): Promise<UnifiedRecord | null> {
    const url = `${BASE_URL}?id_list=${encodeURIComponent(arxivId)}`
    return this.queue.add(async () => {
      const text = await fetchText(url)
      const entries = this.parseEntries(text)
      return entries[0] ?? null
    }) as Promise<UnifiedRecord | null>
  }

  private parseEntries(xml: string): UnifiedRecord[] {
    const parsed = parser.parse(xml) as ParsedXml
    const entries = parsed.feed?.entry ?? []
    return entries.map(entryToRecord)
  }
}
